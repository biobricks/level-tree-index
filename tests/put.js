var base = require('./common/base.js');
var tape = require('tape');

tape('put', function(t) {
  t.plan(2)
  base(function(err, db, tree, cb) {
    tree.put('5', {parentKey: '2', name: 'hmm'}, function(err) {
      tree.getFromPath('foo.bar.hmm', function(err, key, value) {
        if(err) t.fail("mysterious failure A: " + err)

        t.equal(key, "5", "key")

        t.deepEqual(value,{
          parentKey: '2',
          name: 'hmm'
        }, "value")
      });
    })
  })
})
