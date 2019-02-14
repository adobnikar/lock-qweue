'use strict';

class DoubleSet {
	constructor() {
		this._map = new Map();
		this.size = 0;
	}

	add(key1, key2) {
		if (!this._map.has(key1)) this._map.set(key1, new Set());
		let subSet = this._map.get(key1);
		if (!subSet.has(key2)) this.size++;
		return subSet.add(key2);
	}

	has(key1, key2) {
		if (!this._map.has(key1)) return false;
		let subSet = this._map.get(key1);
		return subSet.has(key2);
	}

	delete(key1, key2) {
		if (!this._map.has(key1)) return this._map.delete(key1);
		let subSet = this._map.get(key1);
		if (subSet.has(key2)) {
			this.size--;
			if (subSet.size <= 1) return this._map.delete(key1);
		}
		return subSet.delete(key2);
	}

	toArray() {
		let arr = [];
		let keys1 = Array.from(this._map.keys());
		for (let key1 of keys1) {
			let keys2 = Array.from(this._map.get(key1));
			for (let key2 of keys2) arr.push({
				key1: key1,
				key2: key2,
			});
		}
		return arr;
	}
}

module.exports = DoubleSet;
