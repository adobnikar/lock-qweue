'use strict';

const LockSpace = require('../lock-space');
const debug = require('./debug');
let space = new LockSpace();
debug.debugLockSpace(space);

space.lock(['a'], { reject: (error) => console.log(error), timeout: 1500 });
space.lock(['a'], { reject: (error) => console.log(error), timeout: 2000 });
space.lock(['a'], { reject: (error) => console.log(error), timeout: 2500 });

setTimeout(() => console.log('Done.'), 3000);
