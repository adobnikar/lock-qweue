'use strict';

const LinkedList = require('linked-list');

const isFunction = require('lodash.isfunction');
const isInteger = require('lodash.isinteger');

function isPromise(obj) {
	return Promise.resolve(obj) == obj;
}

class LockRequest extends LinkedList.Item {
	// eslint-disable-next-line lines-around-comment
	/**
	 * LockRequest constructor.
	 *
	 * @param {string[]} resources
	 * @param {function} [resolve=null]
	 * @param {function} [reject=null]
	 * @param {integer} [timeout=Infinity] Lock request timeout in miliseconds.
	 */
	constructor(resources, resolve = null, reject = null, timeout = Infinity) {
		super();
		this.resources = resources;
		this._resolve = resolve;
		this._reject = reject;
		this._timeout = timeout;
		this._timeoutId = null;
		this._isFinished = false;
		if (isInteger(this._timeout)) {
			this._timeoutId = setTimeout(() => {
				this.reject(`Lock request timeout of ${this._timeout} miliseconds has expired.`);
			}, this._timeout);
		}
	}

	async _sendResolve() {
		try {
			if (isFunction(this._resolve)) {
				let val = this._resolve();
				while (isPromise(val)) val = await val;
			}
		} catch (error) { }
	}

	async _sendReject(message) {
		try {
			if (isFunction(this._reject)) {
				let val = this._reject(new Error(message));
				while (isPromise(val)) val = await val;
			}
		} catch (error) { }
	}

	/**
	 * Resolve the lock request.
	 */
	resolve() {
		if (this._isFinished) return;
		this._isFinished = true;
		this._removeFromQueue();
		this._sendResolve();
	}

	/**
	 * Reject the lock request with error message.
	 *
	 * @param {string} message
	 */
	reject(message) {
		if (this._isFinished) return;
		this._isFinished = true;
		this._removeFromQueue();
		this._sendReject(message);
	}

	_removeFromQueue() {
		if (this._timeoutId != null) clearTimeout(this._timeoutId);
		if (this._queue != null) this._queue._removeFromQueue(this);
	}
}

class LockSpace {
	// eslint-disable-next-line lines-around-comment
	/**
	 * LockSpace constructor.
	 *
	 * @param {integer} [maxPending=Infinity] Max pending lock requests in the queue. When the limit is reached, requesting a lock will throw an error.
	 */
	constructor(maxPending = Infinity) {
		this._maxPending = maxPending;
		this._queue = new LinkedList();
		this._queueLength = 0;
		this._lockedResources = new Set();
	}

	_addToQueue(request) {
		if (request.list === this._queue) return;
		this._queue.append(request);
		request._queue = this;
		this._queueLength++;
	}

	_removeFromQueue(request) {
		if (request.list !== this._queue) return;
		request.detach();
		request._queue = null;
		this._queueLength--;
	}

	/**
	 * Internal helper function that find the next lock request that can be resolved.
	 */
	_processQueue() {
		let request = this._queue.head;
		let resolvedRequests = [];
		while (request != null) {
			if (this.tryLock(request.resources)) resolvedRequests.push(request);
			request = request.next;
		}
		for (let req of resolvedRequests) req.resolve();
	}

	/**
	 * Try to lock the list of resources.
	 *
	 * @param {string[]} resources
	 */
	tryLock(resources) {
		for (let r of resources) {
			if (this._lockedResources.has(r)) return false;
		}
		for (let r of resources) {
			this._lockedResources.add(r);
		}
		return true;
	}

	/**
	 * Create a lock request.
	 *
	 * @param {string[]} resources
	 * @param {function} [resolve]
	 * @param {function} [reject]
	 * @param {integer} [timeout=Infinity] Lock request timeout in miliseconds.
	 */
	lock(resources, resolve = null, reject = null, timeout = Infinity) {
		let request = new LockRequest(resources, resolve, reject, timeout);
		if (this.tryLock(request.resources)) {
			request.resolve();
		} else if (isInteger(this._maxPending) && (this._queueLength >= this._maxPending)) {
			request.reject(`Max pending lock requests limit of ${this._maxPending} reached.`);
		} else {
			this._addToQueue(request);
		}
	}

	/**
	 * Release locked resources.
	 *
	 * @param {string[]} resources
	 */
	release(resources) {
		resources = Array.from(new Set(resources));
		let isOK = true;
		for (let r of resources) {
			if (this._lockedResources.has(r)) this._lockedResources.delete(r);
			else isOK = false;
		}
		setTimeout(() => this._processQueue(), 0);
		return isOK;
	}
}

module.exports = LockSpace;
