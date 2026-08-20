import test from 'node:test';
import assert from 'node:assert/strict';
import { isSensitiveKey, redactString, scrubTree } from '../utils/redaction.js';

test('redacts credentials and personal data', () => {
    for (const key of [
        'pin', 'otp', 'token', 'secret', 'password', 'authorization', 'cookie',
        'otpCode', 'pinCode', 'resetPasswordToken', 'trackingCode',
        'phone', 'phoneNumber', 'recipient_phone', 'driverPhoneNumber', 'msisdn',
        'address', 'pickup_address', 'latitude', 'longitude',
        'lat', 'lng', 'pickup_lat', 'delivery_lng',
    ]) {
        assert.equal(isSensitiveKey(key), true, `${key} should be redacted`);
    }
});

// The failure this file exists for. The first implementation matched
// substrings anywhere, so `error_code` was redacted — the most useful tag on
// a server-fault report — and `latency` would have been too. Over-redaction
// reads as safe and is not: it destroys the diagnostic value silently.
test('keeps diagnostic fields that merely contain a sensitive substring', () => {
    for (const key of [
        'error_code', 'errorCode', 'code', 'statusCode', 'http_status',
        'latency', 'translation', 'template', 'longName',
        'requestId', 'route', 'method', 'durationMs',
    ]) {
        assert.equal(isSensitiveKey(key), false, `${key} should NOT be redacted`);
    }
});

test('redacts phone numbers by shape, in every form the app writes them', () => {
    assert.equal(redactString('call +250788123456 now'), 'call [phone] now');
    assert.equal(redactString('from 250788123456'), 'from [phone]');
    assert.equal(redactString('local 0788123456 here'), 'local [phone] here');
    assert.equal(redactString('order INZ-4B2C is fine'), 'order INZ-4B2C is fine');
});

test('walks nested structures and survives depth', () => {
    const out = scrubTree({
        error_code: 'TRACK_FAILED',
        user: { phone: '0788123456', name: 'Jean' },
        note: 'reached 0788123456',
        list: [{ pin: '4819' }, { code: 'OK' }],
    });
    assert.equal(out.error_code, 'TRACK_FAILED');
    assert.equal(out.user.phone, '[redacted]');
    assert.equal(out.user.name, 'Jean');
    assert.equal(out.note, 'reached [phone]');
    assert.equal(out.list[0].pin, '[redacted]');
    assert.equal(out.list[1].code, 'OK');
});

test('does not throw on cycles or exotic values', () => {
    const cyclic = { name: 'a' };
    cyclic.self = cyclic;
    assert.doesNotThrow(() => scrubTree(cyclic));
    assert.doesNotThrow(() => scrubTree(null));
    assert.doesNotThrow(() => scrubTree(undefined));
});
