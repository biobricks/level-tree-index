#!/usr/bin/env node

var base = require('./base.js');

// base() creates a leveldb and a level-tree-index with some test data
// the callback deletes the database
base(function(err, db, tree, cb) {
  if(err) return cb(err);

  var s = tree.pathStream('foo');
  s.on('data', function(path) {
    console.log(path);
  });

  s.on('end', function() {
    cb();
  });
  
  s.on('error', function(err) {
    cb(err);
  });
});

