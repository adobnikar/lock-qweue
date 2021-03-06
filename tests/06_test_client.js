'use strict';

const Client = require('../client');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let client = new Client({
	host: 'http://localhost:3000',
	// namespace: 'a',
	name: 'client1',
	token: 'secret',
	logError: console.error, // (optional) Error logs function.
});

setInterval(() => {}, 5000);

setTimeout(async () => {
	try {
		console.log('Start');
		client.lock(['a', 'b'], async () => {
			console.log('begin lock 1');
			await sleep(2000);
			throw new Error('Test error.');
		}).then(() => console.log('end lock 1')).catch((error) => console.error(error));

		client.lock(['b', 'c'], async () => {
			console.log('begin lock 2');
			await sleep(2000);
		}).then(() => console.log('end lock 2')).catch((error) => console.error(error));

		client.lock(['a'], async () => {
			console.log('begin lock 3');
			await sleep(2000);
		}).then(() => console.log('end lock 3')).catch((error) => console.error(error));

		await client.lock(['a', 'b', 'c'], async () => {
			console.log('begin lock 4');
			await sleep(2000);
		});
		console.log('end lock 4');
	} catch (error) {
		console.error(error);
	}
	console.log('Done.');
}, 0);

