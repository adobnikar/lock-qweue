'use strict';

function debugLockSpace(lockSpace) {
	let lastQueueLength = 0;
	let lastActualQueueLength = 0;
	let lastLockedResources = 0;
	setInterval(() => {
		let actualQueueLength = 0;
		let item = lockSpace._queue.head;
		while (item != null) {
			actualQueueLength++;
			item = item.next;
		}
		if (actualQueueLength !== lockSpace._queueLength) {
			console.error(`Queue length does not match: counter is ${lockSpace._queueLength}, actual is ${actualQueueLength}.`);
		}
		if ((lastQueueLength !== lockSpace._queueLength) || (lastActualQueueLength !== actualQueueLength) || (lastLockedResources !== lockSpace._lockedResources.size)) {
			console.log(`Queue stats: length is ${actualQueueLength}, locked resources count is ${lockSpace._lockedResources.size}.`);
		}

		lastQueueLength = lockSpace._queueLength;
		lastActualQueueLength = actualQueueLength;
		lastLockedResources = lockSpace._lockedResources.size;
	}, 10);
}

module.exports = {
	debugLockSpace,
};
