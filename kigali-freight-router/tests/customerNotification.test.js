import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { shouldNotify, NOTIFIED_STATUSES } from '../utils/customerNotices.js';

describe('which status changes earn a customer an SMS', () => {
    test('the moments worth paying for', () => {
        assert.equal(shouldNotify('ASSIGNED', 'PICKED_UP'), true);
        assert.equal(shouldNotify('IN_TRANSIT', 'DELIVERED'), true);
        assert.equal(shouldNotify('ASSIGNED', 'CANCELLED'), true);
    });

    test('the ones that would just cost money', () => {
        // A driver's name is not news until the cargo moves; IN_TRANSIT and
        // ARRIVED are the same journey from outside the cab, and the knock
        // at the door is its own notification.
        assert.equal(shouldNotify('PENDING', 'ASSIGNED'), false);
        assert.equal(shouldNotify('PICKED_UP', 'IN_TRANSIT'), false);
        assert.equal(shouldNotify('IN_TRANSIT', 'ARRIVED'), false);
    });

    test('a status re-set to itself sends nothing', () => {
        // Both call sites can be reached more than once for the same
        // transition — a retried request, a stop marked done twice. Texting
        // someone twice about one delivery is worse than not texting them.
        assert.equal(shouldNotify('DELIVERED', 'DELIVERED'), false);
        assert.equal(shouldNotify('PICKED_UP', 'PICKED_UP'), false);
    });

    test('a missing or unknown status is not a reason to text anyone', () => {
        assert.equal(shouldNotify('PENDING', null), false);
        assert.equal(shouldNotify('PENDING', undefined), false);
        assert.equal(shouldNotify('PENDING', 'INVENTED'), false);
    });

    test('the notified set is exactly the three intended', () => {
        // Pinned so widening it is a deliberate act with a cost attached,
        // not something that drifts in.
        assert.deepEqual([...NOTIFIED_STATUSES].sort(), ['CANCELLED', 'DELIVERED', 'PICKED_UP']);
    });
});
