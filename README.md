
A streaming tree structure index for leveldb.

Reference every value in your leveldb to its parent, e.g. by setting `value.parentKey` to the key of the parent, then level-tree-index will keep track of the full path for each value, allow you to look up parents and children, stream the entire tree or a part thereof and even perform streaming search queries on the tree.

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
sep: 0x1f, // path separator. can be string or unicode/ascii character code
pathArray: false, // for functions that output paths, output paths as arrays
ignore: false, // set to a function to selectively ignore 
listen: true, // listen for changes on db and update index automatically
levelup: false // if true, returns a levelup instance instead
```

Both `pathProp` and `parentProp` can be either a string, a buffer or a function. 

If a function is used then the function will be passed a value from your database as the only argument. The `pathProp` function is expected to return a string or buffer that will be used to construct the path by joining multiple returned `pathProp` values with the `opts.sep` value as separator. The `parentProp` function is expected to return the key in `db` of the parent.

`opts.sep` can be a buffer of a string and is used as a separator to construct the path to each node in the tree.

`opts.ignore` can be set to a function which will receive the key and value for each change and if it returns something truthy then that value will be ignored by the tree indexer, e.g:

```
// ignore items where the .name property starts with an underscore
ignore: function(key, value) {
  if(typeof value === 'object') {
    if(typeof value.name === 'string') {
      if(value.name[0] === '_') {
        return true;
      }     
    }
  }
  return false;
} 
```

If `opts.listen` is true then level-tree-index will listen to operations on db and automatically update the index. Otherwise the index will only be updated when .put/.del/batch is called directly on the level-tree-index instance. This option is ignored when `opts.levelup` is true.

If `opts.levelup` is true then instead of a level-tree-index instance a levelup instance will be returned with all of the standard levelup API + the level-tree-index API. All calls to .put, .del or .batch will operate on the database given as the `db` argument and only call their callbacks once the tree index has been updated.

Limitations when using `levelup:true`:

* Chained batch mode is not implemented.
* It is currently not possible _not_ to wait for the tree index to update so it will take longer before the .put, .del and .batch callbacks are called.
* Key and value encoding happens before the data gets to level-tree-index so `opts.pathProp` and `opts.parentProp` must be set to functions and if you're using `valueEncoding:'json'` then those functions will receive the stringified json data.

See `examples/levelup.js` for how to use the `levelup:true` mode.

## .stream([parentPath], [opts])

Recursively stream descendants starting from `parentPath`. If `parentPath` is falsy then the entire tree will be streamed to the specified depth.

Opts:

```
depth: 0, // how many (grand)children deep to go. 0 means infinite
paths: true, // output the path for each child
keys: true, // output the key for each child
values: true, // output the value for each child
pathArray: undefined, // output paths as arrays
ignore: false, // optional function that returns true for values to ignore
match: null, // Stream only matching elements. A string, buffer or function.
matchAncestors: false, // include ancestors of matches if true
gt: undefined, // specify gt directly, must then also specify lt or lte
gte: undefined, // specify gte directly, must then also specify lt or lte
lt: undefined, // specify lt directly, must then also specify gt or gte
lte: undefined // specify lte directly, must then also specify lt or gte
```

If `parentPath` is not specified then `.gt/.gte` and `.lt/.lte` must be specified.

`opts.depth` is currently not usable at the same time as `opts.match`.

If more than one of `opts.paths`, `opts.keys` and `opts.values` is true then the stream will output objects with these as properties.

`opts.ignore` can be set to a function. This function will receive whatever the stream is about to output (which depends on `opts.paths`, `opts.keys` and `opts.values`) and if the function returns true then those values will not be emitted by the stream.

`opts.match` allows for streaming search queries on the tree. If set to a string or buffer it will match any path that contains that string or buffer. If set to a RegEx then it will run a .match on the path with that RegEx (only works for string paths). If set to a function then that function will be called with the path as first argument and with the second argument depending on the values of `opts.paths`, `opts.keys` and `opts.values`, e.g: 

```
match: function(path, o) {
  if(o.value.name.match("cattens")) {
   return true;
  }
  return false;
}
```

Setting `opts.matchAncestors` to true modifies the behaviour of `opts.match` to also match all ancestors of matched elements. Ancestors of matched elements will then be streamed in the correct order before the matched element. This requires some buffering so may slow down matches on very large tree indexes.

When using `opts.lt/opts.lte` you can use the convenience function `.lteKey(key)`. E.g. to stream all paths that begin with 'foo.bar' you could run:

```
levelTree.stream({
  gte: 'foo.bar',
  lte: levelTree.lteKey('foo.bar')
});
```

Keep in mind that the above example would also return paths like 'foo.barbar'.

## .lteKey(key)

Convenience function that, according to leveldb alphabetical ordering, returns the last possible string or buffer that begins with the specified string or buffer. 

## .parentStream(path, [opts])

Stream tree index ancestor paths starting from `path`. Like `.stream()` but traverses ancestors instead of descendants.

Opts:

```
height: 0, // how many (grand)children up to go. 0 means infinite
includeCurrent: true, // include the node specified by path in the stream 
paths: true, // output the path for each child
keys: true, // output the key for each child
values: true, // output the value for each child
pathArray: undefined, // output paths as arrays
```

## .parents(path, [opts], cb)

Same as `.parentStream` but calls back with the results as an array.

## .getFromPath(path, cb)

Get key and value from path. 

Callback: `cb(err, key, value)`

## .path(key, [opts], cb)

Get tree path given a key.

```
opts.pathArray: undefined // if true, split path into array 
```

Callback: `cb(err, path)`

## .parentFromValue(value, cb)

Get parent value given a value. 

Callback: `cb(err, parentValue)`

## .parentPath(key, [opts], cb)

Get parent path given a key.

```
opts.pathArray: undefined // if true, split path into array
```

Callback: `cb(err, parentPath)`

## .parentPathFromValue(key, [opts],  cb)

Get parent path given a value.

```
opts.pathArray: undefined // if true, split path into array
```

Callback: `cb(err, parentPath)`

## .parentFromPath(path, cb)

Get parent value given a path.

Callback: `cb(err, parentValue)`

## .parentPathFromPath(path, [opts], cb)

Get parent path given a path.

```
opts.pathArray: undefined // if true, split path into array
```

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

## .pathStream(parentPath, [opts])

Same as .stream with only opts.paths set to true.

## .keyStream(parentPath, [opts])

Same as .stream with only opts.keys set to true.

## .valueStream(parentPath, [opts])

Same as .stream with only opts.values set to true.

## .clear(cb)

Clear the index. Deletes all of the index's data in the index db.

## .build(cb)

Build the index from scratch. 

Note: You will likely want to .clear the index first or call .rebuild instead.

## .rebuild(cb)

Clear and then build the index.

## .put(key, value, [opts], cb)

If you need to wait for the tree index to update after a `.put` operation then you can use .put directly on the level-tree-index instance and give it a callback. Calling `.put` this way is much less efficient so if you are planning to use this feature most of the time then you should look into using level-tree-index with the `levelup:true` option instead.

## .del(key, [opts], cb)

Allows you to wait for the tree index to finish building using a callback. Same as `.put` above but for deletion.

# Async quirks

Note that when you call .put, .del or .batch on your database level-tree-index will not be able to delay the callback so you cannot expect the tree index to be up to date when the callback is called. That is why you see the setTimeout used in the usage example above. You can instead call .put, .del or .batch directly on the level-tree-index instance and your callback will not be called until the index has finished building. This works but if `opts.listen` is set to true then an inefficient and inelegant workaround is used (in order to prevent the change listener from attempting to update the already updated index) which could potentially slow things down.

If you want to wait for the index to update most of the time then you should probably either set `opts.listen` to false or use the levelup mode by calling the constructor with `opts.levelup` set to true, though that has its own drawbacks, especially if using `valueEncoding:'json'`. See the constructor API documentation for more.

## Technical explanation

I normal operation `(opts.levelup == false)` level-tree-index will listen for any changes on your database and update its index every time a change occurs. This is implemented using leveup change event listeners which run after the database operation has already completed. 

When running `.put` or `.del` directly on level-tree-index the operation is performed on the underlying database then the tree index is updated and then the callback is called. Since we can't turn off the change event listeners for a specific operation, level-tree-index has to remember the operations performed directly through `.put` or `.del` on the level-tree-index instance such that the change event listener can ignore them to prevent the tree-index update operation from being called twice. This is done by hashing the entire operation, saving the hash and then checking the hash of each operation picked up by the change event listeners agains the saved hash. This is obviously inefficient. If this feature is never used then nothing is ever hashed nor compared so performance will not be impacted.

# ToDo

## Before version 1.0

* Implement unit tests
* Ability retrieve element and all ancestors of element.
* Get `opts.depth` working with `opts.match`.

# License and copyright

License: AGPLv3

Copyright 2016, 2017 BioBricks foundation.