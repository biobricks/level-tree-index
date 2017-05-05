var base = require('base');
var tape = require('tape');

tape('ignore_input', function(t) {
    t.plan(3)
    base(function(err,db,tree,cb) {
        tree.getFromPath('foo.bar.baz', function(err, key, value) {
            if(err) t.fail("mysterious failure A: " + err)
            t.equal(key,"3","key")
            t.deepEqual(value,{
                parentKey: '2',
                name: 'baz'
            },"value")
            tree.getFromPath('foo.bar._baz', function(err, key, value) {
                if(err) {
                    t.pass("as expected failed to get hidden element _baz")
                } else {
                    t.fail("Hmmm, something is wrong. We should have gotten an error but didn't.")
                }
            })
        })
    },{
        ignore: function(key, value) {
            if(typeof value === 'object') {
                if(typeof value.name === 'string') {
                    if(value.name[0] === '_') {
                        return true
                    }
                }
            }
            return false
        }
    })
})
