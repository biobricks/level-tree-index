#!/usr/bin/env node

var base = require('./base.js');

// base() creates a leveldb and a level-tree-index with some test data

base(function(err, db, tree, cb) {
  if(err) return cb(err);

  var s = tree.pathStream('foo', {

    // ignore any path where any part of the path begins with the letter 'c'
    ignore: function(path) {
      var pathParts = path.split('.');
      var i;
      for(i=0; i < pathParts.length; i++) {
        if(pathParts[i].match(/^c/)) {
          return true;
        }
      }
      return false;
    }
  });
  s.on('data', function(path) {
    if(path === 'foo.cat') {
      console.log("Error: Ignore appears to be broken.");
    } else {
      console.log(path);
    }
  });

  s.on('end', function() {
    cb();
  });
  
  s.on('error', function(err) {
    cb(err);
  });
});

