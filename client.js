'use strict';

const SocketIOClient = require('socket.io-client');

const isString = require('lodash.isstring');

class Client {
	// eslint-disable-next-line lines-around-comment
	/**
	 * Lock queue client constructor.
	 *
	 * @param {object} options
	 * @param {string} options.host Lock queue server url.
	 * @param {string} [options.clientName] Client name.
	 * @param {string} [options.namespace] Locks namespace. If not set a default namespace will be used.
	 * @param {string} [options.token] Authentication token.
	 */
	constructor(options = {}) {
		if (options == null) options = {};
		if (!isString(options.host)) throw new Error('Lock queue client is missing the host parameter.');
		this._options = options;

		this._io = new SocketIOClient(this._options.host);
		this._io.on('connect', this.onConnect.bind(this));

		this._io.on('connect_error', this._evt('connect_error').bind(this));
		this._io.on('connect_timeout', this._evt('connect_timeout').bind(this));
		this._io.on('reconnect', this._evt('reconnect').bind(this));
		this._io.on('reconnect_failed', this._evt('reconnect_failed').bind(this));
		this._io.on('reconnect_error', this._evt('reconnect_error').bind(this));

		this._io.on('event', this.onEvent.bind(this));
		this._io.on('disconnect', this.onDisconnect.bind(this));
		this._io.on('reconnect_attempt', this.onReconnectAttempt.bind(this));

		setInterval(() => {
			console.log('emit hello');
			this._io.emit('hello', 'world');
		}, 2000);
	}

	_evt(name) {
		let fn = function(arg) {
			console.log(name, arg);
		};
		return fn;
	}

	onReconnectAttempt() {
		console.log('reconnect_attempt');
	}

	onConnect() {
		if (isString(this._options.token)) {
			this._io.emit('authentication', {
				name: this._options.name,
				token: this._options.token,
			});
		}
		console.log('connected');
	}

	onEvent(data) {
		console.log('event', data);
	}

	onDisconnect(socket) {
		console.log('disconnected');
		// TODO: od not do this
		// setTimeout(() => {
		// 	this._io.open();
		// }, 3000);
	}

	/**
	 * Execute function while resource lock is acquired.
	 *
	 * @param {string|string[]} resources One or multiple resources to lock.
	 * @param {function} fn Function to execute while resource lock is acquired.
	 * @param {integer} [timeout=Infinity] Throw error if lock is not acquired after timeout miliseconds.
	 */
	async lock(resources, fn, timeout = Infinity) {

	}
}

module.exports = Client;
