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
    
    console.log('--- before move ---');
    printPaths(children);
    
    tree.put('2', {parentKey: '4', name: "bar-moved"}, function(err) {
      if(err) return cb(err);
      
      // get children of foo
      tree.children('foo', function(err, children) {
        if(err) return cb(err);
        
        console.log('--- after move 1 ---');
        printPaths(children);    
        
        tree.put('3', {parentKey: '1', name: "baz"}, function(err) {
          if(err) return cb(err);
          
          // get children of foo
          tree.children('foo', function(err, children) {
            if(err) return cb(err);
              
            console.log('--- after move 2 ---');
            printPaths(children);    
            
            cb();
            
          });
        });
      });
    });
  });
})

