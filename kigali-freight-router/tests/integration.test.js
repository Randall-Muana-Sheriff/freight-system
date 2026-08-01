import crypto from 'crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import request from 'supertest';
import { io as socketClient } from 'socket.io-client';

import pool from '../config/db.js';
import { app, server, startServer, shutdownServices } from '../server.js';

// Matches driverAuthController.js's own hashCode() exactly — needed so this
// test can plant a known OTP/invite code's hash directly via the DB and
// then verify it through the real HTTP endpoints, without needing to
// intercept an SMS that's never actually sent in this environment.
function hashCode(code) {
    return crypto.createHash('sha256').update(code).digest('hex');
}

const requiredEnv = ['DB_USER', 'DB_PASSWORD', 'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'JWT_SECRET'];
const hasIntegrationEnv = requiredEnv.every((key) => Boolean(process.env[key]));
// The admin/dispatcher auth model requires an existing admin to create
// every other account (see bin/migrate.js's seedAdmin) — self-signup was
// removed. Rather than hardcoding a password here, this reuses whatever
// bootstrap admin the environment running this suite already has (the
// same ADMIN_USERNAME/ADMIN_PASSWORD docker-compose.yml and CI both set).
const hasAdminBootstrap = Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD);

const uniqueId = Date.now();
const dispatcherUser = { username: `it_dispatcher_${uniqueId}`, password: 'TempPass123!' };
const driverPhone = `+2507${String(uniqueId).slice(-8)}`;
const driverPin = '4821';

let adminToken = '';
let dispatcherToken = '';
let driverToken = '';
let driverId = null;
let vehicleId = null;
let hubId = null;
let createdOrderId = null;
let socketPort = null;

async function login(username, password) {
    const res = await request(app).post('/api/auth/login').send({ username, password });
    assert.equal(res.statusCode, 200, `login failed for ${username}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.data?.token);
    return res.body.data.token;
}

// Overwrites whatever OTP/invite code hash the real endpoint just inserted
// with one this test controls, so it can then complete the flow through
// the actual verify endpoints without needing to read an SMS that's never
// really sent in this environment (no AT_API_KEY configured here).
async function plantKnownOtp(phone, code) {
    // Plain UPDATE doesn't support ORDER BY/LIMIT directly — target the
    // latest row for this phone via a subquery instead.
    await pool.query(
        `UPDATE otp_codes SET code_hash = $1, attempts = 0, consumed_at = NULL
         WHERE id = (SELECT id FROM otp_codes WHERE phone_number = $2 ORDER BY created_at DESC LIMIT 1)`,
        [hashCode(code), phone]
    );
}

if (!hasIntegrationEnv || !hasAdminBootstrap) {
    test('integration prerequisites', { skip: true }, () => {});
} else {
    test.before(async () => {
        await startServer(0);
        socketPort = server.address().port;

        // 1. Bootstrap admin — created by bin/migrate.js's seedAdmin from
        // the same ADMIN_USERNAME/ADMIN_PASSWORD this test reads, not by a
        // signup call (that endpoint no longer exists by design).
        adminToken = await login(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD);

        // 2. Dispatcher — created by the admin via the real admin-user-
        // management endpoint, matching how every non-admin staff account
        // is actually meant to come into existence in this app.
        const createDispatcherRes = await request(app)
            .post('/api/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ ...dispatcherUser, role: 'dispatcher' });
        assert.equal(createDispatcherRes.statusCode, 201, JSON.stringify(createDispatcherRes.body));
        dispatcherToken = await login(dispatcherUser.username, dispatcherUser.password);

        // Orders are created against a real hub (server derives pickup
        // coordinates from it) — migrate.js seeds a few on every fresh DB.
        const hubsRes = await request(app).get('/api/hubs').set('Authorization', `Bearer ${adminToken}`);
        assert.equal(hubsRes.statusCode, 200);
        assert.ok(hubsRes.body.data.length > 0, 'expected at least one seeded hub');
        hubId = hubsRes.body.data[0].id;
    });

    test('auth flow returns valid token payload', async () => {
        assert.ok(adminToken);
        assert.ok(dispatcherToken);
    });

    test('health and readiness endpoints respond correctly', async () => {
        const healthResponse = await request(app).get('/health');
        assert.equal(healthResponse.statusCode, 200);
        assert.equal(healthResponse.body.success, true);
        assert.equal(healthResponse.body.data.status, 'ok');

        const readyResponse = await request(app).get('/ready');
        assert.equal(readyResponse.statusCode, 200);
        assert.equal(readyResponse.body.success, true);
        assert.equal(readyResponse.body.data.status, 'ready');

        // /metrics is a static-bearer-token route, not a JWT one — closed
        // (404) entirely when METRICS_TOKEN isn't configured, same as prod.
        if (process.env.METRICS_TOKEN) {
            const metricsResponse = await request(app)
                .get('/metrics')
                .set('Authorization', `Bearer ${process.env.METRICS_TOKEN}`);
            assert.equal(metricsResponse.statusCode, 200);
            assert.match(metricsResponse.text, /kigali_http_requests_total/);
        }
    });

    // Full driver phone/OTP/invite/PIN onboarding flow, exercised through
    // the real HTTP endpoints end-to-end — this flow previously had zero
    // test coverage at all, despite being the most security-sensitive
    // path in the app (it's how every driver identity in the system gets
    // created and authenticated).
    test('driver onboarding: invite -> otp -> pin-set issues a working session', async () => {
        const inviteRes = await request(app)
            .post('/api/drivers/invite')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ phoneNumber: driverPhone, fullName: 'Integration Test Driver' });
        assert.equal(inviteRes.statusCode, 201, JSON.stringify(inviteRes.body));
        driverId = inviteRes.body.data.driverId;
        const inviteCode = inviteRes.body.data.inviteCode;
        assert.ok(inviteCode);

        const otpRequestRes = await request(app).post('/api/auth/driver/otp/request').send({ phoneNumber: driverPhone });
        assert.equal(otpRequestRes.statusCode, 200, JSON.stringify(otpRequestRes.body));

        const otpCode = '135790';
        await plantKnownOtp(driverPhone, otpCode);

        const otpVerifyRes = await request(app)
            .post('/api/auth/driver/otp/verify')
            .send({ phoneNumber: driverPhone, code: otpCode });
        assert.equal(otpVerifyRes.statusCode, 200, JSON.stringify(otpVerifyRes.body));
        assert.equal(otpVerifyRes.body.data.returning, false);
        const firstSessionToken = otpVerifyRes.body.data.otpSessionToken;

        const inviteVerifyRes = await request(app)
            .post('/api/auth/driver/invite/verify')
            .send({ otpSessionToken: firstSessionToken, inviteCode });
        assert.equal(inviteVerifyRes.statusCode, 200, JSON.stringify(inviteVerifyRes.body));
        assert.equal(inviteVerifyRes.body.data.staffId, inviteRes.body.data.staffId);
        const inviteVerifiedSessionToken = inviteVerifyRes.body.data.otpSessionToken;

        const pinSetRes = await request(app)
            .post('/api/auth/driver/pin/set')
            .send({ otpSessionToken: inviteVerifiedSessionToken, pin: driverPin });
        assert.equal(pinSetRes.statusCode, 200, JSON.stringify(pinSetRes.body));
        assert.ok(pinSetRes.body.data.token);
        driverToken = pinSetRes.body.data.token;

        // A second invite/verify attempt with the same (now-consumed)
        // session token must not silently re-succeed — otherwise the same
        // captured token could replay this step indefinitely.
        const replayRes = await request(app)
            .post('/api/auth/driver/invite/verify')
            .send({ otpSessionToken: firstSessionToken, inviteCode });
        assert.notEqual(replayRes.statusCode, 200);
    });

    test('returning driver: otp -> pin-login works with the PIN just set', async () => {
        const otpRequestRes = await request(app).post('/api/auth/driver/otp/request').send({ phoneNumber: driverPhone });
        assert.equal(otpRequestRes.statusCode, 200);

        const otpCode = '246810';
        await plantKnownOtp(driverPhone, otpCode);

        const otpVerifyRes = await request(app)
            .post('/api/auth/driver/otp/verify')
            .send({ phoneNumber: driverPhone, code: otpCode });
        assert.equal(otpVerifyRes.statusCode, 200);
        // Now that onboarding is complete (previous test), this same phone
        // must report as a returning driver, not a new one.
        assert.equal(otpVerifyRes.body.data.returning, true);

        const pinLoginRes = await request(app)
            .post('/api/auth/driver/pin/login')
            .send({ otpSessionToken: otpVerifyRes.body.data.otpSessionToken, pin: driverPin });
        assert.equal(pinLoginRes.statusCode, 200, JSON.stringify(pinLoginRes.body));
        assert.ok(pinLoginRes.body.data.token);

        // Wrong PIN must fail, and must not leak whether the phone/session
        // itself was otherwise valid.
        const wrongPinRes = await request(app)
            .post('/api/auth/driver/pin/login')
            .send({ otpSessionToken: otpVerifyRes.body.data.otpSessionToken, pin: '0000' });
        assert.equal(wrongPinRes.statusCode, 401);
    });

    // RBAC negative case: a driver session must never reach an admin-only
    // route, regardless of how it authenticated. Nothing in the previous
    // version of this suite asserted a 403 anywhere.
    test('RBAC: a driver token is rejected by admin-only routes', async () => {
        const res = await request(app).get('/api/audit-logs').set('Authorization', `Bearer ${driverToken}`);
        assert.equal(res.statusCode, 403);
    });

    test('vehicles list and assignment flow', async () => {
        const listResponse = await request(app)
            .get('/api/vehicles')
            .set('Authorization', `Bearer ${adminToken}`);

        assert.equal(listResponse.statusCode, 200);
        assert.equal(listResponse.body.success, true);

        const createResponse = await request(app)
            .post('/api/vehicles')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: `IT-${uniqueId}`, type: 'Truck' });

        assert.equal(createResponse.statusCode, 201);
        vehicleId = createResponse.body.data.vehicle.id;

        const assignResponse = await request(app)
            .patch(`/api/vehicles/${vehicleId}/assign`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ driverId });

        assert.equal(assignResponse.statusCode, 200);
        assert.equal(assignResponse.body.success, true);
        assert.equal(assignResponse.body.data.vehicle.currentDriverId, driverId);
    });

    test('order create, active list, and pooling flow', async () => {
        const createResponse = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${dispatcherToken}`)
            .send({
                cargo_description: 'Integration Test Cargo',
                weight_kg: 120.5,
                origin_hub_id: hubId,
                delivery_lng: 30.0891,
                delivery_lat: -1.9706,
            });

        assert.equal(createResponse.statusCode, 201);
        assert.equal(createResponse.body.success, true);
        createdOrderId = createResponse.body.data.order.id;

        const activeResponse = await request(app)
            .get('/api/orders/active')
            .set('Authorization', `Bearer ${dispatcherToken}`);

        assert.equal(activeResponse.statusCode, 200);
        assert.equal(activeResponse.body.success, true);
        assert.ok(activeResponse.body.data.some((order) => order.id === createdOrderId));

        const poolingResponse = await request(app)
            .get('/api/orders/pooling')
            .set('Authorization', `Bearer ${dispatcherToken}`);

        assert.equal(poolingResponse.statusCode, 200);
        assert.equal(poolingResponse.body.success, true);
        assert.ok(Array.isArray(poolingResponse.body.data));
    });

    // Tenancy isolation: a driver must never be able to act on an order
    // that isn't assigned to them, even though the route itself accepts
    // the driver role.
    test('tenancy: a driver cannot update the status of an order assigned to someone else', async () => {
        const res = await request(app)
            .patch(`/api/orders/${createdOrderId}/status`)
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ status: 'PICKED_UP' });
        assert.equal(res.statusCode, 403, JSON.stringify(res.body));
    });

    test('socket telemetry persists into location tables', async () => {
        // Must be a real driver-role socket — server.js's telemetry-push
        // handler silently drops anything else (`if (!socket.isSimulator
        // && socket.user?.role !== 'driver') return;`), and even for a
        // driver socket it always uses the JWT's own username as
        // driverName, never whatever the client puts in the payload (a
        // driver can't report telemetry under another driver's name) — so
        // the identity to assert on is driverPhone (== the driver's
        // username), not an arbitrary client-supplied string.
        const driverName = driverPhone;
        const lat = -1.95;
        const lng = 30.08;

        const socket = socketClient(`http://127.0.0.1:${socketPort}`, {
            auth: { token: `Bearer ${driverToken}` },
            transports: ['websocket'],
        });

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Socket connection timed out.')), 7000);
            socket.on('connect', () => {
                clearTimeout(timeout);
                resolve();
            });
            socket.on('connect_error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });

        const updateSeen = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('No telemetry broadcast received.')), 7000);
            socket.on('driver:location-update', (payload) => {
                if (payload.driverName === driverName) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
        });

        socket.emit('driver:telemetry-push', { driverName, lat, lng });
        await updateSeen;

        // Allow async DB writes from the socket handler to complete.
        await delay(300);

        const historyResult = await pool.query(
            'SELECT COUNT(*)::int AS count FROM driver_location_history WHERE driver_name = $1',
            [driverName]
        );
        const locationResult = await pool.query(
            'SELECT COUNT(*)::int AS count FROM driver_locations WHERE driver_name = $1',
            [driverName]
        );

        assert.ok(historyResult.rows[0].count >= 1);
        assert.ok(locationResult.rows[0].count >= 1);

        socket.disconnect();
    });

    test('telemetry queue exposes live metric counters after ingestion', async () => {
        // A driver token, same reasoning as the previous test — a
        // dispatcher-role socket's telemetry-push is silently dropped
        // before it ever reaches the queue, which would make this test
        // pass for the wrong reason (the event-received counter still
        // increments pre-rejection, even though nothing was ingested).
        const socket = socketClient(`http://127.0.0.1:${socketPort}`, {
            auth: { token: `Bearer ${driverToken}` },
            transports: ['websocket'],
        });

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Socket connection timed out.')), 7000);
            socket.on('connect', () => {
                clearTimeout(timeout);
                resolve();
            });
            socket.on('connect_error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });

        // No driverName here — the server always uses the authenticated
        // driver's own JWT username, ignoring anything the client sends.
        socket.emit('driver:telemetry-push', { lat: -1.948, lng: 30.081 });

        await delay(600);

        if (process.env.METRICS_TOKEN) {
            const metricsResponse = await request(app)
                .get('/metrics')
                .set('Authorization', `Bearer ${process.env.METRICS_TOKEN}`);
            assert.equal(metricsResponse.statusCode, 200);
            assert.match(metricsResponse.text, /kigali_socket_events_by_name_total/);
        }

        socket.disconnect();
    });

    test.after(async () => {
        await shutdownServices();
    });
}
