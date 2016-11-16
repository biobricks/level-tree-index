#!/usr/bin/env node

var base = require('./base.js');

// base() creates a leveldb and a level-tree-index with some test data
// the callback deletes the database
base(function(err, db, tree, cb) {
  if(err) return cb(err);

  // get children of foo
  tree.children('foo', function(err, children) {
    if(err) return cb(err);
    
    console.log('children:', children);

    cb();
  });
})

