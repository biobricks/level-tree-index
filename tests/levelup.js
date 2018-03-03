var base = require('./common/base.js');
var tape = require('tape');

tape('levelup', function(t) {
    t.plan(2)
    base(function(err,db,tree,cb) {
        tree.getFromPath('foo.bar.baz', function(err, key, value) {
            if(err) t.fail("mysterious failure A: " + err)
            t.equal(key,"3","key")
            t.deepEqual(JSON.parse(value),{
                parentKey: '2',
                name: 'baz'
            },"value")
        })
    },{
        levelup: true,
        pathProp: function(value) {
            return JSON.parse(value).name;
        },
        parentProp: function(value) {
            return JSON.parse(value).parentKey;
        }
    })
})

