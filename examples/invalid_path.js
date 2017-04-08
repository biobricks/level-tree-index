#!/usr/bin/env node

/* 
  
  Check if adding the separator character in the name screws things up.

*/

var sublevel = require('subleveldown');
var memdb = require('memdb');

var rawdb = memdb();
var db = sublevel(rawdb, 'd', {valueEncoding: 'json'});
var idb = sublevel(rawdb, 'i');
var treeIndexer = require('../index.js');

var tree = treeIndexer(db, idb, {
  sep: '.' // set separator to a common printable character
});

function cleanup() {
  console.log("done");
}


function base(cb) {
  tree.put('1', {name: "foo"}, function(err) {
    if(err) return cb(err);

    // here's where we do the bad thing
    tree.put('2', {parentKey: '1', name: "bar.lol"}, function(err) {
      if(err) return cb(err);
      
      tree.put('3', {parentKey: '2', name: "baz"}, function(err) {
        if(err) return cb(err);
        
        tree.put('4', {parentKey: '1', name: "cat"}, function(err) {
          if(err) return cb(err);
          
          cb(err, db, tree, cleanup);
          
        });
      });
    });
  })
};

// base() creates a leveldb and a level-tree-index with some test data
// the callback deletes the database
base(function(err, db, tree, cb) {
  if(err) return cb(err);

  // get children of foo
  tree.children('foo', function(err, children) {
    if(err) return cb(err);
    
    console.log('before move:', children);
    
    tree.put('2', {parentKey: '1', name: "bar.moved"}, function(err) {
      if(err) return cb(err);
      
        // get children of foo
        tree.children('foo', function(err, children) {
          if(err) return cb(err);
          
          console.log('after move:', children);
          
          cb();
        });

    });
    
  });
})

