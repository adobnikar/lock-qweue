'use strict';

const Client = require('../client');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let client = new Client({
	host: 'http://localhost:3000',
	name: 'client1',
	token: 'secret',
});

setInterval(() => {}, 5000);

setTimeout(async () => {
	console.log('begin lock');
	await client.lock(['a', 'b'], async () => {
		await sleep(2000);
	});
	console.log('end lock');
}, 1000);

