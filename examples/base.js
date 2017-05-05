
function cleanup(err) {
  if(err) {
    console.error(err);
  }
}

module.exports = function(cb,opts) {

var sublevel = require('subleveldown');
var memdb = require('memdb');

var rawdb = memdb();
var db = sublevel(rawdb, 'd', {valueEncoding: 'json'});
var idb = sublevel(rawdb, 'i');
var treeIndexer = require('../index.js');

var xtend = require('xtend');
opts = xtend({
    sep: '.',
    barname: 'bar'
}, opts || {});
var tree = treeIndexer(db, idb, opts);

/*
 
Builds the structure:

foo
--bar
----baz
--cat

*/

  tree.put('1', {name: "foo"}, function(err) {
    if(err) return cb(err);
    
    tree.put('2', {parentKey: '1', name: opts.barname}, function(err) {
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
