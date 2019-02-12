'use strict';

const LockSpace = require('../lock-space');
let space = new LockSpace(3);

space.lock(['a'], () => {}, (error) => console.log(error));
space.lock(['a'], () => {}, (error) => console.log(error));
space.lock(['a'], () => {}, (error) => console.log(error));
space.lock(['a'], () => {}, (error) => console.log(error));
space.lock(['a'], () => {}, (error) => console.log(error));
space.lock(['a'], () => {}, (error) => console.log(error));

setTimeout(() => console.log('Done.'), 500);
