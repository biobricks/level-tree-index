var base = require('./common/base.js');
var tape = require('tape');

tape('get_root', function(t) {
  t.plan(2)
  base(function(err, db, tree, cb) {
    tree.getRoot(function(err, path, key) {
      if(err) t.fail("error during getRoot: " + err)
      t.equal(path, 'foo');
      t.equal(key, '1');
    })
  })
})
