var base = require('base');
var tape = require('tape');

tape('parent', function(t) {
    t.plan(6)
    base(function(err, db, tree, cb) {
        if(err) t.fail("mysterious failure A: " + err)
        t.equal(tree.parentPathFromPath('foo.bar.baz'),"foo.bar","parent A")
        tree.parentFromPath('foo.bar.baz', function(err, key, value) {
            if(err) t.fail("mysterious failure B: " + err)
            t.equal(key,"2","parent B key")
            t.deepEqual(value,{
                parentKey: '1',
                name: 'bar'
            },"parent B value")
            tree.parentFromPath('foo', function(err, key, value) {
                if(err) t.fail("mysterious failure C: " + err)
                t.equal(key,undefined,"parent C key")
                t.equal(value,undefined,"parent C value")
                tree.parentPathFromValue({}, function(err, path) {
                    if(err) t.fail("mysterious failure D: " + err)
                    t.equal(path,undefined,"parent D")
                })
            })
        })
    })
})
