// Pure unit tests — no database, no server, no cycle. Run with
// `node --test tests/routeSequencing.test.js`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sequenceStops, plannedDistanceMetres } from '../utils/routeSequencing.js';

const KIGALI = { lat: -1.9441, lng: 30.0619 };

test('a drop is never sequenced before its own pickup', () => {
    // The drop sits practically on top of the start and the pickup is
    // 10km away, so plain nearest-neighbour would visit the drop first
    // every single time. Precedence has to beat proximity.
    const stops = [
        { id: 1, order_id: 7, kind: 'DROP', lat: -1.9440, lng: 30.0620, status: 'PENDING' },
        { id: 2, order_id: 7, kind: 'PICKUP', lat: -1.9900, lng: 30.1500, status: 'PENDING' },
    ];
    const ordered = sequenceStops(stops, KIGALI);
    assert.deepEqual(ordered.map((s) => s.kind), ['PICKUP', 'DROP']);
});

test('holds precedence per order, not globally', () => {
    // B's pickup and drop may interleave with A's freely — the only rule is
    // that each order's own pickup precedes its own drop.
    const stops = [
        { id: 1, order_id: 1, kind: 'PICKUP', lat: -1.9450, lng: 30.0630, status: 'PENDING' },
        { id: 2, order_id: 1, kind: 'DROP', lat: -1.9700, lng: 30.1300, status: 'PENDING' },
        { id: 3, order_id: 2, kind: 'PICKUP', lat: -1.9460, lng: 30.0640, status: 'PENDING' },
        { id: 4, order_id: 2, kind: 'DROP', lat: -1.9710, lng: 30.1310, status: 'PENDING' },
    ];
    const ordered = sequenceStops(stops, KIGALI);
    const at = (order, kind) => ordered.findIndex((s) => s.order_id === order && s.kind === kind);
    assert.ok(at(1, 'PICKUP') < at(1, 'DROP'));
    assert.ok(at(2, 'PICKUP') < at(2, 'DROP'));
    assert.equal(ordered.length, 4);
});

test('a drop whose pickup is already done is free to be visited', () => {
    // Cargo collected on an earlier run: there is no pickup stop left to
    // wait for, so the drop must not be held back forever.
    const stops = [
        { id: 1, order_id: 7, kind: 'PICKUP', lat: -1.9900, lng: 30.1500, status: 'DONE' },
        { id: 2, order_id: 7, kind: 'DROP', lat: -1.9440, lng: 30.0620, status: 'PENDING' },
    ];
    const ordered = sequenceStops(stops.filter((s) => s.status === 'PENDING'), KIGALI);
    assert.deepEqual(ordered.map((s) => s.kind), ['DROP']);

    // And when both are passed in, the settled pickup still unblocks it.
    const both = sequenceStops(stops, KIGALI);
    assert.equal(both.length, 2);
});

test('picks the nearer of two eligible stops', () => {
    const stops = [
        { id: 1, order_id: 1, kind: 'PICKUP', lat: -2.0500, lng: 30.2000, status: 'PENDING' },
        { id: 2, order_id: 2, kind: 'PICKUP', lat: -1.9450, lng: 30.0625, status: 'PENDING' },
    ];
    assert.deepEqual(sequenceStops(stops, KIGALI).map((s) => s.id), [2, 1]);
});

test('stops with no coordinates are still returned, never dropped', () => {
    // A customer order that dispatch has not placed on the map yet has no
    // lat/lng. Silently losing it from the sequence would lose the job.
    const stops = [
        { id: 1, order_id: 1, kind: 'PICKUP', lat: null, lng: null, status: 'PENDING' },
        { id: 2, order_id: 1, kind: 'DROP', lat: -1.9450, lng: 30.0625, status: 'PENDING' },
    ];
    const ordered = sequenceStops(stops, KIGALI);
    assert.equal(ordered.length, 2);
    assert.deepEqual(ordered.map((s) => s.kind), ['PICKUP', 'DROP']);
});

test('terminates when a drop has no pickup in the list at all', () => {
    // Malformed input rather than a real plan, but an infinite loop here
    // would hang a request thread, so it has to drain regardless.
    const stops = [{ id: 1, order_id: 9, kind: 'DROP', lat: -1.95, lng: 30.06, status: 'PENDING' }];
    assert.equal(sequenceStops(stops, KIGALI).length, 1);
});

test('planned distance sums the legs and ignores unplaced stops', () => {
    const stops = [
        { id: 1, kind: 'PICKUP', lat: -1.9441, lng: 30.0619 },
        { id: 2, kind: 'DROP', lat: null, lng: null },
        { id: 3, kind: 'DROP', lat: -1.9541, lng: 30.0619 },
    ];
    const metres = plannedDistanceMetres(stops, KIGALI);
    // ~0.01 degree of latitude is ~1.11km, and the unplaced stop adds nothing.
    assert.ok(metres > 1000 && metres < 1200, `expected ~1.1km, got ${metres}`);
});
