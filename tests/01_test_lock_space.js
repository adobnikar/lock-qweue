'use strict';

const LockSpace = require('../lock-space');
const debug = require('./debug');
let space = LockSpace.global();
debug.debugLockSpace(space);

space.lock(['a', 'b', 'c', 'd'], { resolve: () => {
	space.lock(['a'], { resolve: () => {
		console.log('a');
		space.release(['a']);
	} });
	space.lock(['b'], { resolve: () => {
		console.log('b');
		space.release(['b']);
	} });
	space.lock(['c'], { resolve: () => {
		console.log('c');
		space.release(['c']);
	} });
	space.lock(['d'], { resolve: () => {
		console.log('d');
		space.release(['d']);
	} });
	space.lock(['a', 'b', 'c', 'd'], { resolve: () => {
		console.log('Done.');
	} });
} });

setTimeout(() => space.release(['a']), 4000);
setTimeout(() => space.release(['b']), 3000);
setTimeout(() => space.release(['c']), 5000);
setTimeout(() => space.release(['d']), 2000);
