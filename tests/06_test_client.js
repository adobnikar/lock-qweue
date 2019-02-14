'use strict';

const Client = require('../client');

let client = new Client({
	host: 'http://localhost:3000',
	name: 'client1',
	token: 'secret',
});

setInterval(() => {}, 5000);
