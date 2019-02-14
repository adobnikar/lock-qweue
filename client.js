'use strict';

const SocketIOClient = require('socket.io-client');
const DoubleMap = require('./double-map');

const isString = require('lodash.isstring');
const isFunction = require('lodash.isfunction');

function isPromise(obj) {
	return Promise.resolve(obj) == obj;
}

class Request {
	constructor(client, namespace, resolve = null, reject = null, p) {
		this._client = client;
		this._namespace = namespace;
		this._resolve = resolve;
		this._reject = reject;
		this._isFinished = false;

		this._id = null;
		this._client._newRequests.add(this);
		this._lrp = this._client._lockRequestResponseHandler(this, p);
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

	resolve() {
		if (this._isFinished) return;
		this._isFinished = true;
		this._sendResolve();
	}

	reject(message) {
		if (this._isFinished) return;
		this._isFinished = true;
		this._sendReject(message);
	}
}

class Client {
	// eslint-disable-next-line lines-around-comment
	/**
	 * Lock queue client constructor.
	 *
	 * @param {object} options
	 * @param {string} options.host Lock queue server url.
	 * @param {string} [options.name] Client name.
	 * @param {string} [options.namespace] Locks namespace. If not set a default namespace will be used.
	 * @param {string} [options.token] Authentication token.
	 */
	constructor(options = {}) {
		if (options == null) options = {};
		if (!isString(options.host)) throw new Error('Lock queue client is missing the host parameter.');
		if (!isString(options.namespace)) options.namespace = null;
		this._options = options;

		this._requests = new DoubleMap();
		this._newRequests = new Set();

		this._io = new SocketIOClient(this._options.host);
		this._io.on('lockResponse', this._onLockResponse.bind(this));
		this._io.on('connect', this._onConnect.bind(this));
		this._io.on('disconnect', this._onDisconnect.bind(this));

		// this._io.on('connect_error', this._evt('connect_error').bind(this));
		// this._io.on('connect_timeout', this._evt('connect_timeout').bind(this));
		// this._io.on('reconnect', this._evt('reconnect').bind(this));
		// this._io.on('reconnect_failed', this._evt('reconnect_failed').bind(this));
		// this._io.on('reconnect_error', this._evt('reconnect_error').bind(this));
		// this._io.on('event', this.onEvent.bind(this));
	}

	// _evt(name) {
	// 	let fn = function(arg) {
	// 		console.log(name, arg);
	// 	};
	// 	return fn;
	// }

	// onEvent(data) {
	// 	console.log('event', data);
	// }

	// onReconnectAttempt() {
	// 	console.log('reconnect_attempt');
	// }

	_onConnect() {
		if (isString(this._options.token)) {
			this._io.emit('authentication', {
				name: this._options.name,
				token: this._options.token,
			});
		}
	}

	_onDisconnect() {
		console.log('disconnected');
		// TODO: kill all pending request promises
		// TODO: kill all new and pending requests
	}

	// eslint-disable-next-line class-methods-use-this
	_createPromise() {
		let presolve = null;
		let preject = null;
		let p = new Promise((resolve, reject) => {
			presolve = resolve;
			preject = reject;
		});
		return {
			p: p,
			resolve: presolve,
			reject: preject,
		};
	}

	// eslint-disable-next-line class-methods-use-this
	_createResponseHandler() {
		// TODO: maybe need to kill all pending requests on disconnect
		let { p, resolve, reject } = this._createPromise();
		let handler = (data) => {
			// eslint-disable-next-line callback-return
			if (data.success) resolve(data);
			// eslint-disable-next-line callback-return
			else reject(new Error(data.error));
		};
		return {
			p: p,
			handler: handler,
		};
	}

	async _lockRequestResponseHandler(request, p) {
		let response = await p;
		request._id = response.requestId;
		this._newRequests.delete(request);
		this._requests.set(request._namespace, request._id, request);
	}

	async _onLockResponse(data) {
		if (!this._requests.has(data.namespace, data.requestId)) {
			// If cannot find the request then wait for new requests to get their ids.
			let ps = Array.from(this._newRequests).map(req => req._lrp);
			await Promise.all(ps);
		}
		if (!this._requests.has(data.namespace, data.requestId)) {
			console.error('Unresolved lock response: ' + JSON.stringify(data));
			return;
		}
		let request = this._requests.get(data.namespace, data.requestId);
		this._requests.delete(data.namespace, data.requestId);
		if (data.success) request.resolve();
		else request.reject(data.message);
	}

	_checkConnection() {
		if (!this._io.connected) {
			throw new Error('Lock queue server unreachable.');
		}
	}

	_pickNamespace(options) {
		let namespace = this._options.namespace;
		if (('namespace' in options) && ((options.namespace === null) || (options.namespace != null))) {
			namespace = options.namespace;
		}
		return namespace;
	}

	/**
	 * Send lock resources request. You can set callback functions for success and error.
	 *
	 * @param {string|string[]} resources One or multiple resources to lock.
	 * @param {object} [options]
	 * @param {function} [options.namespace] Use another namespace.
	 * @param {function} [options.resolve=null]
	 * @param {function} [options.reject=null]
	 * @param {integer} [options.timeout=Infinity] Lock request timeout in miliseconds.
	 *
	 * @returns {Request} Request object.
	 */
	async lockRequest(resources, options = {}) {
		this._checkConnection();
		let namespace = this._pickNamespace(options);
		let { p, handler } = this._createResponseHandler();
		let request = new Request(this, namespace, options.resolve, options.reject, p);
		this._io.emit('lock', {
			namespace: namespace,
			resources: resources,
			timeout: options.timeout,
		}, handler);
		await request._lrp; // Wait for the request to get the id.
		return request;
	}

	/**
	 * Try to lock the list of resources.
	 *
	 * @param {string|string[]} resources One or multiple resources to lock.
	 * @param {object} [options]
	 * @param {function} [options.namespace] Use another namespace.
	 *
	 * @returns {boolean} Lock acquired.
	 */
	async tryLock(resources, options = {}) {
		this._checkConnection();
		let namespace = this._pickNamespace(options);
		let { p, handler } = this._createResponseHandler();
		this._io.emit('tryLock', {
			namespace: namespace,
			resources: resources,
		}, handler);
		let response = await p;
		return response.lockAcquired;
	}

	/**
	 * Release locked resources.
	 *
	 * @param {string|string[]} resources One or multiple resources to lock.
	 * @param {object} [options]
	 * @param {function} [options.namespace] Use another namespace.
	 *
	 * @returns {boolean} All released resources were locked.
	 */
	async release(resources, options = {}) {
		this._checkConnection();
		let namespace = this._pickNamespace(options);
		let { p, handler } = this._createResponseHandler();
		this._io.emit('release', {
			namespace: namespace,
			resources: resources,
		}, handler);
		let response = await p;
		return response.allReleasedResourcesWereLocked;
	}

	/**
	 * Abort lock request.
	 *
	 * @param {string} requestId Lock request id.
	 * @param {object} [options]
	 * @param {function} [options.namespace] Use another namespace.
	 *
	 * @returns {boolean} Request id was found.
	 */
	async abort(requestId, options = {}) {
		this._checkConnection();
		let namespace = this._pickNamespace(options);
		let { p, handler } = this._createResponseHandler();
		this._io.emit('abort', {
			namespace: namespace,
			requestId: requestId,
		}, handler);
		let response = await p;
		return response.requestExisted;
	}

	// eslint-disable-next-line class-methods-use-this
	async _executeFn(fn) {
		try {
			if (isFunction(fn)) {
				let val = fn();
				while (isPromise(val)) val = await val;
			} else throw new Error('Parameter "fn" is not a function.');
			return null;
		} catch (error) {
			return error;
		}
	}

	/**
	 * Execute function while resource lock is acquired.
	 *
	 * @param {string|string[]} resources One or multiple resources to lock.
	 * @param {function} fn Function to execute while resource lock is acquired.
	 * @param {object} [options]
	 * @param {function} [options.namespace] Use another namespace.
	 * @param {integer} [options.timeout=Infinity] Lock request timeout in miliseconds.
	 */
	async lock(resources, fn, options = {}) {
		if (!isFunction(fn)) throw new Error('Parameter "fn" is not a function.');
		this._checkConnection();
		let namespace = this._pickNamespace(options);

		let { p, resolve, reject } = this._createPromise();
		await this.lockRequest(resources, {
			namespace: namespace,
			resolve: resolve,
			reject: reject,
			timeout: options.timeout,
		});
		await p;

		await this._executeFn(fn);

		await this.release(resources, {
			namespace: namespace,
		});
	}
}

module.exports = Client;
