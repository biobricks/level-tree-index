#!/usr/bin/env node

var sublevel = require('subleveldown');
var memdb = require('memdb');

var rawdb = memdb();
var db = sublevel(rawdb, 'd', {valueEncoding: 'json'});
var idb = sublevel(rawdb, 'i');
var treeIndexer = require('../index.js');

var tree = treeIndexer(db, idb);

function fail(err) {
  console.error(err);
  process.exit(1);
}

tree.put('1', {name: "foo"}, function(err) {
    if(err) fail(err);
    
  tree.put('2', {parentKey: '1', name: "bar"}, function(err) {
    if(err) fail(err);
    
    tree.put('3', {parentKey: '2', name: "baz"}, function(err) {
      if(err) fail(err);
      
      tree.put('4', {parentKey: '1', name: "cat"}, function(err) {
        if(err) fail(err);
          
        tree.getFromPath('foo.bar.baz', function(err, key, value) {
          if(err) fail(err);

          console.log("key:", key, "value:", value);
        });
      });
    });
  })
});
