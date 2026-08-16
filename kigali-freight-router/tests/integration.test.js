import crypto from 'crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import request from 'supertest';
import { io as socketClient } from 'socket.io-client';

import pool from '../config/db.js';
import { getRedisClient, isRedisEnabled } from '../config/redisClient.js';
import { app, server, startServer, shutdownServices } from '../server.js';
import { REQUIRED_DOCUMENT_TYPES } from '../services/driverVerificationService.js';

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

    // The delivery lifecycle is the single most business-critical path in
    // the system and had no coverage: assignment, each status transition,
    // and the photo-backed confirmation that actually closes a job out.
    // Compliance gate: a driver can log in and appear in the fleet long
    // before they're cleared to carry cargo. Dispatch must refuse to assign
    // until all five required documents are admin-approved.
    test('assignment is refused while the driver is unverified', async () => {
        const res = await request(app)
            .post('/api/orders/assign')
            .set('Authorization', `Bearer ${dispatcherToken}`)
            .send({ orderIds: [createdOrderId], driverName: driverPhone });
        assert.equal(res.statusCode, 409, JSON.stringify(res.body));
        assert.equal(res.body.error.code, 'ORDERS_ASSIGN_DRIVER_UNVERIFIED');
    });

    // Upload + admin-approve all five compliance documents, which is the
    // only way to clear the gate above. Exercises the document
    // upload/review path end to end as a side effect.
    test('driver documents: upload and approval clears the verification gate', async () => {
        const pngHeader = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            'base64'
        );
        // Each document needs distinct bytes: uploads are content-hashed and
        // re-submitting the same image under a second document type is
        // rejected as DRIVER_DOCUMENT_DUPLICATE_FILE. Padding is also well
        // above the minimum-size guard.
        const photoFor = (index) => Buffer.concat([pngHeader, Buffer.alloc(60 * 1024, index + 1)]);

        for (const [index, documentType] of REQUIRED_DOCUMENT_TYPES.entries()) {
            const upload = await request(app)
                .post('/api/driver-documents')
                .set('Authorization', `Bearer ${driverToken}`)
                .field('documentType', documentType)
                .attach('document', photoFor(index), `${documentType}.png`);
            assert.equal(upload.statusCode, 201, `${documentType}: ${JSON.stringify(upload.body)}`);

            const approve = await request(app)
                .patch(`/api/driver-documents/${upload.body.data.id}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'approved' });
            assert.equal(approve.statusCode, 200, `${documentType}: ${JSON.stringify(approve.body)}`);
        }

        const mine = await request(app)
            .get('/api/driver-documents/mine')
            .set('Authorization', `Bearer ${driverToken}`);
        assert.equal(mine.statusCode, 200);
        assert.equal(mine.body.data.verified, true, JSON.stringify(mine.body.data));
    });

    test('delivery lifecycle: assign -> IN_TRANSIT -> ARRIVED -> confirm-delivery', async () => {
        // Deliberately its own order, not the shared createdOrderId — the
        // tenancy test below depends on that one staying unassigned so a
        // driver acting on it is genuinely a cross-tenant attempt.
        const created = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${dispatcherToken}`)
            .send({
                cargo_description: 'Lifecycle test cargo',
                weight_kg: 12,
                origin_hub_id: hubId,
                delivery_lng: 30.0619,
                delivery_lat: -1.9441,
                recipient_name: 'Lifecycle Recipient',
                recipient_phone: '+250788000001',
            });
        assert.equal(created.statusCode, 201, JSON.stringify(created.body));
        const lifecycleOrderId = created.body.data.order.id;

        const assignResponse = await request(app)
            .post('/api/orders/assign')
            .set('Authorization', `Bearer ${dispatcherToken}`)
            .send({ orderIds: [lifecycleOrderId], driverName: driverPhone });
        assert.equal(assignResponse.statusCode, 200, JSON.stringify(assignResponse.body));
        assert.equal(assignResponse.body.data.dispatchedCount, 1);

        // The assigned driver now shows the job on their own board.
        const assignments = await request(app)
            .get('/api/orders/driver/assignments')
            .set('Authorization', `Bearer ${driverToken}`);
        assert.equal(assignments.statusCode, 200);
        assert.ok(assignments.body.data.some((o) => o.id === lifecycleOrderId));

        for (const status of ['IN_TRANSIT', 'ARRIVED']) {
            const res = await request(app)
                .patch(`/api/orders/${lifecycleOrderId}/status`)
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ status });
            assert.equal(res.statusCode, 200, `${status} failed: ${JSON.stringify(res.body)}`);
            assert.equal(res.body.data.order.status, status);
        }

        // Proof-of-delivery photo closes the job out. Note this endpoint
        // intentionally has no minimum-size guard — that check belongs to
        // driver-document uploads, where image quality is a compliance
        // concern; a delivery snapshot is just evidence the drop happened.
        const realPhoto = Buffer.concat([
            Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
                'base64'
            ),
            Buffer.alloc(60 * 1024, 7),
        ]);
        const confirmed = await request(app)
            .post(`/api/orders/${lifecycleOrderId}/confirm-delivery`)
            .set('Authorization', `Bearer ${driverToken}`)
            .attach('photo', realPhoto, 'proof.png');
        assert.equal(confirmed.statusCode, 200, JSON.stringify(confirmed.body));
        assert.equal(confirmed.body.data.order.status, 'DELIVERED');

        // And it lands in the driver's completed history.
        const completed = await request(app)
            .get('/api/orders/driver/completed')
            .set('Authorization', `Bearer ${driverToken}`);
        assert.equal(completed.statusCode, 200);
        assert.ok(completed.body.data.some((o) => o.id === lifecycleOrderId));
    });

    // Weight bounds are validated at order creation, before capacity is
    // ever considered — an implausible load never becomes an order at all.
    test('order creation rejects an out-of-range weight', async () => {
        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${dispatcherToken}`)
            .send({
                cargo_description: 'Weight guard test',
                weight_kg: 99999,
                origin_hub_id: hubId,
                delivery_lng: 30.0619,
                delivery_lat: -1.9441,
                recipient_name: 'Weight Test',
                recipient_phone: '+250788000000',
            });
        assert.equal(res.statusCode, 400, JSON.stringify(res.body));
        assert.equal(res.body.error.code, 'ORDERS_INVALID_WEIGHT');
    });

    test('safety checklist persists per-driver and rejects unknown items', async () => {
        const patched = await request(app)
            .patch('/api/driver-safety-checklist/today')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ itemKey: 'seatbelt', checked: true });
        assert.equal(patched.statusCode, 200, JSON.stringify(patched.body));
        assert.equal(patched.body.data.items.seatbelt, true);

        const reread = await request(app)
            .get('/api/driver-safety-checklist/today')
            .set('Authorization', `Bearer ${driverToken}`);
        assert.equal(reread.statusCode, 200);
        assert.equal(reread.body.data.items.seatbelt, true);

        const bogus = await request(app)
            .patch('/api/driver-safety-checklist/today')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ itemKey: 'not_a_real_check', checked: true });
        assert.equal(bogus.statusCode, 400, JSON.stringify(bogus.body));
    });

    // Regression guards for two endpoints that used to dereference request
    // fields before validating them, answering 500 to what is really a
    // client mistake.
    test('malformed payloads are rejected with 400, not 500', async () => {
        const geofence = await request(app)
            .post('/api/geofences')
            .set('Authorization', `Bearer ${dispatcherToken}`)
            .send({ name: 'No Coordinates Zone' });
        assert.equal(geofence.statusCode, 400, JSON.stringify(geofence.body));

        const optimize = await request(app)
            .post('/api/routes/optimize')
            .set('Authorization', `Bearer ${dispatcherToken}`)
            .send({ stops: [{ lat: -1.95, lng: 30.06 }] });
        assert.equal(optimize.statusCode, 400, JSON.stringify(optimize.body));
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

    // The public order limit is deliberately tight (10/hour) and, with
    // REDIS_URL set, its counters outlive the process — so a second run of
    // this suite inside the hour would get 429s where it expects 201s and
    // 400s. Clearing the counters keeps the production limit honest rather
    // than loosening it for tests.
    async function resetPublicRateLimits() {
        if (!isRedisEnabled()) return;
        const client = await getRedisClient();
        if (!client) return;
        for (const prefix of ['public-order', 'public-contact', 'public-track']) {
            const keys = await client.keys(`ratelimit:${prefix}:*`);
            if (keys.length) await client.del(keys);
        }
    }

    // The public endpoints are the only unauthenticated write surface in
    // the app, so what matters here is less "does it work" than "does it
    // still refuse the things it must refuse".
    test('public: a customer can place an order and track it by code', async () => {
        await resetPublicRateLimits();
        const create = await request(app)
            .post('/api/public/orders')
            .send({
                pickupAddress: 'Gikondo Industrial Zone',
                deliveryAddress: 'Kimironko Market, Shop 14',
                cargoType: 'Retail stock',
                weightKg: 150,
                customerName: 'Integration Customer',
                customerPhone: '0788123456',
            });
        assert.equal(create.statusCode, 201);
        const token = create.body.data.trackingToken;
        assert.match(token, /^INZ-[A-Z0-9]{8}$/);

        const tracked = await request(app).get(`/api/public/track/${token}`);
        assert.equal(tracked.statusCode, 200);
        assert.equal(tracked.body.data.cargo, 'Retail stock');
        assert.equal(tracked.body.data.status, 'PENDING');
        assert.equal(tracked.body.data.delivery, 'Kimironko Market, Shop 14');
    });

    test('public: tracking never exposes the order id or a driver username', async () => {
        await resetPublicRateLimits();
        const create = await request(app)
            .post('/api/public/orders')
            .send({
                pickupAddress: 'Nyabugogo', deliveryAddress: 'Remera',
                cargoType: 'Documents', weightKg: 2,
                customerName: 'Privacy Probe', customerPhone: '0788123457',
            });
        const tracked = await request(app).get(`/api/public/track/${create.body.data.trackingToken}`);

        // The internal id is precisely the enumeration handle the random
        // token exists to keep off a public page — leaking it here would
        // defeat the whole scheme.
        assert.equal(tracked.body.data.id, undefined);
        assert.equal(tracked.body.data.assigned_to, undefined);
        assert.equal(tracked.body.data.driverName, undefined);
        assert.equal(tracked.body.data.customerPhone, undefined);
    });

    test('public: sequential and guessed codes cannot find a shipment', async () => {
        // The shape the driver app renders (KGL-TRIP-0001) and the shape
        // the original mockup used (KF-0043) must both be dead ends.
        for (const guess of ['1', '0001', 'KF-0043', 'KGL-TRIP-0001', 'INZ-00000001']) {
            const response = await request(app).get(`/api/public/track/${guess}`);
            assert.equal(response.statusCode, 404, `${guess} should not resolve`);
        }
    });

    test('public: order submissions are validated', async () => {
        await resetPublicRateLimits();
        const base = {
            pickupAddress: 'A', deliveryAddress: 'B', cargoType: 'Documents',
            weightKg: 5, customerName: 'V', customerPhone: '0788123458',
        };
        const cases = [
            [{ ...base, pickupAddress: '' }, 'MISSING_LOCATIONS'],
            [{ ...base, customerPhone: '12345' }, 'INVALID_PHONE'],
            [{ ...base, cargoType: 'Gold bullion' }, 'INVALID_CARGO_TYPE'],
            [{ ...base, weightKg: 999999 }, 'INVALID_WEIGHT'],
            [{ ...base, weightKg: -1 }, 'INVALID_WEIGHT'],
        ];
        for (const [payload, expectedCode] of cases) {
            const response = await request(app).post('/api/public/orders').send(payload);
            assert.equal(response.statusCode, 400);
            assert.equal(response.body.error.code, expectedCode);
        }
    });

    test('public: submitted orders reach the dispatch queue with their address and contact', async () => {
        await resetPublicRateLimits();
        const create = await request(app)
            .post('/api/public/orders')
            .send({
                pickupAddress: 'Gikondo depot gate 3', deliveryAddress: 'Kacyiru, house 22',
                cargoType: 'General goods', weightKg: 40,
                customerName: 'Queue Check', customerPhone: '0788123459',
            });
        const token = create.body.data.trackingToken;

        // The regression this guards: these orders were correctly PENDING
        // but getActiveOrders selected only hub and coordinates, which a
        // public order has neither of — so a dispatcher saw cargo and
        // weight with nothing to act on.
        const queue = await request(app)
            .get('/api/orders/active')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.equal(queue.statusCode, 200);

        const row = queue.body.data.find((order) => order.tracking_token === token);
        assert.ok(row, 'public order should appear in the dispatch queue');
        assert.equal(row.source, 'public');
        assert.equal(row.pickup_address_text, 'Gikondo depot gate 3');
        assert.equal(row.delivery_address_text, 'Kacyiru, house 22');
        assert.equal(row.customer_phone, '+250788123459');
    });

    test('public: an assigned customer order reaches the driver deliverable', async () => {
        await resetPublicRateLimits();
        const create = await request(app).post('/api/public/orders').send({
            pickupAddress: 'Gikondo depot, gate 3',
            deliveryAddress: 'Kimironko Market, shop 14',
            cargoType: 'Retail stock', weightKg: 180,
            customerName: 'Aline Uwase', customerPhone: '0788555333',
            specialInstructions: 'Ask for Claudine at the gate.',
        });
        assert.equal(create.statusCode, 201);
        const token = create.body.data.trackingToken;

        const queue = await request(app).get('/api/orders/active')
            .set('Authorization', `Bearer ${adminToken}`);
        const row = queue.body.data.find((o) => o.tracking_token === token);
        assert.ok(row, 'customer order should be in the dispatch queue');

        const assign = await request(app).post('/api/orders/assign')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ orderIds: [row.id], driverName: driverPhone });
        assert.equal(assign.statusCode, 200, JSON.stringify(assign.body));

        // The regression this exists for: assignment always worked, but the
        // driver's payload carried no hub, no coordinates and no recipient,
        // so a customer order arrived with nowhere to go and nobody to ring
        // — assignable but undeliverable.
        const detail = await request(app).get(`/api/orders/${row.id}`)
            .set('Authorization', `Bearer ${driverToken}`);
        assert.equal(detail.statusCode, 200);
        assert.equal(detail.body.data.pickup_address_text, 'Gikondo depot, gate 3');
        assert.equal(detail.body.data.delivery_address_text, 'Kimironko Market, shop 14');
        assert.equal(detail.body.data.customer_phone, '+250788555333');
        assert.match(detail.body.data.special_instructions, /Claudine/);

        const feed = await request(app).get('/api/orders/driver/assignments')
            .set('Authorization', `Bearer ${driverToken}`);
        const job = feed.body.data.find((o) => o.id === row.id);
        assert.ok(job, 'assigned order should appear in the driver feed');
        assert.equal(job.delivery_address_text, 'Kimironko Market, shop 14');
    });

    test('public: placing an order switches on the coordinate-driven features', async () => {
        await resetPublicRateLimits();
        const create = await request(app).post('/api/public/orders').send({
            pickupAddress: 'Nyabugogo taxi park', deliveryAddress: 'Remera, Giporoso',
            cargoType: 'General goods', weightKg: 90,
            customerName: 'Placement Test', customerPhone: '0788556777',
        });
        const trackingToken = create.body.data.trackingToken;
        const queue = await request(app).get('/api/orders/active')
            .set('Authorization', `Bearer ${adminToken}`);
        const row = queue.body.data.find((o) => o.tracking_token === trackingToken);
        assert.equal(row.pickup_lat, null, 'a customer order starts with no coordinates');

        const placed = await request(app).patch(`/api/orders/${row.id}/place`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ pickupLat: -1.9706, pickupLng: 30.0891, deliveryLat: -1.9396, deliveryLng: 30.0617, originHubId: hubId });
        assert.equal(placed.statusCode, 200, JSON.stringify(placed.body));
        assert.equal(Number(placed.body.data.pickup_lat), -1.9706);
        assert.ok(placed.body.data.origin_hub_name, 'placing against a hub names it');

        // Nonsense coordinates are refused rather than stored.
        const bad = await request(app).patch(`/api/orders/${row.id}/place`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ pickupLat: 999, pickupLng: 30, deliveryLat: -1.9, deliveryLng: 30 });
        assert.equal(bad.statusCode, 400);
        assert.equal(bad.body.error.code, 'ORDERS_PLACE_INVALID_COORDS');

        // The point of placing: distance ranking has something to rank on.
        // Before this the endpoint returned drivers with a null distance.
        const nearest = await request(app).get(`/api/orders/${row.id}/nearest-drivers`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.equal(nearest.statusCode, 200);
        const ranked = (nearest.body.data.recommendedDrivers || [])
            .filter((d) => d.distanceFromPickupKm !== null);
        assert.ok(ranked.length > 0, 'a placed order should rank drivers by real distance');
    });

    test('public: a contact enquiry is stored and raises an alert', async () => {
        await resetPublicRateLimits();
        const before = await pool.query('SELECT COUNT(*)::int AS n FROM contact_messages');

        // Text chosen to break Telegram's Markdown parser if it were sent
        // raw — the API rejects an unbalanced * or _, and dispatchExternal
        // Alert swallows that, so the enquiry would vanish with no trace.
        const response = await request(app).post('/api/public/contact').send({
            name: 'Samuel *Trader*',
            phone: '0788556444',
            message: 'Need 2*3 pallets weekly. price_list please [urgent]',
        });
        assert.equal(response.statusCode, 201);
        assert.ok(response.body.data.id, 'the stored row id comes back');

        const after = await pool.query('SELECT COUNT(*)::int AS n FROM contact_messages');
        assert.equal(after.rows[0].n, before.rows[0].n + 1);

        const row = await pool.query(
            'SELECT name, phone, handled_at FROM contact_messages WHERE id = $1',
            [response.body.data.id]
        );
        assert.equal(row.rows[0].phone, '+250788556444', 'phone is normalised like every other number');
        assert.equal(row.rows[0].handled_at, null, 'a new enquiry starts unhandled');
    });

    test.after(async () => {
        await shutdownServices();
    });
}
