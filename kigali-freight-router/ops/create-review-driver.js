// Creates the one driver account Apple's and Google's reviewers sign in as.
//
// Sign-in is phone -> SMS code -> PIN, so a reviewer on another continent
// cannot get past the second screen. driverAuthController.js solves the code
// half by giving one configured number a fixed code instead of a text; this
// script creates the account that number belongs to, because a reviewer who
// signs in successfully and lands on an empty screen fails review just as
// surely as one who cannot sign in at all — the rejection is simply worded
// "app is incomplete" instead.
//
// Unlike seed-demo-data.js this is SAFE TO RUN ON PRODUCTION, and is meant
// to be. It never truncates, never deletes anything it did not create, and
// is idempotent: run it twice and you get the same one account, not two.
//
//   node ops/create-review-driver.js
//   node ops/create-review-driver.js --remove     # after review passes
//
// Configure via environment (defaults shown in REVIEW below):
//   REVIEW_DRIVER_PHONE, REVIEW_DRIVER_PIN, REVIEW_DRIVER_NAME
//
// The rows it creates are labelled visibly so the dispatch team can tell at
// a glance that they are not real work. On production they WILL appear on
// the real board — that is unavoidable, since the reviewer has to see a
// populated app — so they say what they are, and --remove takes them away
// again once the listing is live.
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import pool from '../config/db.js';
import { DRIVER_DOCUMENT_TYPES, VEHICLE_DOCUMENT_TYPES } from '../services/driverVerificationService.js';

const REVIEW = {
    phone: process.env.REVIEW_DRIVER_PHONE || '+250780000000',
    // Four digits, not six: the app's PIN is 4-digit (driverAuthController
    // rejects anything else), while the OTP is 6. Easy to conflate, and the
    // failure is a reviewer typing a PIN that cannot be right.
    pin: process.env.REVIEW_DRIVER_PIN || '4819',
    name: process.env.REVIEW_DRIVER_NAME || 'App Review Driver',
    plate: 'RAR 001 R',
    vehicleType: 'Medium Truck',
};

// Marks everything this script owns, so --remove can find it again and a
// dispatcher reading the board can tell instantly what it is looking at.
const TAG = '[App Store review]';

// Two real Kigali points, so the map draws something recognisable rather
// than a pin in the sea. Nyabugogo depot out to Kimironko market.
const PICKUP = { lng: 30.0419, lat: -1.9395, text: 'Nyabugogo Transport Hub, Kigali' };
const DROP = { lng: 30.1287, lat: -1.9542, text: 'Kimironko Market, Kigali' };

const JOBS = [
    { cargo: `${TAG} 40 sacks of maize flour`, kg: 2000, status: 'ASSIGNED' },
    { cargo: `${TAG} 12 cartons of bottled water`, kg: 240, status: 'PICKED_UP' },
];

async function remove(client) {
    // Only ever the review account's own rows. Orders go first: they
    // reference the driver by username, and trip_stops reference the orders.
    const orders = await client.query(
        `SELECT id FROM orders WHERE assigned_to = $1 AND cargo_description LIKE $2`,
        [REVIEW.phone, `${TAG}%`]
    );
    const ids = orders.rows.map((r) => r.id);
    if (ids.length) {
        await client.query('DELETE FROM trip_stops WHERE order_id = ANY($1::int[])', [ids]);
        await client.query('DELETE FROM order_status_logs WHERE order_id = ANY($1::int[])', [ids]);
        await client.query('DELETE FROM orders WHERE id = ANY($1::int[])', [ids]);
    }
    await client.query('DELETE FROM trips WHERE driver_username = $1', [REVIEW.phone]);
    await client.query(
        `DELETE FROM vehicle_documents WHERE vehicle_id IN
            (SELECT fv.id FROM fleet_vehicles fv JOIN users u ON u.id = fv.current_driver_id WHERE u.username = $1)`,
        [REVIEW.phone]
    );
    await client.query(
        `DELETE FROM fleet_vehicles WHERE current_driver_id = (SELECT id FROM users WHERE username = $1)`,
        [REVIEW.phone]
    );
    await client.query('DELETE FROM driver_documents WHERE username = $1', [REVIEW.phone]);
    await client.query('DELETE FROM driver_safety_checklists WHERE driver_username = $1', [REVIEW.phone]);
    await client.query('DELETE FROM users WHERE username = $1', [REVIEW.phone]);
    console.log(`🧹 Removed the review account and its ${ids.length} sample consignment(s).`);
}

async function create(client) {
    // Checked here rather than discovered by a reviewer: a PIN this script
    // accepts but the login endpoint rejects would produce an account that
    // exists, looks correct in the database, and cannot be signed into.
    if (!/^\d{4}$/.test(REVIEW.pin)) {
        throw new Error(`REVIEW_DRIVER_PIN must be exactly 4 digits (got "${REVIEW.pin}").`);
    }
    const pinHash = await bcrypt.hash(REVIEW.pin, 10);

    // pin_set_at and onboarding_completed_at are both set so the app takes
    // the returning-driver path straight to the PIN screen, rather than
    // walking a reviewer through first-run setup they have no context for.
    await client.query(
        `INSERT INTO users (username, full_name, role, status, phone_number, pin_hash, pin_set_at, onboarding_completed_at, created_at)
         VALUES ($1, $2, 'driver', 'approved', $1, $3, NOW(), NOW(), NOW())
         ON CONFLICT (username) DO UPDATE
            SET full_name = EXCLUDED.full_name,
                status = 'approved',
                pin_hash = EXCLUDED.pin_hash,
                pin_set_at = NOW()`,
        [REVIEW.phone, REVIEW.name, pinHash]
    );
    const driverId = (await client.query('SELECT id FROM users WHERE username = $1', [REVIEW.phone])).rows[0].id;

    // A driver with no vehicle cannot be assigned work, and one with
    // unapproved papers opens the app onto a compliance wall instead of the
    // job list — both look like a broken app to someone who does not know
    // the domain.
    // Looked up rather than upserted: fleet_vehicles has no unique index on
    // plate_number (only the primary key), so ON CONFLICT (plate_number)
    // would throw. Adding a constraint to the real fleet table just to let
    // this script use a shorter query would be the wrong way round.
    const found = await client.query('SELECT id FROM fleet_vehicles WHERE plate_number = $1 LIMIT 1', [REVIEW.plate]);
    let vehicleId;
    if (found.rows.length) {
        vehicleId = found.rows[0].id;
        await client.query(
            `UPDATE fleet_vehicles SET current_driver_id = $2, status = 'ACTIVE' WHERE id = $1`,
            [vehicleId, driverId]
        );
    } else {
        vehicleId = (await client.query(
            `INSERT INTO fleet_vehicles (plate_number, vehicle_type, current_driver_id, status, max_weight_kg, max_range_km, created_at)
             VALUES ($1, $2, $3, 'ACTIVE', 5000, 400, NOW()) RETURNING id`,
            [REVIEW.plate, REVIEW.vehicleType, driverId]
        )).rows[0].id;
    }

    for (const doc of DRIVER_DOCUMENT_TYPES) {
        await client.query(
            `INSERT INTO driver_documents (username, document_type, file_url, status, uploaded_at, reviewed_by, reviewed_at)
             VALUES ($1, $2, $3, 'approved', NOW(), 'system', NOW())
             ON CONFLICT (username, document_type) DO UPDATE SET status = 'approved', reviewed_at = NOW()`,
            [REVIEW.phone, doc, `review/${doc}.jpg`]
        );
    }
    for (const doc of VEHICLE_DOCUMENT_TYPES) {
        await client.query(
            `INSERT INTO vehicle_documents (vehicle_id, document_type, file_url, status, uploaded_at, uploaded_by, reviewed_by, reviewed_at)
             VALUES ($1, $2, $3, 'approved', NOW(), $4, 'system', NOW())
             ON CONFLICT (vehicle_id, document_type) DO UPDATE SET status = 'approved', reviewed_at = NOW()`,
            [vehicleId, doc, `review/${doc}.jpg`, REVIEW.phone]
        );
    }

    // Re-created each run rather than upserted, so repeated runs cannot
    // silt the board up with duplicates.
    const existing = await client.query(
        `SELECT id FROM orders WHERE assigned_to = $1 AND cargo_description LIKE $2`,
        [REVIEW.phone, `${TAG}%`]
    );
    if (existing.rows.length) {
        const ids = existing.rows.map((r) => r.id);
        await client.query('DELETE FROM trip_stops WHERE order_id = ANY($1::int[])', [ids]);
        await client.query('DELETE FROM order_status_logs WHERE order_id = ANY($1::int[])', [ids]);
        await client.query('DELETE FROM orders WHERE id = ANY($1::int[])', [ids]);
    }

    const hub = (await client.query(`SELECT id, name FROM hubs ORDER BY id LIMIT 1`)).rows[0] || null;
    for (const job of JOBS) {
        await client.query(
            `INSERT INTO orders (
                cargo_description, weight_kg, status, priority, source,
                origin_hub_id, origin_hub_name,
                pickup_lng, pickup_lat, delivery_lng, delivery_lat,
                pickup_geom, delivery_geom,
                pickup_address_text, delivery_address_text,
                customer_name, customer_phone,
                recipient_name, recipient_phone,
                special_instructions, tracking_token,
                assigned_to, created_at, updated_at
             ) VALUES (
                $1, $2, $3, 'normal', 'dispatch',
                $4, $5,
                $6, $7, $8, $9,
                ST_SetSRID(ST_MakePoint($6, $7), 4326),
                ST_SetSRID(ST_MakePoint($8, $9), 4326),
                $10, $11,
                $12, $13,
                $14, $15,
                $16, $17,
                $18, NOW(), NOW()
             )`,
            [
                job.cargo, job.kg, job.status,
                hub?.id ?? null, hub?.name ?? 'Nyabugogo Hub',
                PICKUP.lng, PICKUP.lat, DROP.lng, DROP.lat,
                PICKUP.text, DROP.text,
                'App Store Review', '+250780000001',
                'Review Recipient', '+250780000002',
                'Sample consignment for app store review. Not a real delivery.',
                crypto.randomBytes(4).toString('hex').toUpperCase(),
                REVIEW.phone,
            ]
        );
    }

    console.log('\n✅ Review driver ready.\n');
    console.log('   Put these in the App Store Connect review notes:');
    console.log(`     Phone number : ${REVIEW.phone}`);
    console.log(`     PIN          : ${REVIEW.pin}`);
    console.log('\n   And set these on the server so the code is not texted:');
    console.log(`     APP_REVIEW_DEMO_PHONE=${REVIEW.phone}`);
    console.log('     APP_REVIEW_DEMO_OTP=<the six digits you tell the reviewer>');
    console.log(`\n   ${JOBS.length} sample consignments created, each tagged "${TAG}".`);
    console.log('   Run with --remove once the listing is live.\n');
}

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        if (process.argv.includes('--remove')) {
            await remove(client);
        } else {
            await create(client);
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((error) => {
    console.error('❌ Failed:', error.message);
    process.exit(1);
});
