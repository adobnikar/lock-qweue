'use strict';

// TODO:
// - namespace support
// - authentication support
// - maybe localhost restriction support

const Log = require('unklogger');
const Joi = require('./joi-ext');
const SocketIOServer = require('socket.io');
const LockSpace = require('./lock-space');

const isInteger = require('lodash.isinteger');
const isString = require('lodash.isstring');
const find = require('lodash.find');
const each = require('lodash.foreach');

class Server {
	// eslint-disable-next-line lines-around-comment
	/**
	 * Lock queue server constructor.
	 *
	 * @param {object} options
	 * @param {integer} options.port
	 * @param {integer} [options.maxPending=Infinity] Max pending lock requests per namespace.
	 * @param {string} [options.token] Authentication token.
	 */
	constructor(options = {}) {
		if (options == null) options = {};
		if (!isInteger(options.port)) throw new Error('Lock queue server port must be an integer.');
		if (!isInteger(options.maxPending)) options.maxPending = Infinity;
		this._options = options;

		this._spaces = new Map();

		this._io = new SocketIOServer();
		each(this._io.nsps, this._forbidConnections); // Auth middleware.
		this._io.on('connection', this._onConnection.bind(this));
		this._io.listen(this._options.port);
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

	_getSpace(namespace) {
		if (!this._spaces.has(namespace)) {
			this._spaces.set(namespace, new LockSpace(this._options.maxPending));
		}
		return this._spaces.get(namespace);
	}

	_onConnection(socket) {
		socket.auth = false;
		Log.info(`Client with id "${socket.id}" connected from "${socket.handshake.address}".`);

		socket.on('authentication', (data) => {
			if (isString(data.name)) {
				socket.name = data.name;
				Log.info(`Client with id "${socket.id}" registered as "${socket.name}".`);
			} else socket.name = 'no name';

			if (isString(this._options.token)) {
				if (data.token === this._options.token) {
					socket.auth = true;
					each(this._io.nsps, (nsp) => this._restoreConnection(nsp, socket));
					socket.emit('authenticated', true);
					Log.success(`Client "${socket.id}" - "${socket.name}" authenticated successfully.`);
				} else {
					Log.error(`Client "${socket.id}" - "${socket.name}" is unauthorized.`);
					socket.emit('unauthorized', { message: 'Invalid token.' });
				}
			} else socket.auth = true;
		});

		socket.on('tryLock', (data, ack) => {
			if (!socket.auth) return;
			try {
				let body = Joi.validate(data, Joi.object().keys({
					namespace: Joi.string().allow(null).default(null),
					resources: Joi.array().items(Joi.string()).single().min(1).rquired(),
				}));

				let space = this._getSpace(body.namespace);
				let response = space.tryLock(body.resources);

				ack({
					success: true,
					response: response,
				});
			} catch (error) {
				ack({
					success: false,
					error: error.message,
				});
			}
		});

		socket.on('lock', (data, ack) => {
			if (!socket.auth) return;
			try {
				let body = Joi.validate(data, Joi.object().keys({
					namespace: Joi.string().allow(null).default(null),
					resources: Joi.array().items(Joi.string()).single().min(1).rquired(),
				}));

				let space = this._getSpace(body.namespace);
				let response = space.lock(body.resources);

				// TODO: generate a unique id and callback when acquired !!!

				ack({
					success: true,
					response: response,
				});
			} catch (error) {
				ack({
					success: false,
					error: error.message,
				});
			}
		});

		socket.on('release', (data, ack) => {
			if (!socket.auth) return;
			try {
				let body = Joi.validate(data, Joi.object().keys({
					namespace: Joi.string().allow(null).default(null),
					resources: Joi.array().items(Joi.string()).single().min(1).rquired(),
				}));

				if (!this._spaces.has(body.namespace)) {
					this._spaces.set(body.namespace, new LockSpace(this._options.maxPending));
				}
				let space = this._spaces.get(body.namespace);
				let response = space.release(body.resources);

				ack({
					success: true,
					response: response,
				});
			} catch (error) {
				ack({
					success: false,
					error: error.message,
				});
			}
		});

		// Auth timeout.
		setTimeout(() => {
			// If the socket didn't authenticate after connection, disconnect it.
			if (!socket.auth) {
				Log.info(`Disconnecting unauthorized socket ${socket.id}`);
				socket.disconnect('unauthorized');
			}
		}, 1000);

		socket.on('disconnect', (reason) => {
			Log.info(`Client with id ${socket.id} disconnected.`);
		});
	}
}

module.exports = Server;
