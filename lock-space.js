'use strict';

const LinkedList = require('linked-list');

const isFunction = require('lodash.isfunction');

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
	 */
	constructor(resources, resolve = null, reject = null) {
		super();
		this.resources = resources;
		this._resolve = resolve;
		this._reject = reject;
	}

	/**
	 * Resolve the lock request.
	 */
	resolve() {
		if (isFunction(this._resolve)) {
			try {
				let val = this._resolve();
				if (isPromise(val)) val.catch(() => {});
			} catch (error) { }
		}
	}

	/**
	 * Reject the lock request with error message.
	 *
	 * @param {string} message
	 */
	reject(message) {
		if (isFunction(this._reject)) {
			try {
				let val = this._reject(new Error(message));
				if (isPromise(val)) val.catch(() => {});
			} catch (error) { }
		}
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
		this._lockedResources = new Set();
	}

	/**
	 * Internal helper function that find the next lock request that can be resolved.
	 */
	_processQueue() {
		let request = this._queue.head;
		let resolvedRequests = [];
		while (request != null) {
			if (this.tryLock(request.resources)) {
				resolvedRequests.push(request);
			}
			request = request.next;
		}
		for (let req of resolvedRequests) req.detach();
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

	lock(resources, resolve = null, reject = null) {
		let request = new LockRequest(resources, resolve, reject);
		if (this.tryLock(request.resources)) {
			request.resolve();
		} else {
			this._queue.append(request);
		}
	}

	release(resources) {
		for (let r of resources) {
			this._lockedResources.delete(r);
		}
		this._processQueue();
	}
}

module.exports = LockSpace;
