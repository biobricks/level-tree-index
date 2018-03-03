var base = require('./common/base.js');
var tape = require('tape');

tape('ignore_output', function(t) {
    t.plan(2)
    base(function(err,db,tree,cb) {
        var s = tree.pathStream('foo', {

            // ignore any path where any part of the path begins with the letter 'c'
            ignore: function(path) {
                var pathParts = path.split('.');
                var i;
                for(i=0; i < pathParts.length; i++) {
                    if(pathParts[i].match(/^c/)) {
                        return true;
                    }
                }
                return false
            }
        })
        s.on('data', function(path) {
            switch(path) {
            case 'foo.cat': t.fail("Error: Ignore appears to be broken."); break
            case 'foo.bar': t.pass("foo.bar"); break
            case 'foo.bar.baz': t.pass("foo.bar.baz"); break
            default: t.fail("Error: unexpected path value")
            }
        })
    })
})
