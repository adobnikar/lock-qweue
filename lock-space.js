'use strict';

class LockSpace {
	constructor() {
		this._queue = [];
		this._lockedResources = new Set();
	}

	_processQueue() {
		let completed = [];
		for (let i = 0; i < this._queue.length; i++) {
			let task = this._queue[i];
			if (this.tryLock(task.resources)) {
				this._queue.splice(i, 1);
				i--;
				completed.push(task);
			}
		}
		for (let task of completed) {
			try {
				task.resolve();
			} catch (error) { }
		}
	}

	tryLock(resources) {
		for (let r of resources) {
			if (this._lockedResources.has(r)) return false;
		}
		for (let r of resources) {
			this._lockedResources.add(r);
		}
		return true;
	}

	async lock(resources) {
		let presolve = null;
		let preject = null;
		let p = new Promise((resolve, reject) => {
			presolve = resolve;
			preject = reject;
		});
		this.lockRequest(resources, presolve, preject);
		await p;
	}

	release(resources) {
		for (let r of resources) {
			this._lockedResources.delete(r);
		}
		this._processQueue();
	}

	lockRequest(resources, resolve, reject) {
		this._queue.push({
			resources: resources,
			resolve: resolve,
			reject: reject,
		});
		this._processQueue();
	}
}

/**
 * Export class.
 * @type {Object}
 */
module.exports = LockSpace;
