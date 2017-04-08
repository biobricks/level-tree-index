#!/usr/bin/env node

var sublevel = require('subleveldown');
var memdb = require('memdb');

var rawdb = memdb();
var db = sublevel(rawdb, 'd', {valueEncoding: 'json'});
var idb = sublevel(rawdb, 'i');
var treeIndexer = require('../index.js');

var treedb = treeIndexer(db, idb, {
  sep: '.',
  levelup: true,
  pathProp: function(value) {
    return JSON.parse(value).name;
  },
  parentProp: function(value) {
    return JSON.parse(value).parentKey;
  }
});

function fail(err) {
  console.error(err);
  process.exit(1);
}

treedb.put('1', {name: "foo"}, function(err) {
    if(err) fail(err);
    
  treedb.put('2', {parentKey: '1', name: "bar"}, function(err) {
    if(err) fail(err);
    
    treedb.put('3', {parentKey: '2', name: "baz"}, function(err) {
      if(err) fail(err);
      
      treedb.put('4', {parentKey: '1', name: "cat"}, function(err) {
        if(err) fail(err);
          
        treedb.getFromPath('foo.bar.baz', function(err, key, value) {
          if(err) fail(err);

          console.log("key:", key, "value:", value);
        });
      });
    });
  })
});
