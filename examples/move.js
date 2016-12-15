#!/usr/bin/env node

var base = require('./base.js');

// base() creates a leveldb and a level-tree-index with some test data
// the callback deletes the database
base(function(err, db, tree, cb) {
  if(err) return cb(err);

  // get children of bar
  tree.children('foo.bar', function(err, children) {
    if(err) return cb(err);
    
    console.log('before move:', children);
    
    
    db.put('3', {parentKey: '2', name: "baz-moved"}, function(err) {
      if(err) return cb(err);
      
      // get children of bar
      tree.children('foo.bar', function(err, children) {
        if(err) return cb(err);
        
        console.log('after move:', children);
        
        cb();
      });
    });
    
  });
})

