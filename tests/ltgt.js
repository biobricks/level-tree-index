var base = require('../examples/base.js');
var tape = require('tape');

tape('ltgt', function(t) {
    t.plan(9)
    base(function(err, db, tree, cb) {
        if(err) t.fail("mysterious failure A: " + err)
        var s = tree.pathStream({
            gte: 'foo',
            lte: tree.lteKey('foo.ba')
        });
        s.on('data', function(path) {
            if (t.equal(typeof path, "object", "it's an object")) {return} // why does this work? are 1 and 0 reversed?
            if (t.equal(typeof path.path, "string", "it's a string: " + path.path)) {return} // this too
            switch(path.path) {
            case "foo":
                t.deepEqual(path,{
                    value: { name: 'foo' },
                    path: 'foo',
                    key: '1'
                },"object as expected: foo")
                break;
            case "foo.bar":
                t.deepEqual(path,{
                    value: { parentKey: '1', name: 'bar' },
                    path: 'foo.bar',
                    key: '2'
                },"object as expected: foo.bar")
                break;
            case "foo.bar.baz":
                t.deepEqual(path,{
                    value: { parentKey: '2', name: 'baz' },
                    path: 'foo.bar.baz',
                    key: '3'
                },"object as expected: foo.bar.baz")
                break;
            default:
                t.fail("path.path should not be this: " + path.path)
            }
        })
        s.on('error', function(err) {
            if(err) t.fail("mysterious failure B: " + err)
        })
    })
})
