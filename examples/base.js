
function cleanup(err) {
  if(err) {
    console.error(err);
  }
}

module.exports = function(cb) {

var sublevel = require('subleveldown');
var memdb = require('memdb');

var rawdb = memdb();
var db = sublevel(rawdb, 'd', {valueEncoding: 'json'});
var idb = sublevel(rawdb, 'i');
var treeIndexer = require('../index.js');

var tree = treeIndexer(db, idb, {
  sep: '.'
});

/*
 
Builds the structure:

foo
--bar
----baz
--cat

and then gets a stream of the child-paths of foo

*/

  tree.put('1', {name: "foo"}, function(err) {
    if(err) return cb(err);
    
    tree.put('2', {parentKey: '1', name: "bar"}, function(err) {
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
