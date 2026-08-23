import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileNetwork, canReceiveMomoPrompt, toMsisdn } from '../utils/phone.js';

// MTN Mobile Money can only charge an MTN subscriber. Getting this wrong
// costs a driver a minute standing at a gate watching for a prompt that was
// never going to arrive, so the rule is asserted rather than assumed.
test('only MTN numbers can be sent a MoMo prompt', () => {
    for (const mtn of ['+250788123456', '+250790804004', '0788123456']) {
        assert.equal(mobileNetwork(mtn), 'MTN', `${mtn} is MTN`);
        assert.equal(canReceiveMomoPrompt(mtn), true);
    }
    // Airtel Rwanda. A real, valid, reachable mobile that simply cannot
    // receive this prompt — the case the "pay from another number" field
    // exists for.
    for (const airtel of ['+250728360944', '+250733123456', '+250771234567']) {
        assert.equal(mobileNetwork(airtel), 'OTHER', `${airtel} is not MTN`);
        assert.equal(canReceiveMomoPrompt(airtel), false);
    }
});

// Guessing wrong in the direction of "this is MTN" is the expensive
// direction, so anything unrecognised must refuse rather than try.
test('an unknown or foreign number is never assumed chargeable', () => {
    for (const other of ['+250712549744', '+44 7700 900000', 'not a phone', '', null, undefined]) {
        assert.equal(canReceiveMomoPrompt(other), false, `${other} must not be treated as chargeable`);
    }
});

// MTN rejects a partyId with a leading +, and does it in a way that looks
// like a configuration problem rather than a formatting one.
test('an MSISDN is bare digits, or nothing at all', () => {
    assert.equal(toMsisdn('+250788123456'), '250788123456');
    assert.equal(toMsisdn('0788123456'), '250788123456');
    assert.equal(toMsisdn('250 788 123 456'), '250788123456');
    assert.equal(toMsisdn('rubbish'), null, 'a number the API would reject never reaches it');
});
