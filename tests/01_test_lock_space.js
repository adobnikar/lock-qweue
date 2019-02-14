'use strict';

const LockSpace = require('../lock-space');
const debug = require('./debug');
let space = new LockSpace();
debug.debugLockSpace(space);

space.lock(null, ['a', 'b', 'c', 'd'], () => {
	space.lock(null, ['a'], () => {
		console.log('a');
		space.release(['a']);
	});
	space.lock(null, ['b'], () => {
		console.log('b');
		space.release(['b']);
	});
	space.lock(null, ['c'], () => {
		console.log('c');
		space.release(['c']);
	});
	space.lock(null, ['d'], () => {
		console.log('d');
		space.release(['d']);
	});
	space.lock(null, ['a', 'b', 'c', 'd'], () => {
		console.log('Done.');
	});
});

setTimeout(() => space.release(['a']), 4000);
setTimeout(() => space.release(['b']), 3000);
setTimeout(() => space.release(['c']), 5000);
setTimeout(() => space.release(['d']), 2000);
