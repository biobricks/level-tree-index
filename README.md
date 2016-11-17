
A streaming tree structure index for leveldb.

Reference every value in your leveldb to its parent, e.g. by setting value.parentKey to the key of the parent, then level-tree-index will keep track of the full path for each value and allow you to look up parents and children and stream the entire tree or a part thereof.

This is useful for implementing e.g. nested comments.

level-tree-index works for all keyEncodings and works automatically for the json valueEncoding and for other valueEncodings if you provide custom functions for the opts.pathProp and opts.parentProp options. level-tree-index works equally well with string and buffer paths.

Note that level-tree-index has no way to delay callbacks when calling e.g. .put on your database, so when you change your database then you cannot expect the tree index to immediately be up to date. It wouldn't be too difficult to turn this module into a leveldown/levelup instance using abstract-leveldown, which would allow delaying of callbacks until the index has finished updating.

# Usage

```
// db contains your data and idb is used to store the index
var tree = treeIndexer(db, idb);

// 
db.put('1', {name: "foo"}, function(err) {
  if(err) fail(err);

  db.put('2', {parentKey: '1', name: "bar"}, function(err) {
    if(err) fail(err);

    db.put('3', {parentKey: '2', name: "baz"}, function(err) {
      if(err) fail(err);

      // wait for index to finish building
      setTimeout(function() {

        // stream child-paths of 'foo' recursively
        var s = tree.stream('foo');

        s.on('data', function(data) {
          console.log(data.path, data.key, data.value);
        });

      }, 500);
    });
  });
});

```

See `examples/` for more.

# API

## .get(path, cb)

Get key and value from path. 

Callback: `cb(err, key, value)`

## .path(key, cb)

Get tree path given a key.

Callback: `cb(err, path)`

## .parentFromValue(value, cb)

Get parent value given a value. 

Callback: `cb(err, parentValue)`

## .parentPath(key, cb)

Get parent path given a key.

Callback: `cb(err, parentPath)`

## .parentPathFromValue(key, cb)

Get parent path given a value.

Callback: `cb(err, parentPath)`

## .parentFromPath(path, cb)

Get parent value given a path.

Callback: `cb(err, parentValue)`

## .parentPathFromPath(path, cb)

Get parent path given a path.

Note: this function can be called synchronously

Callback: `cb(err, parentPath)`

## .children(path, [opts], cb)

Get array of children given a value.

Same usage as `.stream` but this version isn't streaming.

Callback: `cb(err, childArray)`

## .childrenFromKey(path, [opts], cb)

Same as `.children` but takes a key as input.

Same usage as `.stream` but this version isn't streaming.

Callback: `cb(err, childArray)`

## .stream(parentPath, [opts])

If parentPath is falsy then the entire tree will be streamed to the specified depth.

Opts:

```
depth: 0, // how many (grand)children deep to go. 0 means infinite
paths: true, // output the path for each child
keys: true, // output the key for each child
values: true // output the value for each child
```

If more than one of opts.paths, opts.keys and opts.values is true then the stream will output objects with these as properties.

## .streamPaths(parentPath, [opts])

Same as .stream with only opts.paths set to true.

## .streamKeys(parentPath, [opts])

Same as .stream with only opts.keys set to true.

## .streamValues(parentPath, [opts])

Same as .stream with only opts.values set to true.

## .clear(cb)

Clear the index. Deletes all of the index's data in the index db.

## .build(cb)

Build the index from scratch. 

Note: You will likely want to .clear the index first or call .rebuild instead.

## .rebuild(cb)

Clear and then build the index.