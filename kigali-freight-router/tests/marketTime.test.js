import test from 'node:test';
import assert from 'node:assert/strict';
import { marketTime, marketDateTime, MARKET_TIMEZONE } from '../utils/marketTime.js';

// A fixed instant: 02:48 UTC, which is 04:48 in Kigali.
const INSTANT = new Date('2026-08-22T02:48:22Z');

test('an alert is stamped in the market\'s time, not the server\'s', () => {
    // The bug this exists for: containers run UTC, so a bare
    // toLocaleTimeString() stamped a 04:48 Kigali incident as 02:48 and a
    // dispatcher had no reason to doubt it.
    assert.equal(new Date(INSTANT).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }), '02:48');
    assert.equal(marketTime(INSTANT), '04:48');
});

test('the zone is configurable, because the right answer is per deployment', () => {
    // Defaulted rather than fixed. Hardcoding Kigali would be the same
    // mistake one country later -- Accra is UTC+0, Lagos UTC+1.
    assert.equal(MARKET_TIMEZONE, process.env.MARKET_TIMEZONE || 'Africa/Kigali');
});

test('times are 24-hour, since 2:48 in an alert is ambiguous exactly when it matters', () => {
    assert.match(marketTime(INSTANT), /^\d{2}:\d{2}$/);
    assert.ok(!/AM|PM/i.test(marketTime(INSTANT)));
});

test('a date-time carries the day, for anything that outlives the shift', () => {
    const s = marketDateTime(INSTANT);
    assert.match(s, /22/);
    assert.match(s, /04:48/);
});

test('a bad value does not take an alert down with it', () => {
    // An alert with a broken timestamp still has to reach dispatch; the
    // incident matters more than the clock.
    assert.doesNotThrow(() => marketTime('not a date'));
});
