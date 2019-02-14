'use strict';

const Server = require('../server');
const debug = require('./debug');

let server = new Server({
	port: 3000,
	token: 'secret',
});

let space = server._spaces._getSpace(null);
debug.debugLockSpace(space);
