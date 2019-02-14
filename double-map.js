'use strict';

class DoubleMap {
	constructor() {
		this._map = new Map();
		this.size = 0;
	}

	set(key1, key2, value) {
		if (!this._map.has(key1)) this._map.set(key1, new Map());
		let subMap = this._map.get(key1);
		if (!subMap.has(key2)) this.size++;
		return subMap.set(key2, value);
	}

	has(key1, key2) {
		if (!this._map.has(key1)) return false;
		let subMap = this._map.get(key1);
		return subMap.has(key2);
	}

	get(key1, key2) {
		let subMap = this._map.get(key1);
		if (!this._map.has(key1)) return subMap;
		return subMap.get(key2);
	}

	delete(key1, key2) {
		if (!this._map.has(key1)) return this._map.delete(key1);
		let subMap = this._map.get(key1);
		if (subMap.has(key2)) {
			this.size--;
			if (subMap.size <= 1) return this._map.delete(key1);
		}
		return subMap.delete(key2);
	}

	toArray() {
		let arr = [];
		let keys1 = Array.from(this._map.keys());
		for (let key1 of keys1) {
			let keys2 = this._map.get(key1);
			for (let [key2, value] of keys2) arr.push({
				key1: key1,
				key2: key2,
				value: value,
			});
		}
		return arr;
	}
}

module.exports = DoubleMap;
