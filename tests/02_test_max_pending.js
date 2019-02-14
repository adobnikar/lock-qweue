'use strict';

const LockSpace = require('../lock-space');
const debug = require('./debug');
let space = new LockSpace(3);
debug.debugLockSpace(space);

space.lock(null, ['a'], () => {}, (error) => console.log(error));
space.lock(null, ['a'], () => {}, (error) => console.log(error));
space.lock(null, ['a'], () => {}, (error) => console.log(error));
space.lock(null, ['a'], () => {}, (error) => console.log(error));
space.lock(null, ['a'], () => {}, (error) => console.log(error));
space.lock(null, ['a'], () => {}, (error) => console.log(error));

setTimeout(() => console.log('Done.'), 500);
