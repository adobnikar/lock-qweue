'use strict';

const LockSpace = require('../lock-space');
let space = new LockSpace();

space.lock(['a'], () => {}, (error) => console.log(error), 1500);
space.lock(['a'], () => {}, (error) => console.log(error), 2000);
space.lock(['a'], () => {}, (error) => console.log(error), 2500);

setTimeout(() => console.log('Done.'), 3000);
