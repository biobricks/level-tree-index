
function cleanup(err) {
  if(err) {
    console.error(err);
  }
}

module.exports = function(cb, opts) {

var sublevel = require('subleveldown');
var memdb = require('memdb');

var uuid = require('uuid').v4;
var rawdb = memdb();
var db = sublevel(rawdb, 'd', {valueEncoding: 'json'});
var idb = sublevel(rawdb, 'i');
var treeIndexer = require('../../index.js');

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

  var o;
  o = {name: "foo"};
  if(opts.uniquefy) o.unique = uuid();

  tree.put('1', o, function(err, path) {
    if(err) return cb(err);
    
    o = {parentKey: '1', name: opts.barname};
    if(opts.uniquefy) o.unique = uuid();

    tree.put('2', o, function(err) {
      if(err) return cb(err);
      
      o = {parentKey: '2', name: "baz"};
      if(opts.uniquefy) o.unique = uuid();

      tree.put('3', o, function(err) {
        if(err) return cb(err);

        o = {parentKey: '1', name: "cat"};
        if(opts.uniquefy) o.unique = uuid();

        tree.put('4', o, function(err) {
          if(err) return cb(err);
          
          cb(err, db, tree, cleanup, path);
          
        });
      });
    });
  })
};
