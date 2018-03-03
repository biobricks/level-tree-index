var base = require('base');
var tape = require('tape');

// TODO: opts.match could be a function or a
// buffer if the database uses buffer paths.

tape('match', function(t) {
    t.plan(2)
    base(function(err, db, tree, cb) {
        if(err) t.fail("mysterious failure A: " + err)
        tree.children(null, {
            match: 'ba',
            matchAncestors: true
        }, function(err, children) {
            if(err) t.fail("mysterious failure B: " + err)
            t.deepEqual(children,[{
                value: { name: 'foo' },
                path: 'foo',
                key: '1'
            },{
                value: { parentKey: '1', name: 'bar' },
                path: 'foo.bar',
                key: '2'
            },{
                value: { parentKey: '2', name: 'baz' },
                path: 'foo.bar.baz',
                key: '3'
            }],"object as expected: children with matchAncestors true")
        })
        tree.children(null, {
            match: 'ba',
            matchAncestors: false
        }, function(err, children) {
            if(err) t.fail("mysterious failure C: " + err)
            t.deepEqual(children,[{
                value: { parentKey: '1', name: 'bar' },
                path: 'foo.bar',
                key: '2'
            },{
                value: { parentKey: '2', name: 'baz' },
                path: 'foo.bar.baz',
                key: '3'
            }],"object as expected: children with matchAncestors false")
        })
    })
})
