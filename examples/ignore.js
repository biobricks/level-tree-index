#!/usr/bin/env node

/* 
  example demonstrating the .ignore option
*/

var sublevel = require('subleveldown');
var memdb = require('memdb');

var rawdb = memdb();
var db = sublevel(rawdb, 'd', {valueEncoding: 'json'});
var idb = sublevel(rawdb, 'i');
var treeIndexer = require('../index.js');

var tree = treeIndexer(db, idb, {
  ignore: function(key, value) {
    if(typeof value === 'object') {
      if(typeof value.name === 'string') {
        if(value.name[0] === '_') {
          return true;
        }     
      }
    }
    return false;
  }
});

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
      
      tree.put('4', {parentKey: '2', name: "_baz"}, function(err) {
        if(err) fail(err);
        
        tree.getFromPath('foo.bar.baz', function(err, key, value) {
          if(err) fail(err);
          
          console.log("key:", key, "value:", value);

          tree.getFromPath('foo.bar._baz', function(err, key, value) {
            if(err) {
              console.log("as expected failed to get hidden element _baz");
            } else {
              console.log("Hmmm, something is wrong. We should have gotten an error but didn't.");
            }
          });
        });
      });
    });
  })
});
