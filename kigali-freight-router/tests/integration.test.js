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
// Everything this suite writes is created after this instant, which is what
// the teardown below uses to find its own rows. Taken before any request so
// nothing the run creates can predate it.
const runStartedAt = new Date();
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
let tripUnderTest = null;
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

            // holderKind comes back from the upload because the driver and
            // vehicle document tables have separate id sequences — the
            // reviewer has to say which one the id belongs to.
            const approve = await request(app)
                .patch(`/api/driver-documents/${upload.body.data.id}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'approved', holderKind: upload.body.data.holderKind });
            assert.equal(approve.statusCode, 200, `${documentType}: ${JSON.stringify(approve.body)}`);
        }

        const mine = await request(app)
            .get('/api/driver-documents/mine')
            .set('Authorization', `Bearer ${driverToken}`);
        assert.equal(mine.statusCode, 200);
        assert.equal(mine.body.data.verified, true, JSON.stringify(mine.body.data));
    });

    test('driver documents: an expiry in the past is refused at review time', async () => {
        const all = await request(app)
            .get('/api/driver-documents')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.equal(all.statusCode, 200);
        const doc = all.body.data.find((d) => d.username === driverPhone);
        assert.ok(doc, 'expected the driver to have a document to review');

        const backdated = await request(app)
            .patch(`/api/driver-documents/${doc.id}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'approved', holderKind: doc.holderKind, expiresAt: '2000-01-01T00:00:00Z' });

        // Approving onto a date already gone would clear a driver on a
        // lapsed document, which is the exact failure expiry exists to stop.
        assert.equal(backdated.statusCode, 400, JSON.stringify(backdated.body));
        assert.equal(backdated.body.error.code, 'DRIVER_DOCUMENT_EXPIRY_PAST');
    });

    test('fleet compliance: reports documents inside the warning window', async () => {
        const all = await request(app)
            .get('/api/driver-documents')
            .set('Authorization', `Bearer ${adminToken}`);
        const doc = all.body.data.find((d) => d.username === driverPhone);

        const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
        const approved = await request(app)
            .patch(`/api/driver-documents/${doc.id}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'approved', holderKind: doc.holderKind, expiresAt: soon });
        assert.equal(approved.statusCode, 200, JSON.stringify(approved.body));

        const compliance = await request(app)
            .get('/api/fleet/compliance')
            .set('Authorization', `Bearer ${dispatcherToken}`);
        assert.equal(compliance.statusCode, 200, JSON.stringify(compliance.body));

        const flagged = compliance.body.data.expiringSoon
            .find((i) => i.documentType === doc.documentType && i.holder === driverPhone);
        assert.ok(flagged, `expected ${doc.documentType} in expiringSoon: ${JSON.stringify(compliance.body.data)}`);
        assert.equal(flagged.expired, false);
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

    // The checklist used to take a boolean, so a driver who looked at the
    // tyres and found them bad could only tick (a lie) or leave it blank
    // (indistinguishable from not having looked). A failure now raises a
    // defect against the vehicle, which is the part the popular fleet
    // platforms actually get from their equivalent — the ticks were never
    // the point.
    test('a failed check raises an open defect against the vehicle', async () => {
        const failed = await request(app)
            .patch('/api/driver-safety-checklist/today')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ itemKey: 'tyres', result: 'fail', note: 'cord showing on nearside rear' });
        assert.equal(failed.statusCode, 200, JSON.stringify(failed.body));
        assert.equal(failed.body.data.results.tyres, 'fail');
        assert.ok(failed.body.data.defectId, 'a failure must produce a defect id');

        const defect = await pool.query(
            `SELECT event_type, status, description FROM geofence_alerts WHERE id = $1`,
            [failed.body.data.defectId]
        );
        assert.equal(defect.rows[0].event_type, 'VEHICLE_DEFECT');
        assert.equal(defect.rows[0].status, 'OPEN');
        assert.match(defect.rows[0].description, /cord showing on nearside rear/);

        // A pass is not a defect.
        const passed = await request(app)
            .patch('/api/driver-safety-checklist/today')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ itemKey: 'seatbelt', result: 'pass' });
        assert.equal(passed.body.data.defectId, null);
    });

    // The compatibility case, and the reason it exists: storing the
    // tri-state alone would have broken installed app builds quietly rather
    // than loudly. 'unchecked' is a non-empty string, so `if (items[key])`
    // is true for it, and an older client would have drawn an unchecked item
    // as ticked — a checklist lying in the direction that matters.
    test('an installed app build still reads booleans, and unchecked is false', async () => {
        await request(app)
            .patch('/api/driver-safety-checklist/today')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ itemKey: 'cargo', result: 'unchecked' });

        const read = await request(app)
            .get('/api/driver-safety-checklist/today')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.equal(read.body.data.items.cargo, false, 'unchecked must not read as ticked');
        assert.equal(read.body.data.results.cargo, 'unchecked');
        assert.equal(read.body.data.items.seatbelt, true, 'a pass must still read as ticked');

        // And the old boolean input shape must never raise a defect.
        const legacy = await request(app)
            .patch('/api/driver-safety-checklist/today')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ itemKey: 'fatigue', checked: false });
        assert.equal(legacy.body.data.results.fatigue, 'unchecked');
        assert.equal(legacy.body.data.defectId, null);
    });

    // Rows written before the tri-state existed hold real booleans in the
    // same JSONB column. Production had exactly this on deploy: `results`
    // came back full of true/false, so `results[key] === 'pass'` was false
    // for an item the driver had genuinely ticked, and the app would have
    // shown a completed check as outstanding. There is no migration that
    // fixes it honestly — a stored `false` is ambiguous, and the only
    // truthful reading is 'unchecked' — so it is normalised on read.
    test('a checklist row written as booleans still reads as a tri-state', async () => {
        await pool.query(
            `INSERT INTO driver_safety_checklists (driver_username, checklist_date, items)
             VALUES ($1, CURRENT_DATE, '{"seatbelt": true, "tyres": false}'::jsonb)
             ON CONFLICT (driver_username, checklist_date)
             DO UPDATE SET items = '{"seatbelt": true, "tyres": false}'::jsonb`,
            [driverPhone]
        );

        const read = await request(app)
            .get('/api/driver-safety-checklist/today')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.equal(read.body.data.results.seatbelt, 'pass', 'a stored true is a pass');
        assert.equal(read.body.data.results.tyres, 'unchecked', 'a stored false is ambiguous, so unchecked');
        assert.equal(read.body.data.items.seatbelt, true);
        assert.equal(read.body.data.items.tyres, false);
    });

    // The dashboard's socket handler REPLACES an incident object by id
    // (socketEventHandlers.ts), so every write to the table has to return
    // the whole row. While the acknowledge query returned only a subset,
    // marking an urgent report as seen blanked its severity and photo in
    // the UI — isUrgentIncident() reads severity === 'high', so the urgent
    // badge disappeared at exactly the moment a dispatcher picked it up,
    // and stayed gone until someone reloaded the page.
    //
    // The row is planted directly rather than posted through /api/incidents
    // because creating one kicks off a real AI analysis that rewrites
    // severity a few seconds later — this test is about the RETURNING
    // clause, and should not be racing that.
    test('acknowledging an incident keeps its severity and photo', async () => {
        const planted = await pool.query(
            `INSERT INTO geofence_alerts
                 (order_id, driver_name, event_type, distance_meters, description,
                  photo_url, lat, lng, severity)
             VALUES (NULL, $1, 'MANUAL_INCIDENT', 0, $2, 'incidents/test-key.jpg', -1.9501, 30.0588, 'high')
             RETURNING id;`,
            [driverPhone, 'Brake fade on the hill\n\nPedal went soft coming down from Kimironko.']
        );
        const incidentId = planted.rows[0].id;

        const acked = await request(app)
            .patch(`/api/incidents/${incidentId}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'ACKNOWLEDGED' });

        assert.equal(acked.statusCode, 200, JSON.stringify(acked.body));
        assert.equal(acked.body.data.status, 'ACKNOWLEDGED');
        assert.equal(acked.body.data.severity, 'high', 'severity dropped — the urgent badge would vanish on acknowledge');
        assert.equal(acked.body.data.photo_url, 'incidents/test-key.jpg', 'photo dropped from the acknowledge payload');
        assert.equal(Number(acked.body.data.lat), -1.9501, 'coordinates dropped from the acknowledge payload');
    });

    // The driver's submit response must not carry AI-derived fields: the
    // analysis now runs after the response, so a report comes back with
    // severity still null and is filled in moments later. Guards against
    // anyone re-introducing an await on that call, which is what used to
    // put 3-4 seconds between tapping Send and seeing it confirmed.
    test('reporting an incident returns before the AI analysis does', async () => {
        const started = Date.now();
        const created = await request(app)
            .post('/api/incidents')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('description', 'Windscreen cracked by a stone thrown up on RN1')
            .field('lat', '-1.9501')
            .field('lng', '30.0588');

        assert.equal(created.statusCode, 201, JSON.stringify(created.body));
        assert.equal(created.body.data.severity, null, 'severity in the response means the AI is back on the critical path');
        assert.ok(
            Date.now() - started < 2_000,
            `submit took ${Date.now() - started}ms — the measured analysis time is 3.3-4.2s, so this is waiting on it`
        );
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

        // Was /api/routes/optimize until multi-stop runs replaced it; the
        // point of the test is that a missing required field is a client
        // error, so it now guards the endpoint that actually plans work.
        const run = await request(app)
            .post('/api/trips')
            .set('Authorization', `Bearer ${dispatcherToken}`)
            .send({ orderIds: [] });
        assert.equal(run.statusCode, 400, JSON.stringify(run.body));
        assert.equal(run.body.error.code, 'TRIP_NO_ORDERS');
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

    // The speed attached to every fix used to be
    // Math.floor(Math.random() * 46) + 40 — the app always sent a real,
    // noise-filtered speedKmh and the server threw it away and invented a
    // number between 40 and 85. That value went to the live map and was
    // compared against geofence speed limits, so a driver could be recorded
    // speeding because of a dice roll.
    //
    // Two things have to hold, and the second is the one that regressed
    // invisibly for months: a reported speed is stored exactly, and an
    // unreported one is stored as NULL rather than as something plausible.
    test('telemetry records the speed reported, and NULL when none was', async () => {
        const socket = socketClient(`http://127.0.0.1:${socketPort}`, {
            auth: { token: `Bearer ${driverToken}` },
            transports: ['websocket'],
        });
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Socket connection timed out.')), 7000);
            socket.on('connect', () => { clearTimeout(timeout); resolve(); });
            socket.on('connect_error', (err) => { clearTimeout(timeout); reject(err); });
        });

        const before = await pool.query(
            'SELECT COALESCE(MAX(id), 0) AS max_id FROM driver_location_history WHERE driver_name = $1',
            [driverPhone]
        );
        const sinceId = before.rows[0].max_id;

        socket.emit('driver:telemetry-push', { lat: -1.9502, lng: 30.0802, speedKmh: 41 });
        await delay(600);
        socket.emit('driver:telemetry-push', { lat: -1.9503, lng: 30.0803 });
        await delay(900);

        const rows = await pool.query(
            'SELECT speed_kmh FROM driver_location_history WHERE driver_name = $1 AND id > $2 ORDER BY id ASC',
            [driverPhone, sinceId]
        );
        assert.equal(rows.rows.length, 2, 'expected both fixes to be persisted');
        assert.equal(Number(rows.rows[0].speed_kmh), 41, 'a reported speed must be stored exactly');
        assert.equal(rows.rows[1].speed_kmh, null, 'an unreported speed must be NULL, never substituted');

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

    test('admin: suspending an account blocks login and survives as history', async () => {
        const users = await request(app).get('/api/users').set('Authorization', `Bearer ${adminToken}`);
        const target = users.body.data.find((u) => u.username === driverPhone);
        assert.ok(target, 'the test driver should be listed');

        const suspend = await request(app).patch(`/api/users/${target.id}/status`)
            .set('Authorization', `Bearer ${adminToken}`).send({ status: 'suspended' });
        assert.equal(suspend.statusCode, 200, JSON.stringify(suspend.body));
        assert.equal(suspend.body.data.status, 'suspended');

        // The row stays. Deleting it would take assigned_to, the status
        // logs and the delivery confirmations with it.
        const still = await pool.query('SELECT status FROM users WHERE id = $1', [target.id]);
        assert.equal(still.rows[0].status, 'suspended');

        const reinstate = await request(app).patch(`/api/users/${target.id}/status`)
            .set('Authorization', `Bearer ${adminToken}`).send({ status: 'approved' });
        assert.equal(reinstate.statusCode, 200);
    });

    test('admin: cannot suspend your own account or the last admin', async () => {
        const users = await request(app).get('/api/users').set('Authorization', `Bearer ${adminToken}`);
        const me = users.body.data.find((u) => u.username === process.env.ADMIN_USERNAME);
        assert.ok(me);

        // Locking yourself out is one click away without this.
        const self = await request(app).patch(`/api/users/${me.id}/status`)
            .set('Authorization', `Bearer ${adminToken}`).send({ status: 'suspended' });
        assert.equal(self.statusCode, 400);
        assert.equal(self.body.error.code, 'ADMIN_USER_SELF_SUSPEND');

        // Only two states are accepted — 'deleted' and friends are not a
        // way in through the back door.
        const bogus = await request(app).patch(`/api/users/${me.id}/status`)
            .set('Authorization', `Bearer ${adminToken}`).send({ status: 'deleted' });
        assert.equal(bogus.statusCode, 400);
        assert.equal(bogus.body.error.code, 'ADMIN_USER_STATUS_INVALID');
    });

    test('admin: a dispatcher cannot suspend anyone', async () => {
        const users = await request(app).get('/api/users').set('Authorization', `Bearer ${adminToken}`);
        const target = users.body.data.find((u) => u.username === driverPhone);
        const response = await request(app).patch(`/api/users/${target.id}/status`)
            .set('Authorization', `Bearer ${dispatcherToken}`).send({ status: 'suspended' });
        assert.equal(response.statusCode, 403);
    });

    test('public: a booking records when the customer needs it, without setting priority', async () => {
        await resetPublicRateLimits();
        const create = await request(app).post('/api/public/orders').send({
            pickupAddress: 'Nyabugogo', deliveryAddress: 'Kicukiro centre',
            cargoType: 'Perishables', weightKg: 40,
            customerName: 'Urgency Test', customerPhone: '0788557111',
            neededBy: 'today',
        });
        assert.equal(create.statusCode, 201);

        const queue = await request(app).get('/api/orders/active').set('Authorization', `Bearer ${adminToken}`);
        const row = queue.body.data.find((o) => o.tracking_token === create.body.data.trackingToken);
        assert.equal(row.needed_by, 'today');
        // The whole point: the customer's answer is information for the
        // dispatcher, not a self-service way into the front of the queue.
        assert.equal(row.priority, 'normal');

        const bad = await request(app).post('/api/public/orders').send({
            pickupAddress: 'a', deliveryAddress: 'b', cargoType: 'Documents', weightKg: 1,
            customerName: 'x', customerPhone: '0788557112', neededBy: 'immediately',
        });
        assert.equal(bad.statusCode, 400);
        assert.equal(bad.body.error.code, 'INVALID_NEEDED_BY');
    });

    test('dispatch: priority can be changed after an order exists', async () => {
        await resetPublicRateLimits();
        const create = await request(app).post('/api/public/orders').send({
            pickupAddress: 'Gikondo', deliveryAddress: 'Remera',
            cargoType: 'General goods', weightKg: 20,
            customerName: 'Priority Test', customerPhone: '0788557113',
        });
        const queue = await request(app).get('/api/orders/active').set('Authorization', `Bearer ${adminToken}`);
        const row = queue.body.data.find((o) => o.tracking_token === create.body.data.trackingToken);
        assert.equal(row.priority, 'normal');

        const raised = await request(app).patch(`/api/orders/${row.id}/priority`)
            .set('Authorization', `Bearer ${adminToken}`).send({ priority: 'high' });
        assert.equal(raised.statusCode, 200, JSON.stringify(raised.body));
        assert.equal(raised.body.data.priority, 'high');

        // The queue sorts on it, so a raised order has to actually move.
        const after = await request(app).get('/api/orders/active').set('Authorization', `Bearer ${adminToken}`);
        assert.equal(after.body.data[0].priority, 'high');

        const bogus = await request(app).patch(`/api/orders/${row.id}/priority`)
            .set('Authorization', `Bearer ${adminToken}`).send({ priority: 'urgent' });
        assert.equal(bogus.statusCode, 400);
        assert.equal(bogus.body.error.code, 'ORDERS_PRIORITY_INVALID');

        // A driver must not be able to promote their own workload.
        const asDriver = await request(app).patch(`/api/orders/${row.id}/priority`)
            .set('Authorization', `Bearer ${driverToken}`).send({ priority: 'low' });
        assert.equal(asDriver.statusCode, 403);
    });

    test('trips: a run sequences its stops, never dropping before collecting', async () => {
        await resetPublicRateLimits();
        // Two orders whose pickups and drops interleave geographically, so a
        // pure nearest-neighbour pass would happily plan a drop first.
        const mk = async (pickup, delivery) => {
            const res = await request(app).post('/api/orders')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    cargo_description: 'Run test cargo', weight_kg: 10, origin_hub_id: hubId,
                    pickup_lat: pickup[0], pickup_lng: pickup[1],
                    delivery_lat: delivery[0], delivery_lng: delivery[1],
                });
            assert.equal(res.statusCode, 201, JSON.stringify(res.body));
            return res.body.data?.order?.id ?? res.body.data?.id;
        };
        const orderA = await mk([-1.9700, 30.1300], [-1.9440, 30.0620]);
        const orderB = await mk([-1.9450, 30.0630], [-1.9550, 30.0900]);

        const created = await request(app).post('/api/trips')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ orderIds: [orderA, orderB], driverUsername: driverPhone });
        assert.equal(created.statusCode, 201, JSON.stringify(created.body));
        const trip = created.body.data;
        assert.equal(trip.stopCount, 4);

        const positionOf = (orderId, kind) =>
            trip.stops.findIndex((s) => s.order_id === orderId && s.kind === kind);
        for (const id of [orderA, orderB]) {
            assert.ok(positionOf(id, 'PICKUP') < positionOf(id, 'DROP'),
                `order ${id} was planned to be delivered before it was collected`);
        }
        // Sequence numbers are 1..n with no gaps, which the driver app relies
        // on to show "stop 3 of 4".
        assert.deepEqual(trip.stops.map((s) => s.sequence), [1, 2, 3, 4]);

        // Assigning the run assigns its orders, so the driver's own job list
        // and the run agree rather than showing the same work twice under
        // two different owners. (The active queue is PENDING-only, so an
        // assigned order correctly drops out of it — check the order.)
        const rowA = await request(app).get(`/api/orders/${orderA}`).set('Authorization', `Bearer ${adminToken}`);
        assert.equal(rowA.body.data.assigned_to, driverPhone);
        assert.equal(rowA.body.data.status, 'ASSIGNED');

        tripUnderTest = trip;
    });

    test('trips: an order cannot be planned onto two live runs at once', async () => {
        const orderId = tripUnderTest.stops[0].order_id;
        const clash = await request(app).post('/api/trips')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ orderIds: [orderId] });
        assert.equal(clash.statusCode, 409);
        assert.equal(clash.body.error.code, 'TRIP_ORDER_ALREADY_PLANNED');
    });

    test('trips: working a stop drives its order status, and closes the run', async () => {
        const stops = tripUnderTest.stops;
        let latest = tripUnderTest;

        const pickup = stops.find((s) => s.kind === 'PICKUP');
        const done = await request(app).patch(`/api/trips/stops/${pickup.id}`)
            .set('Authorization', `Bearer ${driverToken}`).send({ status: 'DONE' });
        assert.equal(done.statusCode, 200, JSON.stringify(done.body));
        // The run starts itself the moment real work happens on it.
        assert.equal(done.body.data.status, 'ACTIVE');

        const order = await request(app).get(`/api/orders/${pickup.order_id}`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.equal(order.body.data.status, 'PICKED_UP');

        // A stop that did not happen must say why.
        const other = stops.find((s) => s.id !== pickup.id);
        const noReason = await request(app).patch(`/api/trips/stops/${other.id}`)
            .set('Authorization', `Bearer ${driverToken}`).send({ status: 'FAILED' });
        assert.equal(noReason.statusCode, 400);
        assert.equal(noReason.body.error.code, 'STOP_REASON_REQUIRED');

        // Close out everything still open; the run should finish on its own.
        for (const stop of stops) {
            const res = await request(app).patch(`/api/trips/stops/${stop.id}`)
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ status: 'DONE' });
            if (res.statusCode === 200) latest = res.body.data;
        }
        assert.equal(latest.status, 'COMPLETED');
        assert.equal(latest.completedStopCount, latest.stopCount);

        const drop = stops.find((s) => s.kind === 'DROP');
        const delivered = await request(app).get(`/api/orders/${drop.order_id}`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.equal(delivered.body.data.status, 'DELIVERED');

        // A finished stop cannot be reopened or double-counted.
        const again = await request(app).patch(`/api/trips/stops/${drop.id}`)
            .set('Authorization', `Bearer ${driverToken}`).send({ status: 'DONE' });
        assert.equal(again.statusCode, 409);
        assert.equal(again.body.error.code, 'STOP_ALREADY_CLOSED');
    });

    // Without this the suite leaves its whole world behind on every run:
    // a dispatcher, a driver, their orders, alerts, checklists and OTPs. That
    // accumulates — a local database had 42 users and 250 orders, most of them
    // from past runs, and enough public orders to exhaust the max:10/hour
    // rate limit and fail two of the suite's own tests.
    //
    // Rows are found by creation time rather than by id because the suite
    // creates them across forty tests through the real HTTP endpoints and
    // never collects the ids. That is only safe against a database nothing
    // else is writing to, so it mirrors ops/seed-demo-data.js's guard and
    // refuses anything but a local host.
    test.after(async () => {
        const host = String(process.env.DB_HOST || '');
        const isLocal = ['localhost', '127.0.0.1', 'postgres', ''].includes(host);

        if (!isLocal) {
            console.warn(`⚠️  Skipping test cleanup: DB_HOST is "${host}", not a local database. ` +
                'Rows created by this run were left in place.');
        } else {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query('DELETE FROM geofence_alerts WHERE created_at >= $1', [runStartedAt]);
                await client.query('DELETE FROM driver_safety_checklists WHERE driver_username = $1', [driverPhone]);
                await client.query('DELETE FROM otp_codes WHERE created_at >= $1', [runStartedAt]);
                // Before orders: trip_stops cascade from orders, but the trip
                // row itself only has its driver nulled, so it would survive.
                await client.query('DELETE FROM trips WHERE created_at >= $1', [runStartedAt]);
                // orders.created_at is `timestamp WITHOUT time zone` while every
                // other table here uses `timestamp WITH time zone`. Passing a JS
                // Date to the bare column compares local wall-clock against
                // UTC-stored values and silently matches nothing, which is how
                // nine orders per run survived the first version of this. The
                // cast reads the parameter as an instant, then converts it to the
                // UTC wall-clock the column actually holds.
                await client.query(
                    `DELETE FROM orders WHERE created_at >= ($1::timestamptz AT TIME ZONE 'UTC')`,
                    [runStartedAt]
                );
                // Never the bootstrap admin: it comes from migrate.js's seedAdmin
                // and every later run logs in as it.
                await client.query(
                    `DELETE FROM users WHERE created_at >= $1 AND role <> 'admin'`,
                    [runStartedAt]
                );
                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK');
                // A cleanup failure must not turn a passing suite red — the rows
                // are recoverable, a false failure costs more.
                console.warn(`⚠️  Test cleanup failed, rows left behind: ${err.message}`);
            } finally {
                client.release();
            }
        }

        await shutdownServices();
    });
}
