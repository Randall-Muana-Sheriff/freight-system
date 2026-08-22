import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from '../utils/phone.js';

// The behaviour that must not change. A dispatcher typing a number into the
// web invite form and a driver typing the same number into the app have to
// land on the same users row, whatever shape each of them used.
test('every shape a Rwandan number arrives in still resolves to one form', () => {
    for (const shape of ['+250788123456', '250788123456', '0788123456', '788123456', '(078) 812-3456', ' +250 788 123 456 ']) {
        assert.equal(normalizePhone(shape), '+250788123456', `${shape} did not normalise`);
    }
});

// The blocker this replaced. The old rule hardcoded the 250 dialling code and
// ^7[0-9]{8}, so nobody outside Rwanda could sign in or place an order.
test('numbers from the countries this might expand into are accepted', () => {
    const expected = {
        '+233241234567': '+233241234567',   // Ghana
        '+2348012345678': '+2348012345678', // Nigeria, ten national digits
        '+254712345678': '+254712345678',   // Kenya
        '+256772123456': '+256772123456',   // Uganda
        '+255754123456': '+255754123456',   // Tanzania
        '+231770123456': '+231770123456',   // Liberia
    };
    for (const [input, want] of Object.entries(expected)) {
        assert.equal(normalizePhone(input), want, `${input} was rejected`);
    }
});

// Every account here is reached by SMS. A landline validates as a real number,
// would be accepted, and then never receives the code -- which to the person
// holding it is indistinguishable from the system being broken.
test('a landline is refused, because it can never receive the code', () => {
    assert.equal(normalizePhone('+250252584562'), null);
});

test('nonsense is refused without throwing', () => {
    for (const bad of ['', '   ', '12345', 'not a phone', '+999999999999', '++250788123456', null, undefined, 42, {}]) {
        assert.doesNotThrow(() => normalizePhone(bad));
        assert.equal(normalizePhone(bad), null, `${JSON.stringify(bad)} was accepted`);
    }
});

test('a number too short or too long for its country is refused', () => {
    assert.equal(normalizePhone('+25078812345'), null, 'one digit short for Rwanda');
    assert.equal(normalizePhone('+2507881234567'), null, 'one digit long for Rwanda');
});

// Normalising twice must not change anything, or a re-saved record drifts away
// from the row it belongs to.
test('normalising an already-normalised number is a no-op', () => {
    const once = normalizePhone('0788123456');
    assert.equal(normalizePhone(once), once);
});
