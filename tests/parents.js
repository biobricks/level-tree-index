var base = require('./common/base.js');
var tape = require('tape');

tape('parents', function(t) {
    t.plan(1)
    base(function(err, db, tree, cb) {
        if(err) t.fail("mysterious failure A: " + err)
        tree.parents('foo.bar.baz', {
            height: 1,
            includeCurrent: false
        }, function(err, parents) {
            if(err) t.fail("mysterious failure B: " + err)
            t.deepEqual(parents,[{
                value: { parentKey: '1', name: 'bar' },
                key: '2',
                path: 'foo.bar'
            }],"parents")
        })
    })
})
