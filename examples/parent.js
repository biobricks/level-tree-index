#!/usr/bin/env node

var base = require('./base.js');

// base() creates a leveldb and a level-tree-index with some test data
// the callback deletes the database
base(function(err, db, tree, cb) {
  if(err) return cb(err);

  console.log("parent:", tree.parentPathFromPath('foo.bar.baz'));

  tree.parentFromPath('foo.bar.baz', function(err, key, value) {
    if(err) return cb(err);

    console.log("parent of baz: key:", key, "value:", value);
    
    tree.parentFromPath('foo', function(err, key, value) {
      if(err) return cb(err);
      
      console.log("parent of foo: key:", key, "value:", value);

      tree.parentPathFromValue({}, function(err, path) {
        if(err) return cb(err);

        console.log("parent path of foo:", path);

        cb();
      });
    });
  });
});

