'use strict';

const LinkedList = require('linked-list');

const isFunction = require('lodash.isfunction');
const isInteger = require('lodash.isinteger');
const isString = require('lodash.isstring');

class LockRequest extends LinkedList.Item {
	// eslint-disable-next-line lines-around-comment
	/**
	 * LockRequest constructor.
	 *
	 * @param {LockSpace} queue Lock requests queue.
	 * @param {string[]} resources
	 * @param {object} [options]
	 * @param {string} [options.requestIdPrefix=null]
	 * @param {function} [options.resolve=null]
	 * @param {function} [options.reject=null]
	 * @param {integer} [options.timeout=Infinity] Lock request timeout in miliseconds.
	 */
	constructor(queue, resources, options = {}) {
		super();
		if (options == null) options = {};

		// Generate unique request id.
		this._queue = queue;
		this._id = this._queue._generateUniqueRequestId(options.requestIdPrefix);
		this._queue._requestIds.set(this._id, this);

		this.resources = resources;
		this._resolve = options.resolve;
		this._reject = options.reject;
		this._timeout = options.timeout;
		this._timeoutId = null;
		this._isFinished = false;
		if (isInteger(this._timeout)) {
			this._timeoutId = setTimeout(() => {
				this.reject(`Lock request timeout of ${this._timeout} miliseconds has expired.`);
			}, this._timeout);
		}
	}

	/**
	 * Resolve the lock request.
	 */
	resolve() {
		this.close();
		if (isFunction(this._resolve)) this._resolve();
	}

	/**
	 * Reject the lock request with error message.
	 *
	 * @param {string} message
	 */
	reject(message) {
		this.close();
		if (isFunction(this._reject)) this._reject(message);
	}

	/**
	 * Mark request as finished an remove it from the queue.
	 */
	close() {
		if (this._isFinished) return;
		this._isFinished = true;
		if (this._timeoutId != null) clearTimeout(this._timeoutId);
		this._queue._removeFromQueue(this);
		this._queue._releaseRequestId(this);
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
		this._requestIds = new Map();
	}

	// eslint-disable-next-line class-methods-use-this
	_makeid(prefix = null) {
		let text = '';
		if (isString(prefix)) text = prefix;
		let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 30; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}

	_generateUniqueRequestId(prefix = null) {
		let id = this._makeid(prefix);
		while (this._requestIds.has(id)) id = this._makeid(prefix);
		return id;
	}

	_releaseRequestId(request) {
		let r = this._requestIds.get(request._id);
		if (r === request) this._requestIds.delete(request._id);
	}

	_addToQueue(request) {
		if (request.list === this._queue) return;
		this._queue.append(request);
		this._queueLength++;
	}

	_removeFromQueue(request) {
		if (request.list !== this._queue) return;
		request.detach();
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
	 * @param {object} [options]
	 * @param {string} [options.requestIdPrefix=null]
	 * @param {function} [options.resolve=null]
	 * @param {function} [options.reject=null]
	 * @param {integer} [options.timeout=Infinity] Lock request timeout in miliseconds.
	 */
	lock(resources, options = {}) {
		if (options == null) options = {};
		let request = new LockRequest(this, resources, options);
		if (this.tryLock(request.resources)) {
			request.resolve();
		} else if (isInteger(this._maxPending) && (this._queueLength >= this._maxPending)) {
			request.reject(`Max pending lock requests limit of ${this._maxPending} reached.`);
		} else {
			this._addToQueue(request);
		}
		return request._id;
	}

	/**
	 * Abort lock request.
	 *
	 * @param {string} id Lock request id.
	 */
	abort(id) {
		let request = this._requestIds.get(id);
		if (request == null) return false;
		request.close();
		return true;
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
