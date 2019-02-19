'use strict';

// TODO: change requires for readme
const Server = require('../server');

let server = new Server({
	port: 3000,
	token: 'secret', // (optional) Max pending lock requests per namespace.
	maxPending: 100, // (optional) Max pending lock requests per namespace.
	logInfo: console.log, // (optional) Info logs function.
	logSuccess: console.log, // (optional) Success logs function.
	logError: console.error, // (optional) Error logs function.
});

server.close();

// or

let server2 = new Server();
server2.listen('3000');
