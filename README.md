# Lock Qweue

Inter-process multi-resource locking queue.
It has a server-client architecture.
If you are looking for local (single-process) multi-resource locking, check out [async-lock](https://www.npmjs.com/package/async-lock) as it has been out there for longer.

## Requirements

- [**Node.js**](https://nodejs.org) at least  **v7.6.0** or higher for ES2015 and async function support

## Install

```bash
npm i lock-qweue
```

## List of classes

- Server (Lock qweue server)
- Client (Lock qweue client)
- LockSpace (Space where names of resources must be unique)

## Server class

### Functions

- constructor(options) → returns Server instance
- listen(port)
- close()
- io() → returns underlying Socket.io server

### Examples

```js
const Server = require('lock-qweue/server');

let server = new Server({
	port: 3000,
	token: 'secret', // (optional) Authentication token.
	maxPending: 100, // (optional) Max pending lock requests per namespace.
});
```

or

```js
const Server = require('lock-qweue/server');

let server = new Server();
server.listen(3000);

```

## Client class

### Functions

- constructor(options) → returns Client instance
- async lockRequest(resources, options) → returns Request instance
- async tryLock(resources, options) → boolean (lock acquired flag)
- async release(resources, options) → boolean (all released resources were locked flag)
- async abort(requestId, options) → boolean (request id was found flag)
- async lock(resources, fn, options)
- io() → returns underlying Socket.io client

### Examples

```js
const Client = require('lock-qweue/client');

let client = new Client({
	host: 'http://localhost:3000',
	namespace: 'name', // (optional) Namespace that will be used by default. Can be overridden with options.
	name: 'client1', // (optional) Client name.
	token: 'secret', // (optional) Authentication token.
});
```

Execute a function while resource lock is acquired:

```js
await client.lock(['resource A', 'resource B'], async () => {
	// ... function here
})
```

or

```js
await client.lockRequest(['resource A', 'resource B']).promise;

// ... function here

await client.release(['resource A', 'resource B']);
```

Try to lock resources:

```js
let resourcesLocked = await client.tryLock(['resource A', 'resource B']);
```

Abort a lock request:

```js
let request = await client.lockRequest(['resource A', 'resource B'], {
	namespace: 'name', // (optional) Override the default client namespace.
});

// ... some code here

await request.abort();
```

Lock request with timeout:

```js
let request = await client.lockRequest(['resource A', 'resource B'], {
	timeout: 1000, // (optional) Timeout in milliseconds.
});
await request.promise; // If time runs out, this will throw an error.
```

## LockSpace class

You can use this class if you want to lock resources locally (single-process).

### Functions

- default(maxPending) → returns the default LockSpace instance
- tryLock(resources) → boolean (lock acquired flag)
- lock(resources, options) → string request id
- async lockAsync(resources, fn, timeout)
- abort(requestId) → boolean (request id was found flag)
- release(resources) → boolean (all released resources were locked flag)
- isEmpty() → boolean (true if the requests queue is empty and there are no locked resources)

### Examples

Execute a function while resource lock is acquired:

```js
const LockSpace = require('lock-qweue/lock-space');

let space = new LockSpace();

await space.lockAsync(['resource A', 'resource B'], async () => {
	// ... function here
})
```

or

```js
const LockSpace = require('lock-qweue/lock-space');

let space = new LockSpace();

await space.lock(['resource A', 'resource B'], {
	resolve: () => {
		// ... function here

		space.release(['resource A', 'resource B']);
	},
	reject: (error) => {
		space.release(['resource A', 'resource B']);
		console.error(error.message);
	},
	timeout: 1000, // (optional) Timeout in milliseconds.
})
```

## Development

### Node.js libraries used

- [socket.io](https://socket.io/)
- [socket.io-client](https://www.npmjs.com/package/socket.io-client)
- [linked-list](https://www.npmjs.com/package/linked-list)
- [joi](https://www.npmjs.com/package/joi)

### System that was used for development

- OS: Ubuntu 18.04
- Node.js: v8.11.3

### Optional requirements for development

- **docker**
- **npm** package manager for JavaScript
- **VS Code** for Node.js development and debugging

### Ideas for further development

- authentication to support multiple tokens and ip whitelisting
- optimizing the multi-resource locking queue algorithm
- support for REDIS
