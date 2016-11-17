
var treeIndexer = require('./index.js');

var memdb = require('memdb');
var tape = require('tape');

tape('getFromPath', function(t) {
  var db = memdb({valueEncoding: 'json'});
  var tree = treeIndexer(db, memdb())

  db.put('1', {name: "foo"}, function(err) {
    t.notOk(err, 'no err')
    
    db.put('2', {parentKey: '1', name: "bar"}, function(err) {
      t.notOk(err, 'no err')

      setTimeout(function() {
        
        tree.getFromPath('foo.bar', function(err, key, value) {
          t.notOk(err, 'no err')
          t.same(key, '2');

          t.same(value.name, 'bar');
          t.end();
        });
      }, 500);
    });
  });
});
