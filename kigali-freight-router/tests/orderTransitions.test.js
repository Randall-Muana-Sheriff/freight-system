import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, refusalFor, isTerminal, DELIVERABLE_FROM } from '../utils/orderTransitions.js';

// The bug this file exists for, reproduced against a real driver session
// before it was fixed: ASSIGNED -> DELIVERED in one request, no photo, no
// recipient code, no confirmation row. confirmDelivery demanded evidence and
// the status endpoint handed out the same state for free.
test('DELIVERED is unreachable by changing status, from anywhere', () => {
    for (const from of ['PENDING', 'OFFERED', 'ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED']) {
        assert.equal(canTransition(from, 'DELIVERED'), false, `${from} -> DELIVERED must be refused`);
    }
    // And the refusal says what to do instead, rather than "invalid status".
    assert.equal(refusalFor('ARRIVED', 'DELIVERED').code, 'ORDERS_STATUS_NEEDS_PROOF');
    assert.match(refusalFor('ARRIVED', 'DELIVERED').message, /photo|code/i);
});

test('a delivery can only be confirmed from arrived', () => {
    assert.deepEqual(DELIVERABLE_FROM, ['ARRIVED']);
});

// A finished job is finished. Before this, DELIVERED -> PENDING, ASSIGNED,
// IN_TRANSIT and CANCELLED were all accepted — and the last one matters most
// now, because payment_status is separate and nothing clears it: a paid,
// delivered order could be cancelled while still reading PAID.
test('terminal states cannot be left', () => {
    for (const terminal of ['DELIVERED', 'CANCELLED']) {
        assert.ok(isTerminal(terminal));
        for (const to of ['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'ARRIVED', 'CANCELLED', 'DELIVERED']) {
            assert.equal(canTransition(terminal, to), false, `${terminal} -> ${to} must be refused`);
        }
        assert.equal(refusalFor(terminal, 'PENDING').code, 'ORDERS_STATUS_TERMINAL');
    }
});

// Derived from what the driver app actually walks, not from what looked
// tidy: it sends AT_PICKUP, IN_TRANSIT and ARRIVED, never PICKED_UP, and
// hands DELIVERED to the proof flow.
test('the real driver journey is allowed end to end', () => {
    for (const [from, to] of [
        ['PENDING', 'ASSIGNED'], ['ASSIGNED', 'AT_PICKUP'],
        ['AT_PICKUP', 'IN_TRANSIT'], ['IN_TRANSIT', 'ARRIVED'],
    ]) {
        assert.equal(canTransition(from, to), true, `${from} -> ${to} is a real step and must be allowed`);
    }
    // Older records and other clients still use PICKED_UP.
    assert.equal(canTransition('ASSIGNED', 'PICKED_UP'), true);
    assert.equal(canTransition('PICKED_UP', 'IN_TRANSIT'), true);
    // Untidy but harmless: skips no proof and no money.
    assert.equal(canTransition('ASSIGNED', 'IN_TRANSIT'), true);
});

test('a job cannot go backwards or skip the road', () => {
    assert.equal(canTransition('ARRIVED', 'IN_TRANSIT'), false, 'no reversing');
    assert.equal(canTransition('IN_TRANSIT', 'AT_PICKUP'), false, 'no reversing');
    assert.equal(canTransition('ASSIGNED', 'ARRIVED'), false, 'cannot arrive without travelling');
    assert.equal(refusalFor('ASSIGNED', 'ARRIVED').code, 'ORDERS_STATUS_OUT_OF_SEQUENCE');
});

// Reassigning keeps the order ASSIGNED, and unassigning returns it to the
// queue. Both are real dispatcher actions, and a same-state rule that
// forbade them would break the board.
test('reassignment and unassignment stay possible', () => {
    assert.equal(canTransition('ASSIGNED', 'ASSIGNED'), true, 'reassign to another driver');
    assert.equal(canTransition('ASSIGNED', 'PENDING'), true, 'unassign back to the queue');
    assert.equal(canTransition('OFFERED', 'PENDING'), true, 'a declined offer returns to the queue');
    // But nothing else may sit still.
    assert.equal(canTransition('IN_TRANSIT', 'IN_TRANSIT'), false);
});

test('anything may be cancelled until it is finished', () => {
    for (const from of ['PENDING', 'OFFERED', 'ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED']) {
        assert.equal(canTransition(from, 'CANCELLED'), true, `${from} must be cancellable`);
    }
});
