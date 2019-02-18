'use strict';

// TODO: change requires for readme
const Server = require('../server');

let server = new Server({
	port: 3000,
	token: 'secret', // (optional)
	namespace: 'name', // (optional)
	maxPending: 100, // (optional)
});

server.close();

// or

let server2 = new Server();
server2.listen(3000);
