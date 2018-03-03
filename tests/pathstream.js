var base = require('./common/base.js');
var tape = require('tape');

tape('pathStream', function(t) {
    t.plan(6)
    base(function(err, db, tree, cb) {
        if(err) t.fail("mysterious failure A: " + err)
        var s = tree.pathStream('foo');
        s.on('data', function(path) {
            if (t.equal(typeof path, "string", "it's a string: " + path)) {return}
            switch(path) {
            case "foo.bar": t.pass(path); break
            case "foo.bar.baz": t.pass(path); break
            case "foo.cat": t.pass(path); break
            default: t.fail("path should not be this: " + path)
            }
        })
        s.on('error', function(err) {
            if(err) t.fail("mysterious failure B: " + err)
        })
    })
})
