'use strict';

const LockSpace = require('../lock-space');
let space = new LockSpace();

space.lock(['a', 'b', 'c', 'd'], () => {
	space.lock(['a'], () => {
		console.log('a');
	});
	space.lock(['b'], () => {
		console.log('b');
	});
	space.lock(['c'], () => {
		console.log('c');
	});
	space.lock(['d'], () => {
		console.log('d');
	});
});

setTimeout(() => space.release(['a']), 4000);
setTimeout(() => space.release(['b']), 3000);
setTimeout(() => space.release(['c']), 5000);
setTimeout(() => space.release(['d']), 2000);
