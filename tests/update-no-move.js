var base = require('base');
var tape = require('tape');

function arrayFromPaths(nodes) {
    var i;
    var arr = []
    for(i=0; i < nodes.length; i++) {
        arr.push(nodes[i].path)
    }
    return arr
}

tape('update-no-move', function(t) {
    base(function(err, db, tree, cb) {
        if(err) t.fail("mysterious failure A: " + err)
        tree.children('foo', function(err, children) {
            if(err) t.fail("mysterious failure B: " + err)
            t.deepEqual(arrayFromPaths(children),[
                'foo.bar',
                'foo.bar.baz',
                'foo.cat'
            ],"objects as expected before update")
            tree.put('2', {parentKey: '1', name: "bar-updated"}, function(err) {
                if(err) t.fail("mysterious failure C: " + err)
                tree.children('foo', function(err, children) {
                    if(err) t.fail("mysterious failure D: " + err)
                    t.deepEqual(arrayFromPaths(children),[
                        'foo.bar-updated',
                        'foo.bar-updated.baz',
                        'foo.cat'
                    ],"objects as expected after update")
                    if(err) t.fail("mysterious failure E: " + err)
                    t.end()
                })
            })
        })
    })
})
