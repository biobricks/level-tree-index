var base = require('base');
var tape = require('tape');

tape('put', function(t) {
    t.plan(2)
    base(function(err,db,tree,cb) {
        tree.getFromPath('foo.bar.baz', function(err, key, value) {
            if(err) t.fail("mysterious failure A: " + err)
            t.equal(key,"3","key")
            t.deepEqual(value,{
                parentKey: '2',
                name: 'baz'
            },"value")
        })
    })
})
