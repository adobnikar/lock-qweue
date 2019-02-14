'use strict';

const LockSpace = require('../lock-space');
const debug = require('./debug');
let space = new LockSpace();
debug.debugLockSpace(space);

let r1 = space.lock(['a'], { reject: (error) => console.log(error), timeout: 1500 });
let r2 = space.lock(['a'], { reject: (error) => console.log(error), timeout: 2000 });
let r3 = space.lock(['a'], { reject: (error) => console.log(error), timeout: 2500 });
let r4 = space.lock(['a'], { reject: (error) => console.log(error), timeout: 2500 });
setTimeout(() => console.log('Abort 3 ' + space.abort(r3)), 1000);
setTimeout(() => console.log('Abort 1 ' + space.abort(r1)), 1000);

setTimeout(() => console.log('Done.'), 3000);
