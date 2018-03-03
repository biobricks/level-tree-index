
var crypto = require('crypto');
var through = require('through2');
var from = require('from2');
var sublevel = require('subleveldown');
var xtend = require('xtend');
var bufferReplace = require('buffer-replace');
var bufferSplit = require('buffer-split');
var changes = require('level-changes');
var async = require('async');
var util = require('util');
var levelup = require('levelup');
var batchlevel = require('batchlevel');
var AbstractLevelDOWN = require('abstract-leveldown').AbstractLevelDOWN;

// hash an operation
function hash(type, key, value) {

  // yes sha256 is slow but really not much slower than any other hash in node
  // https://github.com/hex7c0/nodejs-hash-performance
  var h = crypto.createHash('sha256');
  
  h.update(type);
  h.update(key);
  if(value) {
    if(typeof value === 'object' && !Buffer.isBuffer(value)) {
      h.update(JSON.stringify(value));
    } else {
      h.update(value);
    }
  }

  return h.digest('base64');
}

function concat(a, b) {
  if(typeof a === 'string') {
    if(typeof b !== 'string') b = b.toString();
    return a + b;
  }
  if(Buffer.isBuffer(a)) {
    if(!Buffer.isBuffer(b)) b = new Buffer(b);
    return Buffer.concat([a, b])
  }
  throw new Error("concat() called for something that's neither string nor buffer");
}

// get lte key from a key
// as seen here: https://gist.github.com/loveencounterflow/cb0b76c9d5d0b64137b0
function lteKey(key) {
  var b;
  if(typeof key === 'string') {  
    b = new Buffer(key + '~');
    b[b.length-1] = 0xff;
  } else if(Buffer.isBuffer(key)) {
    b = Buffer.concat([key, new Buffer([0xff])]);
  } else {
    throw new Error("lteKey called for something that's neither string nor buffer");
  }
  return b;
}

// Join an array of either buffers or strings with the optional seperator
// Output type (buffer or string) will be based on type of first array element
// unless array is of zero length in which case output type is based on sep type
// Seperator can be a string or a buffer
function join(a, sep) {
  if(a.length <= 0) {
    if(Buffer.isBuffer(sep)) return new Buffer('');
    return '';
  }

  if(typeof a[0] === 'string') {
    if(Buffer.isBuffer(sep)) sep = sep.toString();
    return a.join(sep);
  }
  if(!Buffer.isBuffer(sep)) sep = new Buffer(sep);

  var b = [];
  var i;
  for(i=0; i < a.length; i++) {
    b.push(a[i]);
    if(i >= a.length - 1) continue;
    if(!sep || sep.length <= 0) continue;
    b.push(sep);
  }

  return Buffer.concat(b);
}

function split(a, sep) {

  if(typeof a === 'string') {

    if(typeof sep !== 'string') sep = sep.toString();
    return a.split(sep);
  } else if(Buffer.isBuffer(a)) {

    if(!Buffer.isBuffer(sep)) sep = new Buffer(sep);
    return bufferSplit(a, sep);
  }

  throw new Error("I can only split strings and buffers");
}

function replace(a, b, c) {
  if(typeof a === 'string') return a.replace(b, c);
  if(Buffer.isBuffer(a)) {
    c = c || new Buffer('');
    return bufferReplace(a, b, c);
  }
  throw new Error("replace() only supports string and buffer types but called for value:" + a);
}

// resolve a path like ['foo', 'bar', 'baz']
// to return the value of obj.foo.bar.baz
// or undefined if that path does not exist
function resolvePropPath(obj, path) {

  if(path.length > 1) {
    if(!obj[path[0]]) return undefined;

    return resolvePropPath(obj[path[0]], path.slice(1, path.length));
  }

  if(path.length === 1) {
    return obj[path[0]];
  }

  return undefined;
}

function treeIndexer(db, idb, opts) {
  opts = xtend({
    pathProp: 'name', // property used to construct the path
    parentProp: 'parentKey', // property that references key of parent
    uniquefy: false, // add uuid to end of pathProp to ensure uniqueness
    uniqProp: 'unique', // property used for uniqueness
    sep: 0x1f, // path separator (default is the ascii "unit separator")
    uniqSep: 0x1e, // if uniquefy is truthy separates pathProp and uuid
    pathArray: false, // output the path as an array
    listen: true, // listen for changes on db and update index automatically
    levelup: false // if true, return a levelup wrapper
  }, opts || {});

  if(!(this instanceof treeIndexer)) {
    if(!opts.levelup) {
      return new treeIndexer(db, idb, opts);
    }
    var tree = new treeIndexer(db, idb, opts);
    return tree.levelup();
  }

  this.opts = opts;

  if(this.opts.sep.length < 1) throw new Error("Patah seperator cannot be zero length");

  if(typeof this.opts.sep === 'number') {
    this.opts.sep = String.fromCharCode(this.opts.sep);
  }

  if(typeof this.opts.uniqSep === 'number') {
    this.opts.uniqSep = String.fromCharCode(this.opts.uniqSep);
  }

  if(this.opts.uniqSep.length != 1) throw new Error("End seperator must be one character long");

  // TODO we're not actually using batchlevel
  this.db = db;
  this.bdb = batchlevel(idb);
  this.idb = sublevel(idb, 'i'); // the index db
  this.rdb = sublevel(idb, 'r'); // the reverse lookup db

  if(this.opts.listen && !this.opts.levelup) {
    this.c = changes(this.db);
    this.c.on('data', function(change) {
      if(this._shouldIgnore(change)) return;
      if(change.type === 'put') {
        this._onPut(change.key, change.value);
      } else { // del
        this._onDel(change.key);
      }
    }.bind(this));
  }    

  this._ignoreList = {};
  this._ignoreCount = 0;

  // Ignore the next time this operation occurs.
  // Used by this._put, this._del and this._batch
  this._ignore = function(type, key, value) {
    var h = hash(type, key, value);
    if(this._ignoreList[h]) {
      this._ignoreList[h]++;
    } else {
      this._ignoreList[h] = 1;
    }
    this._ignoreCount++;
  };

  // check if we should ignore this operation
  // and remove from ignore list
  this._shouldIgnore = function(op) {

    if(this._ignoreCount <= 0) return;
    var h = hash(op.type, op.key, op.value);

    if(this._ignoreList[h]) {
      if(this._ignoreList[h] === 1) {
        delete this._ignoreList[h];
      } else {
        this._ignoreList[h]--;
      }
      this._ignoreCount--;
      return true;
    }
    return false;
  };

  this._resolvePropPath = function(value, pathOrFunc) {
    if(typeof pathOrFunc === 'function') return pathOrFunc(value);

    if(typeof pathOrFunc === 'string') {
      return resolvePropPath(value, pathOrFunc.split('.'));
    }
    
    if(pathOrFunc instanceof Array) {
      return resolvePropPath(value, pathOrFunc);
    }

    throw new Error("Value must be string, array or function");
  };
  
  this._getParentKey = function(val) {
    return this._resolvePropPath(val, this.opts.parentProp);
  };

  this._getPathPart = function(val) {
    var part = this._resolvePropPath(val, this.opts.pathProp);
    // remove path separator from the name
    if(part.indexOf(this.opts.sep) >= 0) {
      part = replace(part, this.opts.sep, '');
    }

    if(this.opts.uniquefy) {

      // remove end separator from the name
      if(part.indexOf(this.opts.uniqSep) >= 0) {
        part = replace(part, this.opts.uniqSep, '');
      }

      // TODO support buffers
      part = part + this.opts.uniqSep + this._resolvePropPath(val, this.opts.uniqProp);
    }
    return part;
  };

  this._ignoreInput = function(key, value) {
    if(typeof this.opts.ignore === 'function') {
      if(this.opts.ignore(key, value)) {
        return true;
      }
    }
    return false;
  };

  this._ignoreOutput = function(opts, data) {
    if(typeof opts.ignore === 'function') {
      if(opts.ignore(data)) {
        return true;
      }
    }
    return false;
  };

  this._onPut = function(key, value, cb) {
    cb = cb || function(){};

    if(this._ignoreInput(key, value)) return cb();

    var self = this;
    this._buildPath(value, function(err, path) {
      if(err) return cb(err);

      // was this a move? (does it already exist in index?
      self.rdb.get(key, function(revErr, data) {
        if(revErr && !revErr.notFound) return cb(revErr)

        self.idb.put(path, key, function(err) {
          if(err) return cb(err);
          self.rdb.put(key, path, function(err) {
            if(err) return cb(err);
            
            // if there was no reverse lookup entry then this was a new put
            // so we are done
            if(revErr && revErr.notFound) {

              if(!self.opts.uniquefy) return self.bdb.write(cb);

              self.bdb.write(function(err) {
                if(err) return cb(err);

                cb(null, path);
              });
              return;
            }
            
            var prevPath = data;
            
            // don't delete if it didn't move
            if(prevPath === path) { 
              if(!self.opts.uniquefy) return self.bdb.write(cb);

              self.bdb.write(function(err) {
                if(err) return cb(err);

                cb(null, path);
              });
              return;
            }
            // this was a move so we need to delete the previous entry in idb
            self.idb.del(prevPath, function(err) {
              if(err) return cb(err);
              
              // since it was a move there may be children and grandchildren
              self._moveChildren(prevPath, path, function(err) {
                if(err) return cb(err);
                
                if(!self.opts.uniquefy) return self.bdb.write(cb);

                self.bdb.write(function(err) {
                  if(err) return cb(err);

                  cb(null, path);
                });
                return;
              });
            });
          })
        });
      });
    });
  };
  
  this._onDel = function(key, cb) {
    cb = cb || function(){};

    var self = this;

    this.rdb.get(key, function(err, path) {
      if(err) return cb(err);;
      
      self.idb.del(path, function(err) {
        if(err) return cb(err);

        self.rdb.del(key, function(err) {          
          if(err) return cb(err);

          var newPath;
          if(Buffer.isBuffer(path)) {
            newPath = new Buffer();
          } else {
            newPath = '';
          }
          
          // move children to be root nodes
          self._moveChildren(path, newPath, function(err) {
            if(err) return cb(err);

            self.bdb.write(cb);
          });
        });
      });
    });
  };

  // get stream of all children, grand-children, etc.
  this._childStream = function(parentPath) {
    if(!parentPath || parentPath.length <= 0) return this.idb.createReadStream();

    return this.idb.createReadStream({
      gt: concat(parentPath, this.opts.sep),
      lte: this.lteKey(concat(parentPath, this.opts.sep))
    });
  };

  // update the tree indexes of all descendants (children, grand-children, etc.)
  // based on the old and new path of a parent
  this._moveChildren = function(oldPath, newPath, cb) {
    cb = cb || function(){};

    if(oldPath === newPath) {
      process.nextTick(cb);
      return;
    }

    var s = this._childStream(oldPath);

    var oldChildPath;
    var newChildPath;
    s.on('data', function(data) {

      oldChildPath = data.key;
      newChildPath = replace(data.key, oldPath, newPath);
      this.idb.put(newChildPath, data.value);
      this.rdb.put(data.value, newChildPath);
      this.idb.del(oldChildPath);

    }.bind(this));

    s.on('end', function(err) {
      cb();
    });
    
    s.on('error', function(err) {
      cb(err);
    })
  };

  // TODO 
  // we should be able to get the depths just by separator count
  // instead of actually splitting
  this._pathDepth = function(path) {
    return split(path, this.opts.sep).length;
  };


  // Takes a value as input and builds its path by recursively
  // looking up the parent key
  // We could look up the path of the parent in the index itself,
  // which would be faster since it's only one operation, but then 
  // e.g. adding an object and then immediately adding a child
  // could fail since the index is built asynchronously in parallel
  // with the put operation for the parent, so the path for
  // the parent may not have been built by the time the child
  // path needs to be built.
  this._buildPath = function(value, path, cb, seen) {
    if(typeof path === 'function') {
      cb = path
      path = null;
    }
    path = path || [this._getPathPart(value)];
    seen = seen || [];

    var parentKey = this._getParentKey(value);

    if(!parentKey) return cb(null, join(path.reverse(), this.opts.sep));

    // loop avoidance
    var i;
    for(i=0; i < seen.length; i++) {
      if(seen[i] === parentKey) return cb(new Error("loop detected"));
    }
    seen.push(parentKey);

    this.db.get(parentKey, function(err, value) {
      if(err) return cb(err);

      var pathPart = this._getPathPart(value);
      if(!pathPart) return cb(new Error("Object "+parentKey+" is missing its pathProp"))

      path.push(pathPart);
      this._buildPath(value, path, cb, seen);
      
    }.bind(this));
  }

  this.lteKey = lteKey;

  // clear an index (delete the index data from the db)
  this.clear = function(cb) {
    cb = cb || function(){};

    var self = this;

    // delete entire index
    var s = self.idb.createReadStream();
    s.pipe(through.obj(function(data, enc, next) {
      self.idb.del(data.key, function() {
        next();
      });
    }, function() {
      // delete entire reverse lookup index
      var rs = self.rdb.createReadStream();
      rs.pipe(through.obj(function(data, enc, next) {
        self.rdb.del(data.key, function() {
          next();
        });
      }, function() {
        cb();
      }));

      rs.on('error', function(err) {
        return cb(err);
      });
    }));

    s.on('error', function(err) {
      return cb(err);
    });

  };

  // build an index from scratch for existing contents of the db
  this.build = function(cb) {
    cb = cb || function(){};

    var self = this;

    var s = this.db.createReadStream();
    s.on('data', function(data) {
      self._onPut(data.key, data.value);
    });

    s.on('error', function(err) {
      cb(err);
    });

    s.on('end', function() {
      cb();
    });
  };


  // clear and then build an index from scratch for existing contents of the db
  this.rebuild = function(cb) {
    cb = cb || function() {}
    this.clear(function(err) {
      if(err) return cb(err);

      this.build(cb);
    }.bind(this));
  };


  // get key and value from tree path
  this.getFromPath = function(path, cb) {
    var self = this;

    this.idb.get(path, function(err, key) {
      if(err) return cb(err);

      self.db.get(key, function(err, value) {
        if(err) return cb(err);
        cb(null, key, value);
      });
    });
  };

  // get tree path given a key
  this.path = function(key, opts, cb) {
    if(typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    opts = opts || {};
    var self = this;

    if(opts.pathArray === undefined) {
      opts.pathArray = this.opts.pathArray;
    }    

    this.rdb.get(key, function(err, path) {
      if(err) return cb(err);
      if(opts.pathArray) {
        path = split(path, self.opts.sep);         
      }
      return cb(null, path);
    });

  };

  // get parent value given a key
  this.parent = function(key, cb) {
    var self = this;

    this.db.get(key, function(err, value) {
      if(err) return cb(err);

      var parentKey = self._getParentKey(value);

      if(parentKey === undefined) return cb(null, undefined);

      self.db.get(parentKey, cb);
    });
  };

  // get parent value given a value
  this.parentFromValue = function(value, cb) {
    var parentKey = this._getParentKey(value);

    if(parentKey === undefined) return cb(null, undefined);

    this.db.get(parentKey, cb);
  };

  // get parent path given a key
  this.parentPath = function(key, opts, cb) {
    var self = this;
    if(typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    opts = opts || {};

    if(opts.pathArray === undefined) {
      opts.pathArray = this.opts.pathArray;
    }

    this.db.get(key, function(err, value) {
      if(err) return cb(err);

      self.parentPathFromValue(value, opts, cb);
    });    
  };

  // get parent path given a value
  this.parentPathFromValue = function(value, opts, cb) {
    if(typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    opts = opts || {};

    if(opts.pathArray === undefined) {
      opts.pathArray = this.opts.pathArray;
    }

    var parentKey = this._getParentKey(value);

    if(parentKey === undefined) return cb(null, undefined);
    this.rdb.get(parentKey, function(err, path) {
      if(opts.pathArray) {
        path = split(path, self.opts.sep);         
      }
      return cb(null, path);
    });
  };

  // get parent value given a path
  this.parentFromPath = function(path, cb) {
    var parentPath = this.parentPathFromPath(path);
    if(parentPath === undefined) return cb(null, undefined, undefined);
    this.getFromPath(parentPath, cb);
  };

  // get parent path given a path
  // note: this function can be called synchronously
  this.parentPathFromPath = function(path, opts, cb) {
    if(typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    opts = opts || {};
    if(opts.pathArray === undefined) {
      opts.pathArray = this.opts.pathArray;
    }    

    var sep = this.opts.sep;
    var a, res;

    if(typeof path === 'string') {
      if(typeof sep !== 'string') sep = sep.toString();
      a = path.split(sep);

    } else if(Buffer.isBuffer(path)) {
      if(!Buffer.isBuffer(sep)) sep = new Buffer(sep);
      a = bufferSplit(path, sep);

    } else {
      var err = new Error("path must be of type string or buffer");
      if(cb) return cb(err);
      throw err;
    }

    a = a.slice(0, a.length-1);
    if(a.length > 0) {
      if(!opts.pathArray) {
        res = join(a, sep);
      } else {
        res = a;
      }
    } else {
      res = undefined;
    }
    if(cb) return cb(null, res);

    return res;
  };

  this.children = function(path, opts, cb) {
    if(typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    var a = [];

    var s = this.stream(path, opts);

    s.on('data', function(data) {
      a.push(data);
    });

    s.on('end', function() {
      cb(null, a);
    });

    s.on('error', function(err) {
      cb(err);
    });
  };
  
  this.childrenFromKey = function(key, opts, cb) {
    if(typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    
    var self = this;
    this.path(key, function(err, path) {
      if(err) return cb(err);

      self.children(path, opts, cb)
    });
  };

  this.siblings = function(value, cb) {
    // TODO
  };  

  this.siblingsFromKey = function(key, cb) {
    // TODO
  };
  

  // check if descendant is a descendant of ancestor
  // ancestor and descendant are full paths to each element
  this._isDescendantOf = function(ancestor, descendant) {
    if(descendant.indexOf(ancestor) === 0) {
      return true;
    }
    return false;
  };

  // used by this._match to keep track of parents of the current node
  this._curAncestors = [];
  
  this._match = function(opts, path, o, pushCb) {

    var i, cur;
    if(opts.matchAncestors) {
      // loop through saved ancestors
      // removing the ones that aren't ancestors of the current element
      for(i=this._curAncestors.length-1; i >= 0; i--) {
        cur = this._curAncestors[i];
        if(!this._isDescendantOf(cur.path, path)) {
          this._curAncestors.pop();
        }
      }
    }

    if(opts.match(path, o)) { 

      // this was a match, so all ancestors of this element
      // which have not already been pushed to the stream
      // should now be pushed
      if(opts.matchAncestors) {
        // push all saved ancestors into stream in order
        for(i=0; i < this._curAncestors.length; i++) {
          pushCb(this._curAncestors[i].o);
        }
        // clear ancestors since we never want them to be streamed twice
        this._curAncestors = [];
      }
      return true;
    }

    // this wasn't a match but maybe it will turn out to be
    // an ancestor of a future match, so remember it
    if(opts.matchAncestors) {
      this._curAncestors.push({
        o: o,
        path: path
      });
    }
    return false
  };

  this.parentStream = function(path, opts) {
    opts = xtend({
      height: 0, // how many (grand)parent up to go. 0 means infinite
      includeCurrent: true, // include the node specified by path in the stream 
      paths: true, // output the path for each child
      keys: true, // output the key for each child
      values: true, // output the value for each child
      // if more than one of paths, keys and values is true
      // then the stream will output objects with these as properties
      pathArray: undefined // output the path as an array. defaults to level-tree-index constructor opts value
    }, opts || {});

    var self = this;

    if(opts.height > 0) {
      var startDepth = this._pathDepth(path);
      var minDepth = startDepth - opts.height;
    }

    var o, depth;
    var left = path;

    if(!opts.includeCurrent) {
      left = self.parentPathFromPath(left);
    }

    return from.obj(function(size, next) {
      if(!left) return next(null, null);

      if(opts.height) {
        depth = self._pathDepth(left);
        if(depth < minDepth) return next(null, null);
      }

      if(!opts.keys && !opts.values) {
        o = left;
        left = self.parentPathFromPath(left);
        next(null, o);
        return;
      }

      self.idb.get(left, function(err, key) {
        if(err) return next(err);
        
        if(!opts.values) {
          if(opts.paths) {
            o = {
              key: key,
              path: left
            };
          } else {
            o = key;
          }

          left = self.parentPathFromPath(left);
          next(null, o);
          return;
        }

        self.db.get(key, function(err, value) {
          if(err) return next(err);

          if(opts.paths || opts.keys) {
            o = {
              value: value
            }
            if(opts.keys) o.key = key;
            if(opts.paths) o.path = left;
          } else {
            o = value;
          }

          left = self.parentPathFromPath(left);
          next(null, o);
        });
      });
    });
  };


  this.parents = function(path, opts, cb) {
    if(typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    var objs = [];
    
    var s = this.parentStream(path, opts);

    s.on('error', cb);
    s.on('end', function() {
      cb(null, objs);
    });

    s.on('data', function(data) {
      objs.push(data);
    });
  };


  this._streamHelper = function(opts) {
    
    function pushOrCB(throughSelf, path, o, cb) {
      if(opts.ignore && self._ignoreOutput(opts, o)) {
        return cb();
      }
      if(!opts.match || self._match(opts, path, o, throughSelf.push.bind(throughSelf))) {
        throughSelf.push(o);
      }
      cb();
    }
    var elements = 0;
    if(opts.keys) elements++;
    if(opts.paths) elements++;
    if(opts.nicePaths) elements++;
    if(opts.values) elements++;

    var self = this;

    if(elements == 1) {
      return function(throughSelf, key, path, value, cb) {
        if(opts.keys) {
          pushOrCB(throughSelf, path, key, cb);
        } else if(opts.paths) {
          pushOrCB(throughSelf, path, path, cb);
        } else if(opts.values) {
          pushOrCB(throughSelf, path, value, cb);
        } else {
          pushOrCB(throughSelf, path, self.nicify(path), cb);
        }
      }
    }

    return function(throughSelf, key, path, value, cb) {
      var o = {}
      if(opts.keys) o.key = key;
      if(opts.paths) o.path = path;
      if(opts.values) o.value = value;
      if(opts.nicePaths) o.nicePath = self.nicify(path);

      pushOrCB(throughSelf, path, o, cb);
    }

  };

  this.stream = function(parentPath, opts) {
    if(parentPath && (typeof parentPath === 'object') && !(parentPath instanceof Array)) {
      opts = parentPath;
      parentPath = undefined;
      if(opts && (typeof opts !== 'object' || !((opts.gt || opts.gte) && (opts.lt || opts.lte)))) {
        throw new Error("Either parentPath must be specified or opts.lt/opt.lte and opts.gt/opts.gte must both be specified");
      }
    }

    opts = xtend({
      depth: 0, // how many (grand)children deep to go. 0 means infinite
      match: null, // if a string, regex or function, only stream matched items
      matchAncestors: false, // whether to also stream all ancestors of a match
      ignore: false, // optional function that returns true for values to ignore
      paths: true, // output the path for each child
      keys: true, // output the key for each child
      values: true, // output the value for each child
      // if more than one of paths, keys and values is true
      // then the stream will output objects with these as properties
      pathArray: undefined, // output the path as an array. defaults to level-tree-index constructor opts value
      nicePaths: false, // output a copy of the path with uniquefy postfix stripped for each child
      gt: undefined, // specify gt directly, must then also specify lt or lte
      gte: undefined, // specify gte directly, must then also specify lt or lte
      lt: undefined, // specify lt directly, must then also specify gt or gte
      lte: undefined // specify lte directly, must then also specify lt or gte
    }, opts || {});
    
    if(opts.withValues) opts.withKeys = true;

    if(opts.match && opts.depth > 0) {
      opts.depth = 0;
    }

    if(opts.pathArray === undefined) {
      opts.pathArray = this.opts.pathArray;
    }

    if(opts.depth > 0) {
      var parentDepth = (parentPath) ? this._pathDepth(parentPath) : 0;
      var maxDepth = parentDepth + opts.depth;
    }

    if(opts.match) {
      this._curAncestors = [];
      // if opts.match is a string, regexp or buffer
      // convert it to a matching function
      if(typeof opts.match === 'string' || Buffer.isBuffer(opts.match)) {

        var matchQuery = opts.match;
        opts.match = function(path) {
          if(typeof path === 'object' && !Buffer.isBuffer(path)) path = path.path;
          
          if(path.indexOf(matchQuery) >= 0) {
            return true;
          }
          return false;
        }
      } else if(opts.match instanceof RegExp) {
        
        var matchQuery = opts.match;
        opts.match = function(path) {
          if(typeof path === 'object' && !Buffer.isBuffer(path)) path = path.path;
          
          if(path.match(matchQuery)) {
            return true;
          }
          return false;
        }
      }
    }

    var s;
    if(opts.gt || opts.gte || opts.lt || opts.lte) {
      var sOpts = {};
      if(opts.gt) {
        sOpts.gt = opts.gt;
      } else if(opts.gte) {
        sOpts.gte = opts.gte;
      }
      if(opts.lt) {
        sOpts.lt = opts.lt;
      } else if(opts.lte) {
        sOpts.lte = opts.lte;
      }
      s = this.idb.createReadStream(sOpts);
    } else {
      s = this._childStream(parentPath);
    }

    var self = this;
    var helper = this._streamHelper(opts);

    var depth, o;
    var out = through.obj(function(data, enc, cb) {

      var path = data.key;
      if(opts.pathArray) {
        path = split(path, self.opts.sep); 
      }
      var key = data.value;

      if(opts.depth > 0) {
        depth = self._pathDepth(path);

        if(depth <= parentDepth) return cb();
        if(depth > maxDepth) return cb();
      }
      
      if(!opts.values) {
        return helper(this, key, path, null, cb);
      }

      self.db.get(key, function(err, value) {
        if(err) return cb(err);

        return helper(this, key, path, value, cb);                

      }.bind(this));
    });

    s.pipe(out);
    return out;
  };

  this.pathStream = function(parentPath, opts) {
    opts = xtend({ // see this.stream() for opts docs
      depth: 0,
      paths: true,
      keys: false,
      values: false
    }, opts || {});

    return this.stream(parentPath, opts);
  };

  this.keyStream = function(parentPath, opts) {
    opts = xtend({ // see this.stream() for opts docs
      depth: 0,
      paths: false,
      keys: true,
      values: false
    }, opts || {});

    return this.stream(parentPath, opts);
  };

  this.valueStream = function(parentPath, opts) {
    opts = xtend({ // see this.stream() for opts docs
      depth: 0,
      paths: false,
      keys: false,
      values: true
    }, opts || {});

    return this.stream(parentPath, opts);
  };

  this.put = function(key, value, opts, cb) {
    if(typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    
    // if listening
    if(this.opts.listen) {
      if(!cb) return this.db.put(key, value, opts);
      this._ignore('put', key, value); // make listener ignore this next put
    }

    var self = this;
    this.db.put(key, value, opts, function(err) {
      if(err) return cb(err);
      self._onPut(key, value, cb);
    });
  };


  this.del = function(key, opts, cb) {
    if(typeof opts === 'function') {
      cb = opts;
      opts = {};
    }

    // if listening
    if(this.opts.listen) {    
      if(!cb) return this.db.del(key, opts);
      this._ignore('del', key); // make listener ignore this next del
    }

    var self = this;
    this.db.del(key, opts, function(err) {
      if(err) return cb(err);

      self._onDel(key, cb);
    });
  };

  this.batch = function(ops, opts, cb) {
    if(typeof opts === 'function') {
      cb = opts;
      opts = {};
    }

    // if listening
    if(this.opts.listen) {
      if(!cb) return this.db.batch(ops, opts);

      // make listener ignore these next operations
      var i, op;
      for(i=0; i < ops.length; i++) {
        op = ops[i];
        this._ignore(op.type, op.key, op.value);
      }
    }

    var self = this;
    this.db.batch(ops, opts, function(err) {
      if(err) return cb(err);

      var paths = [];

      async.eachSeries(ops, function(op, cb) {
        if(op.type === 'put') {
          self._onPut(op.key, op.value, function(err, path) {
            if(err) return cb(er);

            if(path && self.opts.uniquefy) paths.push(path);
          })
        } else { // del
          self._onDel(op.key, cb)
        }
      }, function(err) {
        if(err) return cb(err);
        
        if(!self.opts.uniquefy) return self.db.write(cb);

        self.db.write(function(err) {
          if(err) return cb(err);
          cb(null, paths);
        });
      });
    });
  };

  this.levelup = function() {
    var self = this;

    function TreeLevelDown(location, opts) {
      this.opts = opts;
      AbstractLevelDOWN.call(this, '', opts)
    }
    util.inherits(TreeLevelDown, AbstractLevelDOWN);

    TreeLevelDown.prototype._serializeKey = function(key) {
      return key;
    }

    TreeLevelDown.prototype._serializeValue = function(value) {
      return value;
    }

    TreeLevelDown.prototype._put = function(key, value, opts, cb) {
      self.db.put(key, value, opts, function(err) {
        if(err) return cb(err);

        self._onPut(key, value, cb);
      });
    };

    TreeLevelDown.prototype._del = function(key, opts, cb) {
      self.db.del(key, opts, function(err) {
        if(err) return cb(err);
        
        self._onDel(key, cb);
      });
    };

    TreeLevelDown.prototype._get = function(key, opts, cb) {
      self.db.get(key, opts, cb);
    };

    TreeLevelDown.prototype._batch = function(ops, opts, cb) {
      if(!ops) throw new Error("Chained batch form not implemented");

      self.db.batch(ops, opts, function(err) {
        if(err) return cb(err);
        
        async.each(ops, function(op, cb) {
          if(op.type === 'put') {
            self._onPut(op.key, op.value, cb)
          } else { // del
            self._onDel(op.key, cb)
          }
        }, cb);
      });
    };
    
    var dbOpts = xtend(self.db.options, {
      db: function (location) { return new TreeLevelDown(location, dbOpts) }
    });

    var db = levelup('', dbOpts)

    // Expose all public level-tree-index functions via levelup instance
    // but skip functions that would over-write the normal levelup API
    var f;
    for(f in self) {
      if(typeof self[f] !== 'function') continue;
      if(f[0] === '_') continue;
      if(db[f]) continue; // don't over-write anything

      db[f] = self[f].bind(self);
    }

    return db;
  };

  if(this.opts.uniqSep) {
    // match the postfix on a path part added by uniquefy
    this._uniqueRegex = new RegExp(this.opts.uniqSep+'.+$');
  }

  this._nicifyPart = function(pathPart) {
    return pathPart.replace(this._uniqueRegex, '');
  };

  // remove the postfix added by uniquefy from a path or path part
  this.nicify = function(path) {
    if(!path || !this.opts.uniquefy) return path;

    if(path instanceof Array) return map(this._nicifyPart.bind(this));
    return path.split(this.opts.sep).map(this._nicifyPart.bind(this)).join('.');
  };

  this.getPathName = function(val) {
    return this._getPathPart(val);
  };
}

treeIndexer.lteKey = lteKey;

module.exports = treeIndexer;

