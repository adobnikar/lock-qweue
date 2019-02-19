'use strict';

const Server = require('../server');
const debug = require('./debug');

let server = new Server({
	port: 3000,
	token: 'secret',
	logInfo: console.log, // (optional) Info logs function.
	logSuccess: console.log, // (optional) Success logs function.
	logError: console.error, // (optional) Error logs function.
});

let space = server._spaces._getSpace('a');
debug.debugLockSpace(space);
