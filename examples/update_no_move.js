#!/usr/bin/env node

var base = require('./base.js');

function printPaths(nodes) {
  var i;
  for(i=0; i < nodes.length; i++) {
    console.log(nodes[i].path);
  }
}

// base() creates a leveldb and a level-tree-index with some test data
// the callback deletes the database
base(function(err, db, tree, cb) {
  if(err) return cb(err);

  // get children of foo
  tree.children('foo', function(err, children) {
    if(err) return cb(err);
    
    console.log('--- before update ---');
    printPaths(children);
    
    tree.put('2', {parentKey: '1', name: "bar-updated"}, function(err) {
      if(err) return cb(err);
      
        // get children of foo
        tree.children('foo', function(err, children) {
          if(err) return cb(err);
      
          console.log('--- after update ---');
          printPaths(children);    
          
          cb();
        });

    });
    
  });
});
