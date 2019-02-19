'use strict';

// TODO:
// - maybe localhost restriction support

const Joi = require('./joi-ext');
const SocketIOServer = require('socket.io');
const LockUniverse = require('./lock-universe');

const isFunction = require('lodash.isfunction');
const isInteger = require('lodash.isinteger');
const isString = require('lodash.isstring');
const find = require('lodash.find');
const each = require('lodash.foreach');

function isInt(value) {
	if (isString(value)) value = parseInt(value);
	return isInteger(value);
}

function toInt(value) {
	if (isString(value)) value = parseInt(value);
	return value;
}

class Server {
	// eslint-disable-next-line lines-around-comment
	/**
	 * Lock queue server constructor.
	 *
	 * @param {object} options
	 * @param {integer} [options.port]
	 * @param {integer} [options.maxPending=Infinity] Max pending lock requests per namespace.
	 * @param {string} [options.token] Authentication token.
	 * @param {function} [options.logInfo] Info logs function.
	 * @param {function} [options.logSuccess] Success logs function.
	 * @param {function} [options.logError] Error logs function.
	 */
	constructor(options = {}) {
		if (options == null) options = {};
		if ((options.port != null) && !isInt(options.port)) throw new Error('Lock queue server port must be an integer.');
		if (!isInt(options.maxPending)) options.maxPending = Infinity;
		this._options = options;

		if (!isFunction(this._options.logInfo)) this._options.logInfo = null;
		if (!isFunction(this._options.logSuccess)) this._options.logSuccess = null;
		if (!isFunction(this._options.logError)) this._options.logError = null;

		this._spaces = new LockUniverse(this._options.maxPending);

		this._io = new SocketIOServer();
		each(this._io.nsps, this._forbidConnections); // Auth middleware.
		this._io.on('connection', this._onConnection.bind(this));
		if (isInt(this._options.port)) this.listen(this._options.port);
	}

	// eslint-disable-next-line class-methods-use-this
	_log(type, message) {
		if (type === 'info') {
			if (this._options.logInfo != null) this._options.logInfo(message);
		} else if (type === 'success') {
			if (this._options.logSuccess != null) this._options.logSuccess(message);
		} else if (type === 'error') {
			if (this._options.logError != null) this._options.logError(message);
		}
	}

	listen(port) {
		if (!isInt(port)) throw new Error('Lock queue server port must be an integer.');
		this._options.port = port;
		this._io.listen(toInt(this._options.port));
		this._log('info', `Lock qweue server listening on port ${this._options.port}.`);
	}

	close() {
		this._io.close();
		this._log('info', 'Lock qweue server closed.');
	}

	io() {
		return this._io;
	}

	// eslint-disable-next-line class-methods-use-this
	_forbidConnections(nsp) {
		nsp.on('connect', (socket) => {
			if (!socket.auth) {
				// debug('removing socket from %s', nsp.name);
				delete nsp.connected[socket.id];
			}
		});
	}

	// eslint-disable-next-line class-methods-use-this
	_restoreConnection(nsp, socket) {
		if (find(nsp.sockets, { id: socket.id })) {
			// debug('restoring socket to %s', nsp.name);
			nsp.connected[socket.id] = socket;
		}
	}

	// eslint-disable-next-line class-methods-use-this
	_mw(socket, data, ack, fn) {
		if (!socket.auth) return;
		if (socket._isDead) return;
		try {
			fn(socket, data, (ackData) => {
				ackData.success = true;
				ack(ackData);
			});
		} catch (error) {
			ack({
				success: false,
				error: error.message,
			});
		}
	}

	_tryLock(socket, data, ack) {
		let body = Joi.validate(data, Joi.object().keys({
			namespace: Joi.string().allow(null).default(null),
			resources: Joi.array().items(Joi.string()).single().min(1).required(),
		}));
		let lockAcquired = this._spaces.tryLock(socket.id, body.namespace, body.resources);
		ack({ lockAcquired: lockAcquired });
	}

	_lock(socket, data, ack) {
		let body = Joi.validate(data, Joi.object().keys({
			namespace: Joi.string().allow(null).default(null),
			resources: Joi.array().items(Joi.string()).single().min(1).required(),
			timeout: Joi.number().integer().min(0).allow(null).default(null),
		}));

		let requestId = this._spaces.lock(socket.id, body.namespace, body.resources, () => {
			if (socket._isDead) return;
			socket.emit('lockResponse', {
				success: true,
				namespace: body.namespace,
				requestId: requestId,
			});
		}, (error) => {
			if (socket._isDead) return;
			socket.emit('lockResponse', {
				success: false,
				namespace: body.namespace,
				requestId: requestId,
				message: error.message,
			});
		}, body.timeout);

		ack({ requestId: requestId });
	}

	_release(socket, data, ack) {
		let body = Joi.validate(data, Joi.object().keys({
			namespace: Joi.string().allow(null).default(null),
			resources: Joi.array().items(Joi.string()).single().min(1).required(),
		}));
		let allReleasedResourcesWereLocked = this._spaces.release(socket.id, body.namespace, body.resources);
		ack({ allReleasedResourcesWereLocked: allReleasedResourcesWereLocked });
	}

	_abort(socket, data, ack) {
		let body = Joi.validate(data, Joi.object().keys({
			namespace: Joi.string().allow(null).default(null),
			requestId: Joi.string().required(),
		}));
		let requestExisted = this._spaces.abort(socket.id, body.namespace, body.requestId);
		ack({ requestExisted: requestExisted });
	}

	_setAuthenticated(socket) {
		socket.auth = true;
		each(this._io.nsps, (nsp) => this._restoreConnection(nsp, socket));
		socket.emit('authenticated', true);
	}

	_onConnection(socket) {
		socket.auth = false;
		socket._isDead = false;
		this._log('info', `Client with id "${socket.id}" connected from "${socket.handshake.address}".`);

		socket.on('authentication', (data) => {
			if (isString(data.name)) {
				socket.name = data.name;
				this._log('info', `Client with id "${socket.id}" registered as "${socket.name}".`);
			} else socket.name = 'no name';

			if (isString(this._options.token)) {
				if (data.token === this._options.token) {
					this._setAuthenticated(socket);
					this._log('success', `Client "${socket.id}" - "${socket.name}" authenticated successfully.`);
				} else {
					this._log('error', `Client "${socket.id}" - "${socket.name}" is unauthorized.`);
					socket.emit('unauthorized', { message: 'Invalid token.' });
				}
			} else this._setAuthenticated(socket);
		});

		socket.on('tryLock', (data, ack) => this._mw(socket, data, ack, this._tryLock.bind(this)));
		socket.on('lock', (data, ack) => this._mw(socket, data, ack, this._lock.bind(this)));
		socket.on('release', (data, ack) => this._mw(socket, data, ack, this._release.bind(this)));
		socket.on('abort', (data, ack) => this._mw(socket, data, ack, this._abort.bind(this)));

		// Auth timeout.
		setTimeout(() => {
			// If the socket didn't authenticate after connection, disconnect it.
			if (!socket.auth) {
				this._log('info', `Disconnecting unauthorized socket ${socket.id}`);
				socket.disconnect('unauthorized');
			}
		}, 2000);

		socket.on('disconnect', (reason) => {
			socket._isDead = true;
			this._spaces.releaseClient(socket.id);
			this._log('info', `Client with id ${socket.id} disconnected.`);
		});
	}
}

module.exports = Server;
