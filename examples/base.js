
var level = require('level');
var sublevel = require('subleveldown');
var uuid = require('uuid').v4;
var fs = require('fs-extra');

var dbname = '/tmp/' + uuid();
var rawdb = level(dbname);
var db = sublevel(rawdb, 'd', {valueEncoding: 'json'});
var idb = sublevel(rawdb, 'i');
var treeIndexer = require('../index.js');

var tree = treeIndexer(db, idb);

function cleanup(err) {
  fs.removeSync(dbname);
  if(err) {
    console.error(err);
    process.exit(1);
  }
  process.exit(0);
}

module.exports = function(cb) {

/*
 
Builds the structure:

foo
--bar
----baz
--cat

and then gets a stream of the child-paths of foo

*/

  db.put('1', {name: "foo"}, function(err) {
    if(err) return cb(err);
    
    db.put('2', {parentKey: '1', name: "bar"}, function(err) {
      if(err) return cb(err);
      
      db.put('3', {parentKey: '2', name: "baz"}, function(err) {
        if(err) return cb(err);
        
        db.put('4', {parentKey: '1', name: "cat"}, function(err) {
          if(err) return cb(err);
          
          // wait for index to finish building
          setTimeout(function() {
            cb(err, db, tree, cleanup);
          }, 500);
          
        });
      });
    });
  })
};
