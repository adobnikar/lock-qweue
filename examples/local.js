'use strict';

// TODO: change requires for readme
const LockSpace = require('../lock-space');

let space = new LockSpace();

space.lock(['a', 'c']);

space.lockAsync(['a', 'b'], () => {
	console.log('a, b');
	throw new Error('Test error.');
}, 1000).catch((error) => console.error(error.message));

space.lockAsync(['b'], () => {
	console.log('b');
}).catch((error) => console.error(error.message));

space.lockAsync(['c'], () => {
	console.log('c');
}).catch((error) => console.error(error.message));

space.lockAsync(['b', 'c'], () => {
	console.log('b, c');
}, 1000).catch((error) => console.error(error.message));

setTimeout(() => space.release('a'), 500);
setTimeout(() => space.release('c'), 1500);
