#!/usr/bin/env node

var base = require('./base.js');

/* 
   Example showing basic matching.

   Note that opts.match can also be a function 
   or a buffer if the database uses buffer paths.
*/

base(function(err, db, tree, cb) {
  if(err) return cb(err);

  tree.children(null, {
    match: 'ba',
    matchAncestors: true // switch to false to not include ancestors of match
  }, function(err, children) {
    if(err) return cb(err);
    
    console.log("matches:", children);

    cb();
  });
})

