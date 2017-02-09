
var crypto = require('crypto');
var through = require('through2');
var sublevel = require('subleveldown');
var xtend = require('xtend');
var bufferReplace = require('buffer-replace');
var bufferSplit = require('buffer-split');
var changes = require('level-changes');
var async = require('async');
var util = require('util')
var levelup = require('levelup')
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
    returnbufferSplit(a, sep);
  }

  throw new Error("I can only split strings and buffers");
}

function replace(a, b, c) {
  if(typeof key === 'string') return a.replace(b, c);
  if(Buffer.isBuffer(a)) {
    c = c || new Buffer('');
    return bufferReplace(a, b, c);
  }
  throw new Error("concat() called for something that's neither string nor buffer");
}

// resolve a path like ['foo', 'bar', 'baz']
// to return the value of obj.foo.bar.baz
// or undefined if tha path does not exist
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
    sep: '.', // path separator
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

  if(this.opts.sep.length < 1) throw new Error("Seperator cannot be zero length");

  this.db = db;
  this.idb = sublevel(idb, 'i'); // the index db
  this.rdb = sublevel(idb, 'r'); // the reverse lookup db

  if(!this.opts.levelup || !this.opts.listen) {
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
    if(part.indexOf(this.opts.pathProp) >= 0) {
      part = replace(part, this.opts.pathProp, '');
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
        
        async.parallel([function(cb) {
          self.idb.put(path, key, cb);
        }, function(cb) {
          self.rdb.put(key, path, cb);
        }], function(err) {
          if(err) return cb(err);
          
          // if there was no reverse lookup entry then this was a new put
          // so we are done
          if(revErr && revErr.notFound) return cb();
          
          // this was a move so we need to delete the previous entry in idb
          var prevPath = data;

          self.idb.del(data, function(err) {
            if(err) return cb(err);
            
            // since it was a move there may be children and grandchildren
            self._moveChildren(prevPath, path, cb);          
          })
        });
      });
    });
  };
  
  this._onDel = function(key, cb) {
    cb = cb || function(){};

    var self = this;

    if(this._shouldIgnore(key, value)) return cb();

    this.rdb.get(key, function(err, path) {
      if(err) return;
      
      async.parallel([function(cb) {
        self.idb.del(path, cb);
      }, function(cb) {
        self.rdb.del(key, cb);
      }], function(err) {
        if(err) return cb(err);

        var newPath;
        if(Buffer.isBuffer(path)) {
          newPath = new Buffer();
        } else {
          newPath = '';
        }
        
        // move children to be root nodes
        self._moveChildren(path, newPath, cb);
      });
    });
  };

  // get stream of all children, grand-children, etc.
  this._childStream = function(parentPath) {
    if(!parentPath || parentPath.length <= 0) return this.idb.createReadStream();


    return this.idb.createReadStream({
      gt: concat(parentPath, this.opts.sep),
      lte: concat(concat(parentPath, this.opts.sep), '\xff')
    });    
  };

  // update the tree indexes of all descendants (children, grand-children, etc.)
  // based on the old and new path of a parent
  this._moveChildren = function(oldPath, newPath, cb) {
    cb = cb || function(){};

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
  this.rebuild = function() {
    this.clear(function(err) {
      if(err) return;

      this.build();

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
  this.path = function(key, cb) {
    var self = this;

    this.rdb.get(path, function(err, path) {
      if(err) return cb(err);
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
  this.parentPath = function(key, cb) {
    var self = this;

    this.db.get(key, function(err, value) {
      if(err) return cb(err);

      self.parentPathFromValue(value, cb);
    });    
  };

  // get parent path given a value
  this.parentPathFromValue = function(value, cb) {
    var parentKey = this._getParentKey(value);

    if(parentKey === undefined) return cb(null, undefined);
    this.rdb.get(parentKey, cb);
  };

  // get parent value given a path
  this.parentFromPath = function(path, cb) {
    var parentPath = this.parentPathFromPath(path);
    if(parentPath === undefined) return cb(null, undefined, undefined);
    this.getFromPath(parentPath, cb);
  };

  // get parent path given a path
  // note: this function can be called synchronously
  this.parentPathFromPath = function(path, cb) {
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
      res = join(a, sep);
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
    
    this.path(key, function(err, path) {
      if(err) return cb(err);

      this.children(path, opts, cb)
    });
  };

  this.siblings = function(value, cb) {
    // TODO
  };  

  this.siblingsFromKey = function(key, cb) {
    // TODO
  };
    

  this.pathStream = function() {
    return this._childStream();
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

  this.stream = function(parentPath, opts) {
    opts = xtend({
      depth: 0, // how many (grand)children deep to go. 0 means infinite
      match: null, // if a string, regex or function, only stream matched items
      matchAncestors: false, // whether to also stream all ancestors of a match
      ignore: false, // optional function that returns true for values to ignore
      paths: true, // output the path for each child
      keys: true, // output the key for each child
      values: true // output the value for each child
      // if more than one of paths, keys and values is true
      // then the stream will output objects with these as properties
    }, opts || {});
    
    if(opts.withValues) opts.withKeys = true;

    if(opts.match && opts.depth > 0) {
      opts.depth = 0;
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

    var s = this._childStream(parentPath);

    var self = this;

    var depth, o;
    var out = through.obj(function(data, enc, cb) {

      var path = data.key;
      var key = data.value;

      if(opts.depth > 0) {
        depth = self._pathDepth(path);

        if(depth <= parentDepth) return cb();
        if(depth > maxDepth) return cb();
      }
      
      if(!opts.values) {
        if(opts.paths && opts.keys) {
          o = {
            path: path,
            key: key
          };
          if(opts.ignore && self._ignoreOutput(opts, o)) {
            return cb();
          }
          if(!opts.match || self._match(opts, path, o, this.push.bind(this))) {
            this.push(o);
          }
          return cb();
        }
        if(opts.keys) {
          if(opts.ignore && self._ignoreOutput(opts, key)) {
            return cb();
          }
          if(!opts.match || self._match(opts, path, key, this.push.bind(this))) {
            this.push(key);
          }
          return cb();
        }
        if(opts.paths) {
          if(opts.ignore && self._ignoreOutput(opts, path)) {
            return cb();
          }
          if(!opts.match || self._match(opts, path, path, this.push.bind(this))) {
            this.push(path);
          }
          return cb();
        }
      }

      self.db.get(key, function(err, value) {
        if(err) return cb(err);
        
        if(!opts.paths && !opts.keys) {
          if(opts.ignore && self._ignoreOutput(opts, value)) {
            return cb();
          }
          if(!opts.match || self._match(opts, path, value, this.push.bind(this))) {
            this.push(value);
          }
          return cb();
        }
        
        o = {
          value: value
        };
        
        if(opts.paths) {
          o.path = path;
        }
        if(opts.keys) {
          o.key = key;
        }

        if(opts.ignore && self._ignoreOutput(opts, o)) {
          return cb();
        }
        if(!opts.match || self._match(opts, path, o, this.push.bind(this))) {
          this.push(o);
        }
        return cb();
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
    if(!cb) return this.db.put(key, value, opts);
    
    // if listening, make listener ignore this next put
    if(this.opts.listen) {
      this._ignore('put', key, value);
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
    if(!cb) return this.db.del(key, opts);

    // if listening, make listener ignore this next del
    if(this.opts.listen) {    
      this._ignore('del', key, value);
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
    if(!cb) return this.db.batch(ops, opts);

    // if listening, make listener ignore these next operations
    if(this.opts.listen) {    
      var i, op;
      for(i=0; i < ops.length; i++) {
        op = ops[i];
        this._ignore(op.type, op.key, op.value);
      }
    }

    var self = this;
    this.db.batch(ops, opts, function(err) {
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
}

module.exports = treeIndexer;

