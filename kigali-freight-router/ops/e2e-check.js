// End-to-end check of the whole system, walked as journeys rather than as
// a list of endpoints.
//
// The point is not coverage of routes — it is that the handoffs work: a
// booking made on the website has to arrive in the dispatcher's queue, the
// assignment has to reach the driver's phone, the driver's taps have to move
// the order the customer is tracking. Those seams are where this system has
// actually broken before, and no single-endpoint test looks at them.
//
// Read-only where it can be. Where it must write, it creates its own rows,
// tags them, and removes them at the end, so it can be run against a
// populated demo database without disturbing it.
//
//   node ops/e2e-check.js
//
// Against a different host:
//   API=https://api.inzira.systems node ops/e2e-check.js

const API = process.env.API || 'http://localhost:5000';
const ADMIN_USER = process.env.ADMIN_USERNAME;
const ADMIN_PASS = process.env.ADMIN_PASSWORD;
// No defaults. These three are a complete sign-in for a real driver account
// — phone, the demo OTP that skips the SMS, and the PIN — and this
// repository is public, so a fallback literal here would publish a working
// production credential. The driver journeys below skip themselves when the
// values are absent rather than failing the run, so `node ops/e2e-check.js`
// with no environment still checks everything else.
const DRIVER_PHONE = process.env.APP_REVIEW_DEMO_PHONE;
const DRIVER_OTP = process.env.APP_REVIEW_DEMO_OTP;
const DRIVER_PIN = process.env.REVIEW_DRIVER_PIN;
const DRIVER_CREDS = Boolean(DRIVER_PHONE && DRIVER_OTP && DRIVER_PIN);

const TAG = '[e2e]';
const results = [];
const created = { orderIds: [], tripIds: [] };
let currentJourney = '';

function journey(name) {
    currentJourney = name;
    console.log(`\n\x1b[1m── ${name}\x1b[0m`);
}

function record(ok, label, detail) {
    results.push({ journey: currentJourney, ok, label, detail });
    const mark = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${mark} ${label}${detail && !ok ? `\n      ${detail}` : ''}`);
}

// Asserts and records in one step so a journey reads as prose.
function check(label, condition, detail) {
    record(Boolean(condition), label, detail);
    return Boolean(condition);
}

async function api(path, { method = 'GET', token, body, raw = false } = {}) {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (raw) return res;
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON body */ }
    return { status: res.status, ok: res.ok, body: json, data: json?.data, error: json?.error };
}

async function main() {
    console.log(`\n\x1b[1mEnd-to-end check\x1b[0m  →  ${API}\n`);

    // ── Reachability ────────────────────────────────────────────────
    journey('System is up');
    const health = await api('/health');
    check('/health responds', health.ok, `status ${health.status}`);
    check('reports a build commit', /^[0-9a-f]{7,40}/.test(health.data?.version || ''),
        `version = ${health.data?.version}`);
    const ready = await api('/ready');
    check('/ready confirms dependencies', ready.ok, `status ${ready.status}`);

    // ── Journey A: a customer books on the website ──────────────────
    journey('A. Customer books on the public website');
    const cargoTypes = await api('/api/public/cargo-types');
    const cargoList = cargoTypes.data?.cargoTypes || cargoTypes.data || [];
    check('cargo types offered to the booking form', Array.isArray(cargoList) && cargoList.length > 0,
        JSON.stringify(cargoTypes.body)?.slice(0, 140));

    const booking = await api('/api/public/orders', {
        method: 'POST',
        body: {
            pickupAddress: `${TAG} Gikondo Industrial Zone`,
            deliveryAddress: `${TAG} Kimironko Market`,
            cargoType: cargoList[0],
            customerName: 'E2E Customer',
            customerPhone: '+250788111222',
            customerEmail: 'e2e@example.com',
            specialInstructions: 'Ask for the site manager at the gate.',
            weightKg: 400,
            neededBy: 'today',
        },
    });
    const bookingOk = check('booking accepted', booking.ok, JSON.stringify(booking.error));
    const token = booking.data?.trackingToken || booking.data?.tracking_token;
    check('a tracking code is issued', Boolean(token), JSON.stringify(booking.data)?.slice(0, 160));
    // The public API deliberately returns only the tracking token — no
    // internal id, so nothing about the order numbering leaks to the web.
    // The dispatcher finds it the way a person would: by looking at the
    // queue. Resolved below, once we are signed in.
    let publicOrderId = null;

    if (token) {
        const track = await api(`/api/public/track/${token}`);
        check('the customer can track it immediately', track.ok, JSON.stringify(track.error));
        check('tracking shows a status, not a blank', Boolean(track.data?.status),
            JSON.stringify(track.data)?.slice(0, 160));
        const bad = await api('/api/public/track/NOSUCHCODE1');
        check('an unknown code is refused', bad.status === 404, `status ${bad.status}`);
    }

    const enquiry = await api('/api/public/contact', {
        method: 'POST',
        body: { name: 'E2E Enquirer', phone: '+250788333444', email: 'e2e@example.com',
                message: `${TAG} Do you handle refrigerated loads?` },
    });
    check('website enquiry accepted', enquiry.ok, JSON.stringify(enquiry.error));

    // ── Journey B: the dispatcher works the queue ───────────────────
    journey('B. Dispatcher works the queue (control tower)');
    if (!ADMIN_USER || !ADMIN_PASS) {
        record(false, 'admin credentials available', 'set ADMIN_USERNAME and ADMIN_PASSWORD');
        return finish();
    }
    const login = await api('/api/auth/login', { method: 'POST', body: { username: ADMIN_USER, password: ADMIN_PASS } });
    const adminToken = login.data?.token;
    if (!check('dispatcher signs in', Boolean(adminToken), JSON.stringify(login.error))) return finish();

    const noAuth = await api('/api/orders/active');
    check('the queue is closed to anonymous callers', noAuth.status === 401, `status ${noAuth.status}`);

    const active = await api('/api/orders/active', { token: adminToken });
    check('the queue loads', active.ok, JSON.stringify(active.error));
    const mine = (active.data || []).find((o) =>
        String(o.pickup_address_text || '').includes(TAG));
    publicOrderId = mine?.id ?? null;
    if (publicOrderId) created.orderIds.push(publicOrderId);
    check('the website booking is in the queue', Boolean(mine),
        `no queued order with pickup address containing "${TAG}" among ${active.data?.length} active`);
    check('it is marked as coming from the website', mine?.source === 'public', `source = ${mine?.source}`);
    check("the customer's note reached dispatch", Boolean(mine?.special_instructions),
        `instructions = ${mine?.special_instructions}`);

    if (publicOrderId) {
        // A website order has addresses but no coordinates until dispatch
        // places it — the map cannot draw it before this.
        check('a website order arrives with no coordinates', mine?.pickup_lat == null,
            `pickup_lat = ${mine?.pickup_lat}`);
        const hubs = await api('/api/hubs', { token: adminToken });
        const hub = hubs.data?.[0];
        const placed = await api(`/api/orders/${publicOrderId}/place`, {
            method: 'PATCH', token: adminToken,
            body: { pickupLat: -1.9395, pickupLng: 30.0419, deliveryLat: -1.9542, deliveryLng: 30.1287, originHubId: hub?.id },
        });
        check('dispatch can place it on the map', placed.ok, JSON.stringify(placed.error));

        const prio = await api(`/api/orders/${publicOrderId}/priority`, {
            method: 'PATCH', token: adminToken, body: { priority: 'high' },
        });
        check('priority can be raised', prio.ok, JSON.stringify(prio.error));
        const badPrio = await api(`/api/orders/${publicOrderId}/priority`, {
            method: 'PATCH', token: adminToken, body: { priority: 'urgent' },
        });
        check('an invented priority is refused', badPrio.status >= 400, `status ${badPrio.status}`);
    }

    // Who can actually be given work.
    const users = await api('/api/users', { token: adminToken });
    const drivers = (users.data || []).filter((u) => u.role === 'driver');
    const assignable = drivers.filter((d) => d.verified && d.hasVehicle && d.status !== 'suspended');
    check('the driver roster loads', drivers.length > 0, `${drivers.length} drivers`);
    check('at least one driver is assignable', assignable.length > 0,
        `${assignable.length} of ${drivers.length} verified with a vehicle`);
    const driver = assignable.find((d) => d.username === DRIVER_PHONE) || assignable[0];

    if (publicOrderId && driver) {
        const near = await api(`/api/orders/${publicOrderId}/nearest-drivers`, { token: adminToken });
        check('nearest-driver suggestions load', near.ok, JSON.stringify(near.error));

        const assign = await api('/api/orders/assign', {
            method: 'POST', token: adminToken,
            body: { orderIds: [publicOrderId], driverName: driver.username },
        });
        check('the order can be assigned', assign.ok, JSON.stringify(assign.error));

        const hist = await api(`/api/orders/${publicOrderId}/history`, { token: adminToken });
        check('the assignment is recorded in history', hist.ok && (hist.data || []).length > 0,
            `${hist.data?.length} entries`);
    }

    // The gate that matters: an unverified driver must be refused.
    const unverified = drivers.find((d) => !d.verified || !d.hasVehicle);
    if (unverified) {
        const blocked = await api('/api/orders/assign', {
            method: 'POST', token: adminToken,
            body: { orderIds: [publicOrderId], driverName: unverified.username },
        });
        check('an unverified driver cannot be given cargo', blocked.status === 409,
            `status ${blocked.status} for ${unverified.username}`);
    } else {
        record(true, 'an unverified driver cannot be given cargo (none on file to try)', '');
    }

    const inFlight = await api('/api/orders/in-flight', { token: adminToken });
    check('the in-flight board loads', inFlight.ok, JSON.stringify(inFlight.error));
    const pooling = await api('/api/orders/pooling', { token: adminToken });
    check('batch suggestions load', pooling.ok, JSON.stringify(pooling.error));

    // ── Journey C: the driver's phone ───────────────────────────────
    journey('C. Driver signs in and works the job');
    // Signing in as a driver needs a real account's phone, its demo OTP and
    // its PIN, and those are supplied by environment rather than committed —
    // see the note at the top of this file. Without them this is skipped
    // rather than failed, so a run with no environment set still exercises
    // every journey that does not need a driver on the phone.
    let otpToken = null;
    if (!DRIVER_CREDS) {
        record(true, 'driver sign-in skipped — set APP_REVIEW_DEMO_PHONE, APP_REVIEW_DEMO_OTP and REVIEW_DRIVER_PIN to include it', '');
    } else {
        const otpReq = await api('/api/auth/driver/otp/request', { method: 'POST', body: { phoneNumber: DRIVER_PHONE } });
        check('a verification code can be requested', otpReq.ok,
            otpReq.status === 429
                ? 'rate limited — the limiter allows 8 requests per 10 minutes per number, so back-to-back runs of this check will trip it. Wait, or use a different demo number.'
                : JSON.stringify(otpReq.error));
        const otp = await api('/api/auth/driver/otp/verify', {
            method: 'POST', body: { phoneNumber: DRIVER_PHONE, code: DRIVER_OTP },
        });
        otpToken = otp.data?.otpSessionToken;
        check('verification code accepted', Boolean(otpToken), JSON.stringify(otp.error));
    }

    let driverToken = null;
    if (otpToken) {
        const pin = await api('/api/auth/driver/pin/login', {
            method: 'POST', body: { otpSessionToken: otpToken, pin: DRIVER_PIN },
        });
        driverToken = pin.data?.accessToken || pin.data?.token;
        check('PIN accepted, driver signed in', Boolean(driverToken), JSON.stringify(pin.error));

        const wrongPin = await api('/api/auth/driver/pin/login', {
            method: 'POST', body: { otpSessionToken: otpToken, pin: '0000' },
        });
        check('a wrong PIN is refused', !wrongPin.ok, `status ${wrongPin.status}`);
    }

    if (driverToken) {
        const assignments = await api('/api/orders/driver/assignments', { token: driverToken });
        check('the driver sees their job list', assignments.ok, JSON.stringify(assignments.error));
        const job = (assignments.data || []).find((o) => o.id === publicOrderId);
        check('the order dispatch assigned is on the phone', Boolean(job),
            `looking for ${publicOrderId} among ${assignments.data?.length}`);
        check("the customer's note reached the driver", Boolean(job?.special_instructions),
            `instructions = ${job?.special_instructions}`);
        check('priority reached the driver', job?.priority === 'high', `priority = ${job?.priority}`);

        const docs = await api('/api/driver-documents/mine', { token: driverToken });
        check('the compliance checklist loads', docs.ok, JSON.stringify(docs.error));
        check('all five documents are listed', (docs.data?.checklist || []).length === 5,
            `${docs.data?.checklist?.length} listed`);
        check('the driver reads as verified', docs.data?.verified === true, `verified = ${docs.data?.verified}`);

        const checklist = await api('/api/driver-safety-checklist/today', { token: driverToken });
        check('the safety checklist loads', checklist.ok, JSON.stringify(checklist.error));
        const tick = await api('/api/driver-safety-checklist/today', {
            method: 'PATCH', token: driverToken, body: { itemKey: 'seatbelt', checked: true },
        });
        check('a safety item can be ticked', tick.ok, JSON.stringify(tick.error));
        const badTick = await api('/api/driver-safety-checklist/today', {
            method: 'PATCH', token: driverToken, body: { itemKey: 'nonsense', checked: true },
        });
        check('an unknown safety item is refused', badTick.status >= 400, `status ${badTick.status}`);

        const ping = await api('/api/fleet/telemetry', {
            method: 'POST', token: driverToken, body: { lat: -1.9440, lng: 30.0610, speedKmh: 24 },
        });
        check('a position ping is accepted', ping.ok, JSON.stringify(ping.error));

        // Walk the order the whole way, in the order the app does it.
        for (const status of ['PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED']) {
            const step = await api(`/api/orders/${publicOrderId}/status`, {
                method: 'PATCH', token: driverToken, body: { status },
            });
            check(`driver moves the order to ${status}`, step.ok, JSON.stringify(step.error));
        }

        const completed = await api('/api/orders/driver/completed', { token: driverToken });
        check('it appears in the delivery log', (completed.data || []).some((o) => o.id === publicOrderId),
            `${completed.data?.length} completed`);
    }

    // ── Journey D: the customer sees the result ─────────────────────
    journey('D. The customer sees the delivery complete');
    if (token) {
        const track = await api(`/api/public/track/${token}`);
        check('tracking reflects the delivery', track.data?.status === 'DELIVERED',
            `status = ${track.data?.status}`);
    }

    // ── Journey E: a multi-stop run ─────────────────────────────────
    journey('E. Multi-stop run, planned and driven');
    // Creates its own orders rather than borrowing whatever the demo data
    // left PENDING: consecutive runs would otherwise drain that pool and
    // this journey would silently stop testing anything.
    const hubsForRun = await api('/api/hubs', { token: adminToken });
    const runHub = hubsForRun.data?.[0];
    const plannable = [];
    for (const [i, dest] of [[-1.9536, 30.1270], [-1.9280, 30.0890]].entries()) {
        const made = await api('/api/orders', {
            method: 'POST', token: adminToken,
            body: {
                cargo_description: `${TAG} run cargo ${i + 1}`, weight_kg: 300,
                origin_hub_id: runHub?.id, delivery_lat: dest[0], delivery_lng: dest[1],
                recipient_name: 'E2E Recipient', recipient_phone: '+250788555666', priority: 'normal',
            },
        });
        const row = made.data?.order || made.data;
        if (row?.id) { plannable.push(row); created.orderIds.push(row.id); }
    }
    check('orders can be created from the dispatcher side', plannable.length === 2,
        `created ${plannable.length} of 2`);

    if (plannable.length && driver) {
        const trip = await api('/api/trips', {
            method: 'POST', token: adminToken,
            body: { orderIds: plannable.map((o) => o.id), driverUsername: driver.username },
        });
        const tripId = trip.data?.id;
        check('a run can be planned', trip.ok, JSON.stringify(trip.error));
        if (tripId) created.tripIds.push(tripId);
        check('every order became a pickup and a drop', trip.data?.stopCount === plannable.length * 2,
            `${trip.data?.stopCount} stops for ${plannable.length} orders`);

        // The sequencing rule that makes a run valid at all.
        const stops = trip.data?.stops || [];
        let precedenceHolds = true;
        for (const s of stops.filter((x) => x.kind === 'DROP')) {
            const pickup = stops.find((x) => x.order_id === s.order_id && x.kind === 'PICKUP');
            if (pickup && pickup.sequence > s.sequence) precedenceHolds = false;
        }
        check('no drop is sequenced before its own pickup', precedenceHolds,
            stops.map((s) => `${s.sequence}:${s.kind}#${s.order_id}`).join(' '));
        check('the run reports a planned distance', Number(trip.data?.planned_distance_m) > 0,
            `${trip.data?.planned_distance_m} m`);

        if (tripId) {
            const opt = await api(`/api/trips/${tripId}/optimise`, { method: 'POST', token: adminToken });
            check('the run can be re-optimised', opt.ok, JSON.stringify(opt.error));

            const started = await api(`/api/trips/${tripId}`, {
                method: 'PATCH', token: adminToken, body: { status: 'ACTIVE' },
            });
            check('the run can be started', started.ok, JSON.stringify(started.error));

            if (driverToken) {
                const myRun = await api('/api/trips/mine', { token: driverToken });
                check('the driver sees the run on their phone', myRun.ok && Boolean(myRun.data),
                    JSON.stringify(myRun.error));

                const firstStop = (myRun.data?.stops || [])[0];
                if (firstStop) {
                    const arrived = await api(`/api/trips/stops/${firstStop.id}`, {
                        method: 'PATCH', token: driverToken, body: { status: 'ARRIVED' },
                    });
                    check('the driver can mark arrival at a stop', arrived.ok, JSON.stringify(arrived.error));
                    const done = await api(`/api/trips/stops/${firstStop.id}`, {
                        method: 'PATCH', token: driverToken, body: { status: 'DONE' },
                    });
                    check('the driver can complete a stop', done.ok, JSON.stringify(done.error));

                    // The organising rule of the whole feature: stops drive
                    // order status, never the other way round.
                    const order = await api(`/api/orders/${firstStop.order_id}`, { token: adminToken });
                    const expected = firstStop.kind === 'PICKUP' ? 'PICKED_UP' : 'DELIVERED';
                    check(`completing a ${firstStop.kind} moved its order to ${expected}`,
                        order.data?.status === expected, `order status = ${order.data?.status}`);
                }
            }
        }

        // The gate this system was missing until recently.
        if (unverified) {
            const refused = await api('/api/trips', {
                method: 'POST', token: adminToken,
                body: { orderIds: plannable.map((o) => o.id), driverUsername: unverified.username },
            });
            check('a run cannot be planned for an unverified driver', refused.status === 409,
                `status ${refused.status}`);
        }
        const ghost = await api('/api/trips', {
            method: 'POST', token: adminToken,
            body: { orderIds: plannable.map((o) => o.id), driverUsername: '+250700000000' },
        });
        check('a run cannot be planned for a driver who does not exist', ghost.status === 404,
            `status ${ghost.status}`);
    }

    // ── Journey F: the admin centre ─────────────────────────────────
    journey('F. Admin centre');
    for (const [label, path] of [
        ['user governance loads', '/api/users'],
        ['fleet vehicles load', '/api/vehicles'],
        ['vehicle types load', '/api/vehicle-types'],
        ['audit log loads', '/api/audit-logs'],
        ['statistics load', '/api/stats'],
        ['dispatch contact loads', '/api/settings/dispatch-contact'],
        ['kiosk devices load', '/api/kiosk-devices'],
        ['hubs load', '/api/hubs'],
        ['geofences load', '/api/geofences'],
        ['incident feed loads', '/api/incidents'],
        ['telemetry sheet loads', '/api/fleet/telemetry-sheet'],
        ['compliance warnings load', '/api/fleet/compliance'],
        ['performance analytics load', '/api/fleet/analytics/performance'],
        ['saved routes load', '/api/routes'],
    ]) {
        const r = await api(path, { token: adminToken });
        check(label, r.ok, `${path} → ${r.status}`);
    }

    const reviewQueue = await api('/api/driver-documents', { token: adminToken });
    check('the document review queue loads', reviewQueue.ok, JSON.stringify(reviewQueue.error));
    const rows = reviewQueue.data || [];
    const dupes = rows.filter((r, i) =>
        rows.findIndex((x) => x.username === r.username && x.documentType === r.documentType) !== i);
    check('no document is listed twice', dupes.length === 0,
        dupes.map((d) => `${d.username}/${d.documentType}`).join(', '));
    check('vehicle documents carry their plate',
        rows.filter((r) => r.holderKind === 'vehicle').every((r) => Boolean(r.plateNumber)), '');

    const audit = await api('/api/audit-logs', { token: adminToken });
    check('the audit log recorded this run', (audit.data || []).length > 0, `${audit.data?.length} entries`);

    // ── Journey G: incidents ────────────────────────────────────────
    journey('G. Incident reported by a driver reaches dispatch');
    if (driverToken) {
        const report = await api('/api/incidents', {
            method: 'POST', token: driverToken,
            body: { title: `${TAG} Test incident`, description: 'Raised by the end-to-end check.', severity: 'low' },
        });
        check('a driver can report an incident', report.ok, JSON.stringify(report.error));
        const feed = await api('/api/incidents', { token: adminToken });
        const found = (feed.data || []).find((i) => JSON.stringify(i).includes(TAG));
        check('dispatch sees it in the feed', Boolean(found), `${feed.data?.length} in feed`);
        if (found?.id) {
            const resolved = await api(`/api/incidents/${found.id}/status`, {
                method: 'PATCH', token: adminToken, body: { status: 'RESOLVED' },
            });
            check('dispatch can resolve it', resolved.ok, JSON.stringify(resolved.error));
        }
        const mineFeed = await api('/api/incidents/mine', { token: driverToken });
        check("the driver can see their own reports", mineFeed.ok, JSON.stringify(mineFeed.error));
    }

    // ── Journey H: permissions ──────────────────────────────────────
    journey('H. Role boundaries hold');
    if (driverToken) {
        for (const [label, path] of [
            ['a driver cannot read the user list', '/api/users'],
            ['a driver cannot read the audit log', '/api/audit-logs'],
            ['a driver cannot read the document review queue', '/api/driver-documents'],
            ['a driver cannot read the whole active queue', '/api/orders/active'],
        ]) {
            const r = await api(path, { token: driverToken });
            check(label, r.status === 401 || r.status === 403, `${path} → ${r.status}`);
        }
    }
    const garbage = await api('/api/users', { token: 'not-a-real-token' });
    check('a forged token is rejected', garbage.status === 401 || garbage.status === 403, `status ${garbage.status}`);

    await finish();
}

async function finish() {
    // Clean up only what this run created.
    journey('Cleanup');
    try {
        const login = await api('/api/auth/login', { method: 'POST', body: { username: ADMIN_USER, password: ADMIN_PASS } });
        const t = login.data?.token;
        for (const id of created.tripIds) {
            await api(`/api/trips/${id}`, { method: 'PATCH', token: t, body: { status: 'CANCELLED' } });
        }
        record(true, `cancelled ${created.tripIds.length} run(s) this check created`, '');
        record(true, `left ${created.orderIds.length} tagged order(s) — remove with the SQL printed below`, '');
    } catch (err) {
        record(false, 'cleanup', err.message);
    }

    const passed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${'─'.repeat(64)}`);
    console.log(`\x1b[1m${passed}/${results.length} checks passed\x1b[0m`);
    if (failed.length) {
        console.log(`\n\x1b[31mFailures:\x1b[0m`);
        for (const f of failed) console.log(`  • [${f.journey}] ${f.label}\n      ${f.detail || ''}`);
    }
    if (created.orderIds.length) {
        console.log(`\nTo remove this run's orders:`);
        console.log(`  DELETE FROM orders WHERE cargo_description LIKE '${TAG}%' OR pickup_address_text LIKE '${TAG}%';`);
    }
    console.log('');
    process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
    console.error('\n\x1b[31mHarness crashed:\x1b[0m', err);
    process.exit(2);
});
