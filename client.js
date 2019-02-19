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

		let promiseObj = this._client._createPromise();
		this.promise = promiseObj.p;
		this._presolve = promiseObj.resolve;
		this._preject = promiseObj.reject;

		// Prevent unhandled promises.
		this.promise.then(() => {});
		this.promise.catch(() => {});
	}

	async _sendResolve() {
		try {
			this._presolve();
		} catch (error) { }
		try {
			if (isFunction(this._resolve)) {
				let val = this._resolve();
				while (isPromise(val)) val = await val;
			}
		} catch (error) { }
	}

	async _sendReject(message) {
		try {
			this._preject(new Error(message));
		} catch (error) { }
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
		setTimeout(() => this._sendResolve(), 0);
	}

	reject(message) {
		if (this._isFinished) return;
		this._isFinished = true;
		setTimeout(() => this._sendReject(message), 0);
	}

	async abort() {
		this._client.abort(this._id);
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
	 * @param {function} [options.logError] Error logs function.
	 */
	constructor(options = {}) {
		if (options == null) options = {};
		if (!isString(options.host)) throw new Error('Lock queue client is missing the host parameter.');
		if (!isString(options.namespace)) options.namespace = null;
		this._options = options;

		if (!isFunction(this._options.logError)) this._options.logError = null;

		this._requests = new DoubleMap();
		this._newRequests = new Set();
		this._unsettledEmits = new Set();

		this._connectionPromise = null;
		this._connectionStatus = 'connect';

		this._io = new SocketIOClient(this._options.host);
		this._io.on('lockResponse', this._onLockResponse.bind(this));
		this._io.on('connect', this._onConnect.bind(this));
		this._io.on('disconnect', this._onDisconnect.bind(this));
		this._io.on('authenticated', this._onAuthenticated.bind(this));
		this._io.on('connect_error', this._onConnectError.bind(this));
		this._io.on('unauthorized', this._onUnauthorized.bind(this));
	}

	// eslint-disable-next-line class-methods-use-this
	_log(type, message) {
		if (type === 'error') {
			if (this._options.logError != null) this._options.logError(message);
		}
	}

	_getStatusErrorMsg() {
		if (this._connectionStatus === 'unauthorized') return 'Lock queue client unauthorized.';
		if (this._connectionStatus === 'disconnected') return 'Lock queue server unreachable.';
		return null;
	}

	_setConnectionStatus(status) {
		this._connectionStatus = status;
		if (this._connectionStatus === 'connect') return;
		if (this._connectionPromise != null) {
			if (this._connectionStatus === 'ok') {
				this._connectionPromise.resolve();
			} else {
				this._connectionPromise.reject(new Error(this._getStatusErrorMsg()));
			}
			this._connectionPromise = null;
		}
	}

	// eslint-disable-next-line class-methods-use-this
	_onAuthenticated() {
		this._setConnectionStatus('ok');
	}

	_onUnauthorized() {
		this._setConnectionStatus('unauthorized');
	}

	_onConnect() {
		this._setConnectionStatus('connect');
		if (isString(this._options.token)) {
			this._io.emit('authentication', {
				name: this._options.name,
				token: this._options.token,
			});
		}
	}

	_onConnectError() {
		this._setConnectionStatus('disconnected');
	}

	_onDisconnect(reason) {
		if (reason === 'unauthorized') this._setConnectionStatus('unauthorized');
		else this._setConnectionStatus('disconnected');

		// Reject all unsettled lock requests.
		if (this._requests.size > 0) {
			let reqs = this._requests.toArray();
			this._requests = new DoubleMap();
			for (let req of reqs) req.value.reject('Disconnected from lock queue server.');
		}

		// Reject all unsettled emits.
		if (this._unsettledEmits.size > 0) {
			let emits = Array.from(this._unsettledEmits);
			this._unsettledEmits = new Set();
			for (let emit of emits) emit.reject(new Error('Disconnected from lock queue server.'));
		}
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
		let emit = this._createPromise();
		this._unsettledEmits.add(emit);
		let handler = (data) => {
			this._unsettledEmits.delete(emit);
			if (data.success) emit.resolve(data);
			else emit.reject(new Error(data.error));
		};
		return {
			p: emit.p,
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
			this._log('error', 'Unresolved lock response: ' + JSON.stringify(data));
			return;
		}
		let request = this._requests.get(data.namespace, data.requestId);
		this._requests.delete(data.namespace, data.requestId);
		if (data.success) request.resolve();
		else request.reject(data.message);
	}

	async _checkConnection() {
		if (this._connectionStatus === 'ok') return;
		else if (this._connectionStatus === 'connect') {
			if (this._connectionPromise == null) {
				this._connectionPromise = this._createPromise();
			}
			await this._connectionPromise.p;
		} else throw new Error(this._getStatusErrorMsg());
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
		await this._checkConnection();
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

	io() {
		return this._io;
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
		await this._checkConnection();
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
		await this._checkConnection();
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
		await this._checkConnection();
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
			if (!isFunction(fn)) throw new Error('Parameter "fn" is not a function.');
			let val = fn();
			while (isPromise(val)) val = await val;
			return { val: val };
		} catch (error) {
			return { error: error };
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
		await this._checkConnection();
		let namespace = this._pickNamespace(options);

		let request = await this.lockRequest(resources, {
			namespace: namespace,
			timeout: options.timeout,
		});
		await request.promise;

		let result = await this._executeFn(fn);

		// NOTE: No need to await release.
		this.release(resources, {
			namespace: namespace,
		}).catch((error) => {
			this._log('error', 'Release lock failed: ' + error.message);
		});

		if ('error' in result) throw result.error;
		return result.val;
	}
}

module.exports = Client;
