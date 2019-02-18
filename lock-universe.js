'use strict';

const LockSpace = require('./lock-space');
const DoubleSet = require('./double-set');
const DoubleMap = require('./double-map');

const isFunction = require('lodash.isfunction');

function isPromise(obj) {
	return Promise.resolve(obj) == obj;
}

class Request {
	// eslint-disable-next-line lines-around-comment
	/**
	 * Request constructor.
	 *
	 * @param {string[]} resources
	 * @param {function} [resolve]
	 * @param {function} [reject]
	 */
	constructor(client, namespace, resources, resolve, reject) {
		this._id = null;
		this._client = client;
		this._namespace = namespace;
		this._resources = resources;
		this._resolve = resolve;
		this._reject = reject;
		this._isClosed = false;
	}

	async _sendResolve() {
		try {
			if (isFunction(this._resolve)) {
				let val = this._resolve();
				while (isPromise(val)) val = await val;
			}
		} catch (error) { }
	}

	async _sendReject(error) {
		try {
			if (isFunction(this._reject)) {
				let val = this._reject(error);
				while (isPromise(val)) val = await val;
			}
		} catch (error) { }
	}

	resolve() {
		this._client.lockResources(this._namespace, this._resources);
		this.close();
		setTimeout(() => this._sendResolve(), 0);
	}

	reject(error) {
		this.close();
		setTimeout(() => this._sendReject(error), 0);
	}

	close() {
		if (this._isClosed) return;
		this._isClosed = true;
		this._client.closeRequest(this._namespace, this._id);
	}
}

class Client {
	// eslint-disable-next-line lines-around-comment
	/**
	 * Client constructor.
	 *
	 * @param {string} id Unique client id.
	 */
	constructor(id) {
		this._id = id;
		this._lockedResources = new DoubleSet();
		this._requests = new DoubleMap();
	}

	lockResources(namespace, resources) {
		for (let r of resources) this._lockedResources.add(namespace, r);
	}

	filterResources(namespace, resources) {
		let res = resources.filter(r => this._lockedResources.has(namespace, r));
		return res;
	}

	unlockResources(namespace, resources) {
		for (let r of resources) this._lockedResources.delete(namespace, r);
	}

	addRequest(request, requestId) {
		request._id = requestId;
		if (request._isClosed) return;
		this._requests.set(request._namespace, requestId, request);
	}

	closeRequest(namespace, requestId) {
		if (requestId == null) return false;
		if (!this._requests.has(namespace, requestId)) return false;
		this._requests.delete(namespace, requestId);
		return true;
	}
}

class LockUniverse {
	// eslint-disable-next-line lines-around-comment
	/**
	 * LockUniverse constructor.
	 *
	 * @param {integer} [maxPending=Infinity] Max pending lock requests per namespace.
	 */
	constructor(maxPending = Infinity) {
		this._maxPending = maxPending;
		this._spaces = new Map();
		this._clients = new Map();
		this._bigCrunchMap = new Map();
	}

	_getSpace(namespace) {
		if (!this._spaces.has(namespace)) {
			this._spaces.set(namespace, new LockSpace(this._maxPending));
		}
		return this._spaces.get(namespace);
	}

	_getClient(clientId) {
		if (!this._clients.has(clientId)) {
			this._clients.set(clientId, new Client(clientId));
		}
		return this._clients.get(clientId);
	}

	_collectGarbage(namespace, space) {
		if (space.isEmpty()) this._scheduleBigCrunch(namespace);
		else this._preventBigCrunch(namespace);
	}

	_preventBigCrunch(namespace) {
		if (!this._bigCrunchMap.has(namespace)) return;
		clearTimeout(this._bigCrunchMap.get(namespace));
		this._bigCrunchMap.delete(namespace);
	}

	_scheduleBigCrunch(namespace) {
		if (this._bigCrunchMap.has(namespace)) return;
		let tid = setTimeout(() => {
			this._spaces.delete(namespace);
		}, 10000);
		this._bigCrunchMap.set(namespace, tid);
	}

	/**
	 * Try to lock the list of resources.
	 *
	 * @param {string} clientId
	 * @param {string} namespace
	 * @param {string[]} resources
	 */
	tryLock(clientId, namespace, resources) {
		let space = this._getSpace(namespace);
		let lockAcquired = space.tryLock(resources);
		if (lockAcquired) {
			let client = this._getClient(clientId);
			client.lockResources(namespace, resources);
		}
		this._collectGarbage(namespace, space);
		return lockAcquired;
	}

	/**
	 * Create a lock request.
	 *
	 * @param {string} clientId
	 * @param {string} namespace
	 * @param {string[]} resources
	 * @param {function} [resolve]
	 * @param {function} [reject]
	 * @param {integer} [timeout=Infinity] Lock request timeout in miliseconds.
	 */
	lock(clientId, namespace, resources, resolve = null, reject = null, timeout = Infinity) {
		let space = this._getSpace(namespace);
		let client = this._getClient(clientId);
		let request = new Request(client, namespace, resources, resolve, reject);
		let requestId = space.lock(resources, {
			requestIdPrefix: `${clientId}_`,
			resolve: request.resolve.bind(request),
			reject: request.reject.bind(request),
			timeout: timeout,
		});
		client.addRequest(request, requestId);
		this._collectGarbage(namespace, space);
		return requestId;
	}

	/**
	 * Abort lock request.
	 *
	 * @param {string} clientId
	 * @param {string} namespace
	 * @param {string} id Lock request id.
	 */
	abort(clientId, namespace, id) {
		let client = this._getClient(clientId);
		let exists = client.closeRequest(namespace, id);
		if (!exists) return false;
		let space = this._getSpace(namespace);
		let requestExisted = space.abort(id);
		this._collectGarbage(namespace, space);
		return requestExisted;
	}

	/**
	 * Release locked resources.
	 *
	 * @param {string} clientId
	 * @param {string} namespace
	 * @param {string[]} resources
	 */
	release(clientId, namespace, resources) {
		let client = this._getClient(clientId);
		resources = client.filterResources(namespace, resources);
		let space = this._getSpace(namespace);
		let allReleasedResourcesWereLocked = space.release(resources);
		client.unlockResources(namespace, resources);
		this._collectGarbage(namespace, space);
		return allReleasedResourcesWereLocked;
	}

	/**
	 * Release all client requests and locks.
	 *
	 * @param {string} clientId
	 */
	releaseClient(clientId) {
		if (!this._clients.has(clientId)) return;
		let client = this._getClient(clientId);

		// Abort all pending requests.
		let prequests = client._requests.toArray();
		for (let pr of prequests) {
			this.abort(clientId, pr.key1, pr.key2);
		}

		// Release all resources.
		let rlocks = client._lockedResources.toArray();
		let rlocksMap = new Map();
		for (let rlock of rlocks) {
			if (!rlocksMap.has(rlock.key1)) rlocksMap.set(rlock.key1, []);
			rlocksMap.get(rlock.key1).push(rlock.key2);
		}
		for (let [namespace, resources] of rlocksMap) {
			this.release(clientId, namespace, resources);
		}

		this._clients.delete(clientId);
	}
}

module.exports = LockUniverse;
