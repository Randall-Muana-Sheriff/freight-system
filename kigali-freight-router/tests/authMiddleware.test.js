import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../middleware/authMiddleware.js';

// 401 and 403 are different answers, and both clients depend on the
// difference to decide whether to refresh.
//
// The middleware carries a long comment explaining why an expired token must
// be 401 and a role refusal 403: when both were 403, every client had to
// discriminate on the error code, and ours simply retried on either — so a
// genuine refusal burned a single-use refresh-token rotation and then failed
// again identically. The dashboard and the driver phone both follow the plain
// rule now: refresh on 401, never on 403.
//
// Nothing locked that in. No test anywhere in this repo forged a JWT, and the
// only 401 assertion was a wrong-PIN login. A regression to 403 on expiry
// would silently break re-login on both clients, and the tests would stay
// green.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-signing-only';

function runMiddleware(token, allowedRoles = []) {
    const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
    const captured = { status: null, body: null, nextCalled: false };
    const res = {
        status(code) { captured.status = code; return this; },
        json(payload) { captured.body = payload; return this; },
    };
    authMiddleware(allowedRoles)(req, res, () => { captured.nextCalled = true; });
    return { ...captured, req };
}

const sign = (payload, options = {}) => jwt.sign(payload, process.env.JWT_SECRET, options);

test('an expired token is 401, so the client knows to refresh', () => {
    // Signed already-expired rather than waiting: expiresIn accepts a negative
    // age, which is the only way to test this without a clock stub.
    const expired = sign({ username: 'kamara', role: 'driver' }, { expiresIn: '-1h' });
    const result = runMiddleware(expired, ['driver']);
    assert.equal(result.status, 401, 'an expired token must not be 403 — the client would stop refreshing');
    assert.equal(result.body?.error?.code, 'AUTH_INVALID_TOKEN');
    assert.equal(result.nextCalled, false);
});

test('a valid token for the wrong role is 403, so the client does NOT refresh', () => {
    const driver = sign({ username: 'kamara', role: 'driver' });
    const result = runMiddleware(driver, ['admin']);
    assert.equal(result.status, 403, 'a refusal must not be 401 — refreshing it burns a rotation and fails identically');
    assert.equal(result.body?.error?.code, 'AUTH_FORBIDDEN');
    assert.equal(result.nextCalled, false);
});

test('a token signed with the wrong secret is 401, not a pass', () => {
    const forged = jwt.sign({ username: 'attacker', role: 'admin' }, 'not-the-real-secret');
    const result = runMiddleware(forged, ['admin']);
    assert.equal(result.status, 401);
    assert.equal(result.nextCalled, false, 'a forged token must never reach a controller');
});

test('a missing token is 401 and never reaches the controller', () => {
    const result = runMiddleware(null, ['admin']);
    assert.equal(result.status, 401);
    assert.equal(result.body?.error?.code, 'AUTH_TOKEN_MISSING');
    assert.equal(result.nextCalled, false);
});

test('a valid token with an allowed role passes through', () => {
    const admin = sign({ username: 'boss', role: 'admin' });
    const result = runMiddleware(admin, ['admin', 'dispatcher']);
    assert.equal(result.nextCalled, true);
    assert.equal(result.status, null, 'nothing should have been written to the response');
    assert.equal(result.req.user.username, 'boss');
});

test('roles are compared case-insensitively, both sides', () => {
    // The route table and the token are written by different people at
    // different times; a case mismatch locking an admin out of their own
    // dashboard is the kind of thing found at the worst moment.
    assert.equal(runMiddleware(sign({ username: 'a', role: 'ADMIN' }), ['admin']).nextCalled, true);
    assert.equal(runMiddleware(sign({ username: 'a', role: 'admin' }), ['ADMIN']).nextCalled, true);
});

test('an empty allowedRoles list authenticates without authorising', () => {
    // Used by routes that only need to know who you are. It must still reject
    // a bad token — "any role" is not "no token".
    assert.equal(runMiddleware(sign({ username: 'a', role: 'driver' }), []).nextCalled, true);
    assert.equal(runMiddleware(null, []).status, 401);
    assert.equal(runMiddleware('not-a-jwt', []).status, 401);
});

test('a token carrying no role is refused by a role-gated route', () => {
    const roleless = sign({ username: 'ghost' });
    const result = runMiddleware(roleless, ['admin']);
    assert.equal(result.status, 403);
    assert.equal(result.nextCalled, false);
});
