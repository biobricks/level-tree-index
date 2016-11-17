
A streaming tree structure index for leveldb.

Reference every value in your leveldb to its parent, e.g. by setting `value.parentKey` to the key of the parent, then level-tree-index will keep track of the full path for each value and allow you to look up parents and children and stream the entire tree or a part thereof.

This is useful for implementing e.g. nested comments.

level-tree-index works for all keyEncodings. It works for the json valueEncoding automatically and works for other valueEncodings if you provide custom functions for the `opts.pathProp` and `opts.parentProp` options. level-tree-index works equally well with string and buffer paths.

level-tree-index automatically keeps the tree updated as you add, change or delete from the database.

# Usage

```
// db contains your data and idb is used to store the index
var tree = treeIndexer(db, idb);

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

## treeIndex(db, idb, [opts]) [constructor]

* db: Your database to be indexed
* idb: Database to use for storing the tree index

opts:

```
pathProp: 'name' // property used to construct the path
parentProp: 'parentKey' // property that references key of parent
sep: '.', // path separator
listen: true, // listen for changes on db and update index automatically
levelup: false // if true, returns a levelup instance instead
```

Both `pathProp` and `parentProp` can be either a string, a buffer or a function. 

If a function is used then the function will be passed a value from your database as the only argument. The `pathProp` function is expected to return a string or buffer that will be used to construct the path by joining multiple returned `pathProp` values with the `opts.sep` value as separator. The `parentProp` function is expected to return the key in `db` of the parent.

`opts.sep` can be a buffer of a string and is used as a separator to construct the path to each node in the tree.

If `opts.listen` is true then level-tree-index will listen to operations on db and automatically update the index. Otherwise the index will only be updated when .put/.del/batch is called directly on the level-tree-index instance. This option is ignored when `opts.levelup` is true.

If `opts.levelup` is true then instead of a level-tree-index instance a levelup instance will be returned with all of the standard levelup API + the level-tree-index API. All calls to .put, .del or .batch will operate on the database given as the `db` argument and only call their callbacks once the tree index has been updated.

Limitations when using `levelup:true`:

* Chained batch mode is not implemented.
* It is currently not possible _not_ to wait for the tree index to update so it will take longer before the .put, .del and .batch callbacks are called.
* Key and value encoding happens before the data gets to level-tree-index so `opts.pathProp` and `opts.parentProp` must be set to functions and if you're using `valueEncoding:'json'` then those functions will receive the stringified json data.

See `examples/levelup.js` for how to use the `levelup:true` mode.

## .getFromPath(path, cb)

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

# Async quirks

Note that when you call .put, .del or .batch on your database level-tree-index will not be able to delay the callback so you cannot expect the tree index to be up to date when the callback is called. That is why you see the setTimeout used in the usage example above. You can instead call .put, .del or .batch directly on the level-tree-index instance and your callback will not be called until the index has finished building. This works but if `opts.listen` is set to true then an inefficient and inelegant workaround is used (in order to prevent the change listener from attempting to update the already updated index) which could potentially slow things down.

If you want to wait for the index to update most of the time then you should probably either set `opts.listen` to false or use the levelup mode by calling the constructor with `opts.levelup` set to true, though that has its own drawbacks, especially if using `valueEncoding:'json'`. See the constructor API documentation for more.

# ToDo

## Before version 1.0

* Implement more unit tests

## Extras

* Add options for levelup:true mode that sets whether to wait for the index to update before calling back or not, both per default and per .put/.del/.batch operation.

# License and copyright

License: AGPLv3

Copyright 2016 BioBricks foundation.