// Decides which keys must never carry their value into an error report.
//
// Extracted and given tests because the first version was a single loose
// regex — /(pin|otp|code|...|lat|...)/i — that matched substrings anywhere
// in a key. It redacted `error_code`, which is the single most useful tag
// on a server-fault report, and would have redacted `latency` for
// containing "lat". Over-redaction is not the safe direction it looks like:
// it quietly destroys the diagnostic value the reports exist for, and
// nobody notices, because a redacted field looks like it is working.
//
// Matched against a normalised key: lower-cased, separators removed, so
// `recipient_phone`, `recipientPhone` and `RECIPIENT-PHONE` are one case.

// Always secret, on their own.
const EXACT = /^(pin|otp|token|secret|password|passwd|authorization|auth|cookie|session|apikey|dsn|jwt)$/;

// Credential-ish, anywhere in the name — `resetPasswordToken`, `otpCode`.
const CREDENTIAL = /(password|passwd|secret|token|apikey|otpcode|pincode|accesscode|verificationcode|trackingcode)/;

// Personal data, as a suffix so `phone`, `recipientPhone` and
// `driverPhoneNumber` match while an unrelated `headphones` does not.
const PERSONAL = /(phone|phonenumber|msisdn|address|latitude|longitude)$/;

// Coordinates abbreviated. Anchored to the end so `pickup_lat` and
// `delivery_lng` match but `latency` and `translation` do not.
const COORD = /(^|[a-z0-9])(lat|lng|lon)$/;

export function isSensitiveKey(key) {
    const k = String(key).toLowerCase().replace(/[_\-\s]/g, '');
    return EXACT.test(k) || CREDENTIAL.test(k) || PERSONAL.test(k) || COORD.test(k);
}

// Rwandan mobile numbers in the shapes this codebase writes them: +250…,
// 250…, and the local 07… form.
const PHONE_SHAPE = /(\+?250|\b0)7[0-9]{8}\b/g;

export function redactString(value) {
    return String(value).replace(PHONE_SHAPE, '[phone]');
}

// Walks an arbitrary structure, redacting by key and by shape. Depth-capped
// because a Sentry event can contain cyclic-ish nesting and this runs on the
// error path, where an exception would lose the very report being built.
export function scrubTree(node, depth = 0) {
    if (depth > 8 || node === null || node === undefined) return node;
    if (typeof node === 'string') return redactString(node);
    if (Array.isArray(node)) return node.map((v) => scrubTree(v, depth + 1));
    if (typeof node !== 'object') return node;

    const out = {};
    for (const [key, value] of Object.entries(node)) {
        out[key] = isSensitiveKey(key) ? '[redacted]' : scrubTree(value, depth + 1);
    }
    return out;
}
