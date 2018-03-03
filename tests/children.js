var base = require('./common/base.js');
var tape = require('tape');

tape('children', function(t) {
    t.plan(1)
    base(function(err, db, tree, cb) {
        if(err) t.fail("mysterious failure A: " + err)
        tree.children('foo', function(err, children) {
            if(err) t.fail("mysterious failure B: " + err)
            t.deepEqual(children,[{
                value: { parentKey: '1', name: 'bar' },
                path: 'foo.bar',
                key: '2'
            },{
                value: { parentKey: '2', name: 'baz' },
                path: 'foo.bar.baz',
                key: '3' 
            },{
                value: { parentKey: '1', name: 'cat' },
                path: 'foo.cat',
                key: '4'
            }],"objects as expected")
            cb()
            t.end()
        })
    })
})
