'use strict';

const Client = require('../client');

let client = new Client({
	host: 'http://localhost:3000',
	namespace: 'name', // (optional)
	name: 'client1', // (optional)
	token: 'secret', // (optional)
});
