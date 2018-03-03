var base = require('./common/base.js');
var tape = require('tape');

function arrayFromPaths(nodes) {
    var i;
    var arr = []
    for(i=0; i < nodes.length; i++) {
        arr.push(nodes[i].path)
    }
    return arr
}

tape('move', function(t) {
    base(function(err, db, tree, cb) {
        if(err) t.fail("mysterious failure A: " + err)
        tree.children('foo', function(err, children) {
            if(err) t.fail("mysterious failure B: " + err)
            t.deepEqual(arrayFromPaths(children),[
                'foo.bar',
                'foo.bar.baz',
                'foo.cat'
            ],"objects as expected before move")
            tree.put('2', {parentKey: '4', name: "bar-moved"}, function(err) {
                if(err) t.fail("mysterious failure C: " + err)
                tree.children('foo', function(err, children) {
                    if(err) t.fail("mysterious failure D: " + err)
                    t.deepEqual(arrayFromPaths(children),[
                        'foo.cat',
                        'foo.cat.bar-moved',
                        'foo.cat.bar-moved.baz'
                    ],"objects as expected after move 1")
                    tree.put('3', {parentKey: '1', name: "baz"}, function(err) {
                        if(err) t.fail("mysterious failure E: " + err)
                        tree.children('foo', function(err, children) {
                            if(err) t.fail("mysterious failure F: " + err)
                            t.deepEqual(arrayFromPaths(children),[
                                'foo.baz',
                                'foo.cat',
                                'foo.cat.bar-moved'
                            ],"objects as expected after move 2")
                            if(err) t.fail("mysterious failure G: " + err)
                            t.end()
                        })
                    })
                })
            })
        })
    })
})
