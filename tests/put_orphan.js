var base = require('./common/base.js');
var tape = require('tape');

tape('put', function(t) {
  t.plan(2)

  // test with orphanPath: null
  base(function(err, db, tree, cb) {
    tree.put('5', {parentKey: '99', name: 'hmm'}, function(err) {
      tree.getFromPath('orphans.hmm', function(err, key, value) {
        if(err && !err.notFound) {
          t.fail("mysterious failure A: " + err);
        }
        if(!err) {
          t.fail("no error when error was expected");
        }
      });
    })
  }, {
    orphanPath: null
  })

  // Test with orphanPath: 'my.orphans'
  base(function(err, db, tree, cb) {
    tree.put('5', {parentKey: '99', name: 'hmm'}, function(err) {

      tree.getFromPath('my.orphans.hmm', function(err, key, value) {
        if(err) t.fail("mysterious failure A: " + err)

        t.equal(key, "5", "key")

        t.deepEqual(value,{
          parentKey: '99',
          name: 'hmm'
        }, "value")
      });

    })
  }, {
    orphanPath: 'my.orphans'
  })

})
