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

var opts = {
  orphanPath: null
};

tape('delete', function(t) {
  base(function(err, db, tree, cb) {
    if(err) t.fail("initialization failed: " + err)

    tree.put('42', {parentKey: '3', name: "wut"}, function(err) {
      if(err) t.fail("put failure: " + err)

      tree.children('foo', function(err, children) {
        if(err) t.fail("mysterious failure B: " + err)
        t.deepEqual(arrayFromPaths(children),[
          'foo.bar',
          'foo.bar.baz',
          'foo.bar.baz.wut',
          'foo.cat'
        ],"objects as expected before del")
        tree.del('3', function(err) {
          if(err) t.fail("mysterious failure C: " + err)
          tree.children('foo', function(err, children) {
            if(err) t.fail("mysterious failure D: " + err)
            t.deepEqual(arrayFromPaths(children),[
              'foo.bar',
              'foo.cat'
            ],"objects as expected after del 1")
            tree.del('4', function(err) {
              if(err) t.fail("mysterious failure E: " + err)
              tree.children('foo', function(err, children) {
                if(err) t.fail("mysterious failure F: " + err)

                t.deepEqual(arrayFromPaths(children),[
                  'foo.bar'
                ], "objects as expected after del 2")

                tree.del('8', function(err) {
                  if(!err) t.fail(".del did not fail when it should");

                  tree.children(null, function(err, children) {
                    if(err) t.fail("mysterious failure G: " + err)

                    t.deepEqual(arrayFromPaths(children), [
                      'foo',
                      'foo.bar'
                    ], "no orphans as expected after del")
                    
                    t.end();
                  });
                })
              })
            })
          })
        })
      })
    })
  }, opts)
})
