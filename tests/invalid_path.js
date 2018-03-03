var base = require('./common/base.js');
var tape = require('tape');

//  Check if adding the separator character in the name screws things up

tape('invalid_path', function(t) {
    t.plan(2)
    base(function(err,db,tree,cb) {
        if(err) t.fail("mysterious failure A: " + err)
        tree.children('foo', function(err, children) {
            if(err) t.fail("mysterious failure B: " + err)
            t.deepEqual(children,[{
                value: { parentKey: '1', name: 'bar.lol' },
                path: 'foo.barlol',
                key: '2'
            },{
                value: { parentKey: '2', name: 'baz' },
                path: 'foo.barlol.baz',
                key: '3'
            },{
                value: { parentKey: '1', name: 'cat' },
                path: 'foo.cat',
                key: '4'
            }],"before move")
            tree.put('2', {parentKey: '1', name: "bar.moved"}, function(err) {
                if(err) t.fail("mysterious failure C: " + err)
                tree.children('foo', function(err, children) {
                    if(err) t.fail("mysterious failure D: " + err)
                    t.deepEqual(children,[{
                        value: { parentKey: '1', name: 'bar.moved' },
                        path: 'foo.barmoved',
                        key: '2'
                    },{
                        value: { parentKey: '2', name: 'baz' },
                        path: 'foo.barmoved.baz',
                        key: '3'
                    },{
                        value: { parentKey: '1', name: 'cat' },
                        path: 'foo.cat',
                        key: '4'
                    }],"after move")
                })
            })
        })
    },{
        barname: 'bar.lol'
    })
})
