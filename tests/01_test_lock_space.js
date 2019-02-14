'use strict';

const LockSpace = require('../lock-space');
const debug = require('./debug');
let space = new LockSpace();
debug.debugLockSpace(space);

space.lock(['a', 'b', 'c', 'd'], () => {
	space.lock(['a'], () => {
		console.log('a');
		space.release(['a']);
	});
	space.lock(['b'], () => {
		console.log('b');
		space.release(['b']);
	});
	space.lock(['c'], () => {
		console.log('c');
		space.release(['c']);
	});
	space.lock(['d'], () => {
		console.log('d');
		space.release(['d']);
	});
	space.lock(['a', 'b', 'c', 'd'], () => {
		console.log('Done.');
	});
});

setTimeout(() => space.release(['a']), 4000);
setTimeout(() => space.release(['b']), 3000);
setTimeout(() => space.release(['c']), 5000);
setTimeout(() => space.release(['d']), 2000);
