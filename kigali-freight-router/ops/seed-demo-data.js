// Seeds a plausible fortnight of operations for a small Kigali freight
// company, so the dashboard and the driver app can be looked at, demoed
// and learned from without anyone having to imagine what the empty screens
// would contain.
//
// Everything here is invented, but nothing here is arbitrary. The places
// are real Kigali neighbourhoods at their real coordinates, the cargo is
// what actually moves between them — cement out of Gikondo, produce and
// sacks through Nyabugogo, stock for the Kimironko traders — the plates
// follow Rwanda's RAx 000 x format, and the working day runs roughly
// 07:00–18:00 with nothing at 3am. Orders decay backwards from today: a
// few still pending, some moving, most delivered and closed.
//
// The point is that it should be impossible to tell from the screen that
// this is not a fortnight of real work. Rows named "Integration Test
// Driver" taught nobody anything about whether the product is usable.
//
// Run:  node ops/seed-demo-data.js
// Undo: node ops/seed-demo-data.js --clear
//
// Refuses to touch anything but a local database — see the guard below.
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import pool from '../config/db.js';
// Imported rather than listed again here. A driver only counts as verified
// when every required document is approved, and the two lists are kept apart
// because they live in different tables — the person's papers against the
// driver, the truck's against the vehicle. A seeder holding its own copy of
// either list silently produces drivers the dispatcher cannot assign the
// moment the two fall out of step, which is exactly what happened when this
// file hardcoded four of the five.
import { DRIVER_DOCUMENT_TYPES, VEHICLE_DOCUMENT_TYPES } from '../services/driverVerificationService.js';

// Demo drivers all share this PIN so the app can be opened as any of them
// during a walkthrough. Fine for a laptop, which is the only place this
// script is allowed to run.
const DEMO_PIN = '1234';

// Kept out of the delete path deliberately: these are the accounts someone
// is actually signed in as.
const PROTECTED_USERS = ['admin', 'peter', '+250790804004'];

// Real places, real coordinates. A dispatcher who knows Kigali should be
// able to look at the map and find nothing out of place.
const PLACES = {
    nyabugogo:    { name: 'Nyabugogo Market, gate 2',            lat: -1.9398, lng: 30.0435 },
    kimironko:    { name: 'Kimironko Market, stall row C',       lat: -1.9448, lng: 30.1256 },
    gikondo:      { name: 'Gikondo Industrial Zone, plot 14',    lat: -1.9788, lng: 30.0840 },
    remera:       { name: 'Remera, Giporoso junction',           lat: -1.9578, lng: 30.1128 },
    kacyiru:      { name: 'Kacyiru, near the KCT building',      lat: -1.9403, lng: 30.0921 },
    nyamirambo:   { name: 'Nyamirambo, Rue de Kigali',           lat: -1.9812, lng: 30.0432 },
    kicukiro:     { name: 'Kicukiro Centre, opposite the market', lat: -1.9846, lng: 30.1027 },
    gisozi:       { name: 'Gisozi, near the SULFO factory',      lat: -1.9160, lng: 30.0680 },
    kabuga:       { name: 'Kabuga trading centre',               lat: -1.9530, lng: 30.2140 },
    masaka:       { name: 'Masaka, along the Kayonza road',      lat: -2.0180, lng: 30.1770 },
    nyarutarama:  { name: 'Nyarutarama, Golf Course road',       lat: -1.9330, lng: 30.1070 },
    gatsata:      { name: 'Gatsata, lower junction',             lat: -1.9200, lng: 30.0570 },
    kanombe:      { name: 'Kanombe, near the airport roundabout', lat: -1.9690, lng: 30.1390 },
    rwandex:      { name: 'Rwandex depot, Sonatube road',        lat: -1.9740, lng: 30.0930 },
    kimisagara:   { name: 'Kimisagara, market side',             lat: -1.9520, lng: 30.0430 },
    nyanza:       { name: 'Nyanza-Kicukiro, near the stadium',   lat: -2.0000, lng: 30.1140 },
};

const DRIVERS = [
    // The account already signed in on the test handset. Its number is
    // real to the system, so the seeder must reuse it rather than invent a
    // second Jean Kamara — the first version of this list did exactly that
    // and left the driver anyone would actually demo with owning nothing.
    { username: '+250790804004', fullName: 'Jean Kamara',          plate: 'RAD 418 C', type: 'Medium Truck', existing: true },
    { username: '+250788512067', fullName: 'Emmanuel Nsengimana',  plate: 'RAB 702 K', type: 'Heavy Hauler' },
    { username: '+250788634891', fullName: 'Claudine Mukamana',    plate: 'RAC 315 D', type: 'Light Van' },
    { username: '+250788745302', fullName: 'Eric Habimana',        plate: 'RAD 889 B', type: 'Medium Truck' },
    { username: '+250788856714', fullName: 'Alphonsine Uwase',     plate: 'RAE 214 F', type: 'Light Van' },
    { username: '+250788967125', fullName: 'Théoneste Niyonzima',  plate: 'RAB 546 M', type: 'Heavy Hauler' },
    { username: '+250789078536', fullName: 'Diane Iradukunda',     plate: 'RAC 903 J', type: 'Medium Truck' },
];

// Businesses that would plausibly ring a Kigali freight company.
const CUSTOMERS = [
    { name: 'Uwimana Hardware',        phone: '+250788112204', email: 'orders@uwimanahardware.rw' },
    { name: 'Bralirwa Depot Kicukiro', phone: '+250788330415', email: null },
    { name: 'Kigali Fresh Produce',    phone: '+250788447726', email: 'logistics@kigalifresh.rw' },
    { name: 'Mutoni Pharmacy',         phone: '+250788559037', email: null },
    { name: 'CHIC Textiles, shop 214', phone: '+250788663148', email: null },
    { name: 'Rwanda Building Supplies', phone: '+250788774259', email: 'dispatch@rbs.rw' },
    { name: 'Gasabo Furniture Works',  phone: '+250788885360', email: null },
    { name: 'Umucyo Electronics',      phone: '+250788996471', email: 'sales@umucyo.rw' },
    { name: 'Inyange Distributor East', phone: '+250789007582', email: null },
    { name: 'Karisimbi Stationers',    phone: '+250789118693', email: null },
];

// Cargo, and where it tends to come from. The quantity is generated per
// order rather than baked into the string: a fixed list produced runs
// where three separate stops all read "Office furniture — 12 desks", and
// identical descriptions repeating is exactly what makes seeded data look
// seeded. `each` is the per-unit weight, so the tonnage follows the count
// instead of drifting away from it.
const CARGO = [
    { unit: 'bags of cement',            each: 50,   min: 40,  max: 160, from: 'gikondo', prefix: '' },
    { unit: 'iron sheets, 3m',           each: 15,   min: 60,  max: 200, from: 'gikondo', prefix: '' },
    { unit: 'crates of bottled water',   each: 22,   min: 20,  max: 70,  from: 'rwandex', prefix: '' },
    { unit: 'sacks of produce',          each: 45,   min: 8,   max: 30,  from: 'nyabugogo', prefix: 'Tomatoes and onions — ' },
    { unit: 'sacks of rice and flour',   each: 50,   min: 20,  max: 60,  from: 'nyabugogo', prefix: '' },
    { unit: 'cold boxes',                each: 30,   min: 2,   max: 6,   from: 'kacyiru', prefix: 'Pharmaceutical supplies — ' },
    { unit: 'office desks',              each: 58,   min: 4,   max: 18,  from: 'gikondo', prefix: '' },
    { unit: 'bales of textile',          each: 20,   min: 10,  max: 40,  from: 'nyabugogo', prefix: '' },
    { unit: 'crates of soft drinks',     each: 23,   min: 25,  max: 80,  from: 'rwandex', prefix: '' },
    { unit: 'appliance cartons',         each: 42,   min: 6,   max: 24,  from: 'gikondo', prefix: 'TVs and fridges — ' },
    { unit: 'tins of paint',             each: 18,   min: 15,  max: 50,  from: 'gikondo', prefix: '' },
    { unit: 'cartons of stationery',     each: 12,   min: 10,  max: 45,  from: 'kimironko', prefix: 'School order — ' },
];

function describeCargo(cargo) {
    const count = between(cargo.min, cargo.max);
    return { text: `${cargo.prefix}${count} ${cargo.unit}`, kg: count * cargo.each };
}

const DELIVERY_POINTS = ['kimironko', 'remera', 'kicukiro', 'nyamirambo', 'kabuga', 'masaka',
    'nyarutarama', 'gatsata', 'kanombe', 'gisozi', 'kimisagara', 'nyanza'];

// Notes a customer would actually type into the booking form.
const NOTES = [
    'Gate closes at 17:00 — please come before that.',
    'Ask for Claudine at reception, she has the keys.',
    'Fragile. The top boxes cannot be stacked.',
    'Call when you reach the junction, the road in is narrow.',
    'Delivery is upstairs, second floor. No lift.',
    null, null, null, null,
];

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ23456789';

function trackingToken() {
    const bytes = crypto.randomBytes(8);
    let out = '';
    for (let i = 0; i < 8; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return `INZ-${out}`;
}

// Deterministic pseudo-randomness: the same seed produces the same
// fortnight every time, so a bug found while demoing can be reproduced.
let seedState = 20260817;
function rand() {
    seedState = (seedState * 1103515245 + 12345) % 2147483648;
    return seedState / 2147483648;
}
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

// A timestamp `daysAgo` days back, at a believable hour of the working day.
function workingMoment(daysAgo, hour = null, minute = null) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour ?? between(7, 17), minute ?? between(0, 59), between(0, 59), 0);
    return d;
}

async function guardAgainstProduction() {
    const host = String(process.env.DB_HOST || '');
    const isLocal = ['localhost', '127.0.0.1', 'postgres', ''].includes(host);
    if (!isLocal) {
        throw new Error(
            `Refusing to run: DB_HOST is "${host}". This writes invented customers and ` +
            `deliveries, and it must never land in a database anyone is relying on.`
        );
    }
}

async function clearDemoData(client) {
    // Only the demo drivers and their traffic. The three real accounts, the
    // hubs and the vehicle types are left exactly as they are.
    // Documents belong to the demo for every driver here, including the
    // protected account: the account is real, the paperwork attached to it
    // is invented. Only the account row itself is spared below.
    const allDemoDrivers = DRIVERS.map((d) => d.username);
    const usernames = DRIVERS.filter((d) => !d.existing).map((d) => d.username);
    // vehicle_documents is listed rather than left to CASCADE from
    // fleet_vehicles, so the fact that clearing the demo fleet also clears
    // its paperwork is visible here instead of implied by a foreign key.
    await client.query('TRUNCATE orders, trips, trip_stops, order_status_logs, delivery_confirmations, geofence_alerts, contact_messages, driver_safety_checklists, fleet_vehicles, vehicle_documents, system_audit_logs RESTART IDENTITY CASCADE');
    await client.query('DELETE FROM driver_documents WHERE username = ANY($1::text[])', [allDemoDrivers]);
    await client.query('DELETE FROM users WHERE username = ANY($1::text[]) AND username <> ALL($2::text[])', [usernames, PROTECTED_USERS]);
    console.log('🧹 Demo data cleared.');
}

async function seed() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Seeding replaces the demo rather than adding to it. Running this
        // twice used to fail partway through on a unique constraint — the
        // second fortnight's runs colliding with the first's — which left
        // the operator reading a Postgres error to learn they should have
        // passed --clear. Clearing inside the same transaction means a
        // failure anywhere still rolls back to the data that was there
        // before, so a broken seed can never leave an empty board.
        await clearDemoData(client);

        const pinHash = await bcrypt.hash(DEMO_PIN, 10);
        const hubs = (await client.query('SELECT id, name FROM hubs ORDER BY id')).rows;
        const hubByPlace = {
            nyabugogo: hubs.find((h) => h.name.includes('Nyabugogo')),
            kimironko: hubs.find((h) => h.name.includes('Kimironko')),
            gikondo: hubs.find((h) => h.name.includes('Gikondo')),
            rwandex: hubs.find((h) => h.name.includes('Gikondo')),
            kacyiru: hubs.find((h) => h.name.includes('Kimironko')),
        };

        // ── People and vehicles ──────────────────────────────────────
        for (const driver of DRIVERS) {
            await client.query(
                `INSERT INTO users (username, full_name, role, status, phone_number, pin_hash, pin_set_at, onboarding_completed_at, created_at)
                 VALUES ($1, $2, 'driver', 'approved', $1, $3, $4, $4, $4)
                 ON CONFLICT (username) DO UPDATE SET full_name = EXCLUDED.full_name`,
                [driver.username, driver.fullName, pinHash, workingMoment(between(30, 90), 9)]
            );
            const user = (await client.query('SELECT id FROM users WHERE username = $1', [driver.username])).rows[0];
            driver.id = user.id;

            const capacity = { 'Heavy Hauler': 12000, 'Medium Truck': 5000, 'Light Van': 1200 }[driver.type];
            const vehicle = await client.query(
                `INSERT INTO fleet_vehicles (plate_number, vehicle_type, current_driver_id, status, max_weight_kg, max_range_km, created_at)
                 VALUES ($1, $2, $3, 'ACTIVE', $4, $5, $6) RETURNING id`,
                [driver.plate, driver.type, driver.id, capacity, between(200, 600), workingMoment(between(40, 120), 10)]
            );
            const vehicleId = vehicle.rows[0].id;

            // A driver who has been working for weeks has their paperwork in.
            //
            // Two documents describe the person and three describe the truck,
            // and they live in different tables — putting all five against the
            // driver, as this once did, leaves three rows the verification
            // service does not read and a duplicate of every vehicle document
            // in the admin's review queue.
            for (const doc of DRIVER_DOCUMENT_TYPES) {
                await client.query(
                    `INSERT INTO driver_documents (username, document_type, file_url, status, uploaded_at, reviewed_by, reviewed_at)
                     VALUES ($1, $2, $3, 'approved', $4, 'peter', $5)
                     ON CONFLICT (username, document_type) DO NOTHING`,
                    [driver.username, doc, `demo/${driver.username}/${doc}.jpg`,
                     workingMoment(between(25, 60), 11), workingMoment(between(20, 24), 14)]
                );
            }
            for (const doc of VEHICLE_DOCUMENT_TYPES) {
                await client.query(
                    `INSERT INTO vehicle_documents (vehicle_id, document_type, file_url, status, uploaded_at, uploaded_by, reviewed_by, reviewed_at)
                     VALUES ($1, $2, $3, 'approved', $4, $5, 'peter', $6)
                     ON CONFLICT (vehicle_id, document_type) DO NOTHING`,
                    [vehicleId, doc, `demo/${driver.plate.replace(/\s+/g, '')}/${doc}.jpg`,
                     workingMoment(between(25, 60), 11), driver.username, workingMoment(between(20, 24), 14)]
                );
            }
        }
        console.log(`👥 ${DRIVERS.length} drivers, vehicles and approved documents.`);

        // ── A fortnight of orders ────────────────────────────────────
        // Weighted so the past is finished and today is still in motion,
        // which is what a board looks like at 11am on a working day.
        const orders = [];
        for (let daysAgo = 14; daysAgo >= 0; daysAgo--) {
            const isToday = daysAgo === 0;
            // Today carries more than a typical day because today is the day
            // being demonstrated: the runs below consume six of these, and
            // what is left has to still look like a working queue with
            // something in it to plan.
            const count = isToday ? 10 : between(3, 6);
            for (let i = 0; i < count; i++) {
                const cargo = pick(CARGO);
                const load = describeCargo(cargo);
                const origin = PLACES[cargo.from];
                const destKey = pick(DELIVERY_POINTS);
                const dest = PLACES[destKey];
                const customer = pick(CUSTOMERS);
                const driver = pick(DRIVERS);
                const hub = hubByPlace[cargo.from];

                // Roughly a third of the work comes through the website now.
                // Today alternates deliberately rather than rolling dice:
                // the queue is the first thing anyone looks at, and a run of
                // luck that made every pending order a phone booking would
                // hide the whole customer-booking path — the tracking code,
                // the contact block, the "needed by" answer.
                const fromWebsite = isToday ? i % 2 === 0 : rand() < 0.35;

                let status;
                if (daysAgo > 1) status = rand() < 0.94 ? 'DELIVERED' : 'CANCELLED';
                else if (daysAgo === 1) status = rand() < 0.8 ? 'DELIVERED' : 'IN_TRANSIT';
                else status = pick(['PENDING', 'PENDING', 'ASSIGNED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED']);

                const placed = workingMoment(daysAgo, between(7, 16));
                const assigned = ['PENDING'].includes(status) ? null : driver.username;
                // A website order has no coordinates until a dispatcher
                // places it, so the newest ones legitimately have none.
                const placedOnMap = !fromWebsite || daysAgo > 0 || rand() < 0.4;

                const result = await client.query(
                    `INSERT INTO orders (
                        cargo_description, weight_kg, status, priority, source,
                        origin_hub_id, origin_hub_name,
                        pickup_lng, pickup_lat, delivery_lng, delivery_lat,
                        pickup_coordinates, delivery_coordinates, pickup_geom, delivery_geom,
                        pickup_address_text, delivery_address_text,
                        customer_name, customer_phone, customer_email,
                        recipient_name, recipient_phone,
                        special_instructions, needed_by, tracking_token,
                        assigned_to, created_at, updated_at
                     ) VALUES (
                        $1, $2, $3, $4, $5,
                        $6, $7,
                        $8, $9, $10, $11,
                        CASE WHEN $8::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($8, $9), 4326) END,
                        CASE WHEN $10::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($10, $11), 4326) END,
                        CASE WHEN $8::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($8, $9), 4326) END,
                        CASE WHEN $10::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($10, $11), 4326) END,
                        $12, $13,
                        $14, $15, $16,
                        $17, $18,
                        $19, $20, $21,
                        $22, $23, $24
                     ) RETURNING id`,
                    [
                        load.text, load.kg, status,
                        rand() < 0.12 ? 'high' : rand() < 0.9 ? 'normal' : 'low',
                        fromWebsite ? 'public' : 'dispatch',
                        hub?.id ?? null, hub?.name ?? null,
                        placedOnMap ? origin.lng : null, placedOnMap ? origin.lat : null,
                        placedOnMap ? dest.lng : null, placedOnMap ? dest.lat : null,
                        origin.name, dest.name,
                        fromWebsite ? customer.name : null,
                        fromWebsite ? customer.phone : null,
                        fromWebsite ? customer.email : null,
                        fromWebsite ? null : customer.name,
                        fromWebsite ? null : customer.phone,
                        pick(NOTES),
                        fromWebsite ? pick(['today', 'tomorrow', 'this_week', 'flexible', null]) : null,
                        fromWebsite ? trackingToken() : null,
                        assigned, placed, placed,
                    ]
                );
                const id = result.rows[0].id;
                orders.push({ id, status, driver: assigned, placed, daysAgo, dest, customer });

                // The trail every finished job leaves behind it.
                const lifecycle = ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'];
                const reached = lifecycle.indexOf(status);
                let previous = 'PENDING';
                for (let step = 0; step <= reached; step++) {
                    const at = new Date(placed.getTime() + (step + 1) * between(18, 55) * 60000);
                    await client.query(
                        `INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by, changed_at)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [id, previous, lifecycle[step], step === 0 ? 'peter' : assigned, at]
                    );
                    previous = lifecycle[step];
                }
                if (status === 'DELIVERED') {
                    await client.query(
                        `INSERT INTO delivery_confirmations (order_id, driver_name, photo_url, notes, confirmed_at, distance_from_target_m, location_flagged)
                         VALUES ($1, $2, $3, $4, $5, $6, false)`,
                        [id, assigned, `demo/pod/${id}.jpg`,
                         pick(['Received by the shop owner.', 'Left with the storekeeper.', 'Signed for at reception.', null]),
                         new Date(placed.getTime() + between(120, 300) * 60000), between(4, 60)]
                    );
                }
            }
        }
        console.log(`📦 ${orders.length} orders across 15 days, with their status history.`);

        // ── Multi-stop runs ──────────────────────────────────────────
        // One finished yesterday, one being driven now, one waiting to go
        // out — so the runs panel shows all three states at once.
        const runSpecs = [
            { daysAgo: 1, status: 'COMPLETED', driver: DRIVERS[1], stopStatus: 'DONE' },
            { daysAgo: 0, status: 'ACTIVE', driver: DRIVERS[0], stopStatus: 'MIXED' },
            { daysAgo: 0, status: 'PLANNED', driver: DRIVERS[3], stopStatus: 'PENDING' },
        ];
        let runCount = 0;
        // An order can only sit on one live run — trip_stops has a partial
        // unique index enforcing it, because two drivers turning up for the
        // same cargo is the bug it exists to prevent. The first draft of
        // this script handed the same three orders to both of today's runs
        // and was correctly rejected.
        const spokenFor = new Set();
        for (const spec of runSpecs) {
            // PENDING orders are deliberately left off. Planning a run
            // assigns its orders, so a PENDING order sitting on a live run
            // is a state the real endpoint cannot produce — and the first
            // version of this script produced exactly that, which left the
            // multi-stop panel offering the only two plannable orders on
            // the board while the server rejected both as already spoken
            // for. What stays PENDING is the queue there is still work to
            // do with.
            const chosen = orders
                .filter((o) => o.daysAgo === spec.daysAgo && o.dest
                    && o.status !== 'PENDING' && !spokenFor.has(o.id))
                .slice(0, 3);
            if (chosen.length < 2) continue;
            chosen.forEach((o) => spokenFor.add(o.id));

            const started = workingMoment(spec.daysAgo, 8, 15);
            const trip = await client.query(
                `INSERT INTO trips (driver_username, status, planned_distance_m, created_by, created_at, started_at, completed_at, updated_at)
                 VALUES ($1, $2, $3, 'peter', $4, $5, $6, $4) RETURNING id`,
                [spec.driver.username, spec.status, between(14000, 32000), started,
                 spec.status === 'PLANNED' ? null : started,
                 spec.status === 'COMPLETED' ? new Date(started.getTime() + 4.5 * 3600000) : null]
            );
            const tripId = trip.rows[0].id;

            let sequence = 1;
            for (const [index, order] of chosen.entries()) {
                const row = (await client.query('SELECT pickup_lat, pickup_lng, delivery_lat, delivery_lng, pickup_address_text, delivery_address_text FROM orders WHERE id = $1', [order.id])).rows[0];
                for (const kind of ['PICKUP', 'DROP']) {
                    const isPickup = kind === 'PICKUP';
                    let stopStatus = spec.stopStatus;
                    if (spec.stopStatus === 'MIXED') {
                        // Halfway through the morning: the first collection
                        // and drop are done, the rest still ahead.
                        stopStatus = index === 0 ? 'DONE' : index === 1 && isPickup ? 'DONE' : 'PENDING';
                    }
                    await client.query(
                        `INSERT INTO trip_stops (trip_id, order_id, kind, sequence, lat, lng, address_text, status, arrived_at, completed_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
                        [tripId, order.id, kind, sequence++,
                         isPickup ? row.pickup_lat : row.delivery_lat,
                         isPickup ? row.pickup_lng : row.delivery_lng,
                         isPickup ? row.pickup_address_text : row.delivery_address_text,
                         stopStatus,
                         stopStatus === 'DONE' ? new Date(started.getTime() + sequence * 40 * 60000) : null]
                    );
                }
            }
            runCount++;
        }
        console.log(`🚚 ${runCount} multi-stop runs — one finished, one running, one waiting.`);

        // ── Today's shift ────────────────────────────────────────────
        for (const driver of DRIVERS.slice(0, 4)) {
            await client.query(
                `INSERT INTO driver_safety_checklists (driver_username, checklist_date, items, updated_at)
                 VALUES ($1, CURRENT_DATE, $2, $3)
                 ON CONFLICT (driver_username, checklist_date) DO NOTHING`,
                [driver.username,
                 JSON.stringify({ seatbelt: true, mirrorsLights: true, tyres: true, cargo: rand() < 0.8, fatigue: true }),
                 workingMoment(0, 7, between(5, 40))]
            );
        }

        // Incidents that read like things that happen, not like test rows.
        //
        // event_type must be MANUAL_INCIDENT and the description must be
        // "title\n\nbody" — that is exactly what the driver app writes and
        // exactly what the dispatcher's feed queries for. The first version
        // of this invented its own taxonomy (BREAKDOWN, DELAY, CARGO_ISSUE)
        // and the rows landed in the table completely invisible to the app.
        //
        // Resolved reports leave the live feed 30 minutes after resolution,
        // so the two older ones below are deliberately history: they exist
        // for the record without cluttering today's board.
        const incidents = [
            { driver: DRIVERS[2], severity: 'high', status: 'RESOLVED', daysAgo: 3,
              title: 'Flat tyre on the Kicukiro road',
              body: 'Rear left tyre blew out just past the junction. Pulled over safely and changed to the spare. Lost about an hour, delivery still went out the same day.' },
            { driver: DRIVERS[1], severity: 'medium', status: 'RESOLVED', daysAgo: 6,
              title: 'Two cement bags split while loading',
              body: 'Bags tore at Gikondo during loading. Left them behind and delivered 78 of 80. The customer was told before the truck left.' },
            { driver: DRIVERS[4], severity: 'medium', status: 'OPEN', daysAgo: 0,
              title: 'Road closed at Gatsata',
              body: 'Works on the main road, police turning vehicles back. Going round through Gisozi — I will be roughly 40 minutes late to the drop.' },
        ];
        for (const incident of incidents) {
            const at = workingMoment(incident.daysAgo, between(9, 15));
            const place = PLACES[pick(DELIVERY_POINTS)];
            await client.query(
                `INSERT INTO geofence_alerts (driver_name, event_type, distance_meters, description, severity, status, created_at, resolved_by, resolved_at, lat, lng)
                 VALUES ($1, 'MANUAL_INCIDENT', 0, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [incident.driver.username, `${incident.title}\n\n${incident.body}`,
                 incident.severity, incident.status, at,
                 incident.status === 'RESOLVED' ? 'peter' : null,
                 incident.status === 'RESOLVED' ? new Date(at.getTime() + 90 * 60000) : null,
                 place.lat, place.lng]
            );
        }

        // Enquiries off the website's contact form.
        const enquiries = [
            { name: 'Solange Mukandayisenga', phone: '+250788221004', email: 'solange@kigalitiles.rw',
              text: 'Do you handle tiles and sanitary ware from Gikondo to Musanze? We move about 3 tonnes a week.' },
            { name: 'Patrick Rwigema', phone: '+250788332115', email: null,
              text: 'What would you charge for a weekly run from Nyabugogo to Kabuga? Small loads, about 400kg.' },
            { name: 'Aline Umutoni', phone: '+250788443226', email: 'aline@boutiquealine.rw',
              text: 'Is same-day delivery possible within Kigali if I book before 10am?' },
        ];
        for (const [index, enquiry] of enquiries.entries()) {
            await client.query(
                `INSERT INTO contact_messages (name, phone, email, message, created_at, handled_at)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [enquiry.name, enquiry.phone, enquiry.email, enquiry.text,
                 workingMoment(index + 1, between(8, 17)), index === 0 ? workingMoment(index, 9) : null]
            );
        }
        console.log('🛠  Safety checks, incidents and website enquiries.');

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function main() {
    await guardAgainstProduction();
    if (process.argv.includes('--clear')) {
        const client = await pool.connect();
        try {
            await clearDemoData(client);
        } finally {
            client.release();
        }
    } else {
        await seed();
        console.log(`\n✅ Demo data seeded. Every driver's PIN is ${DEMO_PIN}.`);
    }
    await pool.end();
}

main().catch((error) => {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
});
