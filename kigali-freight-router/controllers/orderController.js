// Order lifecycle routes are now backed by the full freight schema.
// The migration bundle creates the missing geometry, assignment, and audit
// tables that these controllers query.
import pool from '../config/db.js';
import { io } from '../server.js';
import { ok, fail } from '../utils/httpResponse.js';
import { sendPushToUser } from '../services/pushNotificationService.js';
import { uploadDeliveryPhoto, toSignedUrl } from '../config/r2Client.js';
import { isDriverVerified } from '../services/driverVerificationService.js';
import { appendAuditLog } from '../services/auditLogService.js';
import * as Sentry from '@sentry/node';
import { logError } from '../utils/logger.js';
import { notifyCustomerOfStatus } from '../services/customerNotificationService.js';
import { isValidLat, isValidLng, isValidWeightKg } from '../utils/validators.js';
import { priceJob, distanceKmBetween, detentionForOrder, backfillCreditForOrder, returnLoadCandidatesFor } from '../services/pricingRepository.js';
import { issueDeliveryCode, sendDeliveryCode, verifyDeliveryCode, DELIVERY_CODE_MAX_ATTEMPTS } from '../services/deliveryCodeService.js';
import { PricingError } from '../services/pricingService.js';

const ALLOWED_ORDER_STATUSES = ['PENDING', 'OFFERED', 'ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'CANCELLED'];
// A dispatcher works a backlog in sittings, not in one gesture; this is
// well above any real selection and still bounds the request.
const MAX_BATCH_PLACEMENTS = 100;
const ALLOWED_ORDER_PRIORITIES = ['high', 'normal', 'low'];

// Matches the staleness threshold fleetController.js already uses to mark
// a driver's signal STALE vs LIVE — a fix older than this is treated as no
// fix at all here, rather than showing a progress bar frozen on a position
// from several minutes ago.
const TELEMETRY_STALE_SECONDS = 60;
// A flat assumed speed for Kigali urban freight — this is a straight-line
// (great-circle) distance estimate, not a routed-road duration, so the ETA
// it produces is deliberately presented to the driver as an approximation
// ("~12 min"), never a promised arrival time.
const AVG_SPEED_KMH = 25;

function computeRouteProgress({ driver_lat, telemetry_age_seconds, distance_remaining_meters, total_distance_meters }) {
    const hasFreshFix = driver_lat != null && Number(telemetry_age_seconds) <= TELEMETRY_STALE_SECONDS;
    if (!hasFreshFix || !(Number(total_distance_meters) > 0)) {
        return { progressPercent: null, distanceRemainingKm: null, etaMinutes: null };
    }
    const distanceRemainingKm = Number(distance_remaining_meters) / 1000;
    const totalDistanceKm = Number(total_distance_meters) / 1000;
    const progressPercent = Math.max(0, Math.min(100, Math.round(100 - (distanceRemainingKm / totalDistanceKm) * 100)));
    const etaMinutes = Math.max(0, Math.round((distanceRemainingKm / AVG_SPEED_KMH) * 60));
    return {
        progressPercent,
        distanceRemainingKm: Math.round(distanceRemainingKm * 10) / 10,
        etaMinutes,
    };
}

// Drivers can move a job forward or confirm delivery, but cancelling an
// order is a dispatch decision — a driver who can't complete a job reports
// it through the incident-report flow instead, and a dispatcher/admin
// decides from there whether to cancel or reassign it.
const DRIVER_ALLOWED_STATUSES = ['AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'];

// The two statuses that start a detention clock, and so the two that are now
// worth money. Only the person standing at the gate knows they are standing at
// it, and since detention began being charged, anyone else setting these is
// either inflating a customer's bill or shorting a driver's pay. Restricted to
// drivers for that reason rather than any general principle about status.
//
// Nothing loses a capability it was using: the dispatch board only ever
// displays these, and trip stops move through their own endpoint.
const ARRIVAL_STATUSES = ['AT_PICKUP', 'ARRIVED'];

// Soft-flag threshold: a delivery confirmed more than this far from the
// order's recorded delivery point gets flagged for dispatcher review, but
// is still accepted — a stale/missing GPS fix or an imprecise drop pin
// shouldn't block a driver from closing out a real delivery.
const DELIVERY_LOCATION_FLAG_METERS = 500;

// A refusal that names itself, so placing many orders can report which one
// failed and why without each failure being an HTTP response.
class PlacementError extends Error {
    constructor(code, status, message) {
        super(message);
        this.name = 'PlacementError';
        this.code = code;
        this.status = status;
    }
}

/**
 * Everything that placing one order does, minus the HTTP.
 *
 * Both the single-order endpoint and the batch run through here. The subtle
 * part is the repricing below -- a real price replaces the estimate while
 * quoted_total is deliberately left alone -- and a second copy of that rule
 * would drift from this one the first time either was touched.
 *
 * Throws PlacementError for anything the caller did wrong. Anything else is a
 * real fault and is left to propagate.
 */
async function placeOneOrder({ id, pickupLat, pickupLng, deliveryLat, deliveryLng, originHubId, req }) {
    for (const [label, lat, lng] of [
        ['Pickup', pickupLat, pickupLng],
        ['Delivery', deliveryLat, deliveryLng],
    ]) {
        if (!isValidLat(lat) || !isValidLng(lng)) {
            throw new PlacementError('ORDERS_PLACE_INVALID_COORDS', 400,
                `${label} coordinates are missing or out of range.`);
        }
    }

    // Optional: a dispatcher may tie the pickup to a real hub, which is what
    // keeps origin_hub_id's foreign key (and the "can't delete a hub in use"
    // protection behind it) meaningful.
    let hub = null;
    if (originHubId !== undefined && originHubId !== null && originHubId !== '') {
        const hubResult = await pool.query(`SELECT id, name FROM hubs WHERE id = $1;`, [originHubId]);
        if (hubResult.rows.length === 0) {
            throw new PlacementError('ORDERS_HUB_NOT_FOUND', 400, 'That pickup hub no longer exists.');
        }
        hub = hubResult.rows[0];
    }

    const result = await pool.query(
        `UPDATE orders SET
            pickup_lat = $2, pickup_lng = $3,
            delivery_lat = $4, delivery_lng = $5,
            pickup_coordinates  = ST_SetSRID(ST_MakePoint($3, $2), 4326),
            delivery_coordinates = ST_SetSRID(ST_MakePoint($5, $4), 4326),
            pickup_geom          = ST_SetSRID(ST_MakePoint($3, $2), 4326),
            delivery_geom        = ST_SetSRID(ST_MakePoint($5, $4), 4326),
            origin_hub_id   = COALESCE($6, origin_hub_id),
            origin_hub_name = COALESCE($7, origin_hub_name),
            updated_at = NOW()
         WHERE id = $1
         RETURNING id, pickup_lat, pickup_lng, delivery_lat, delivery_lng, origin_hub_name,
                   weight_kg, quoted_total;`,
        [id, pickupLat, pickupLng, deliveryLat, deliveryLng, hub?.id ?? null, hub?.name ?? null]
    );

    if (result.rows.length === 0) {
        throw new PlacementError('ORDERS_NOT_FOUND', 404, 'That order no longer exists.');
    }

    // This is the moment an estimate becomes a price. Until now the order had
    // only two free-text addresses, so it was priced on class and weight
    // alone; pinning it to the map is the first time a real distance exists.
    // quoted_total is deliberately left alone -- a customer who was shown one
    // number and is charged another is owed the original, and overwriting it
    // would erase the only record of what they agreed to.
    try {
        const pickup = { lat: pickupLat, lng: pickupLng };
        const dropoff = { lat: deliveryLat, lng: deliveryLng };
        const distanceKm = await distanceKmBetween(pickup, dropoff);
        const repriced = await priceJob({
            weightKg: result.rows[0].weight_kg,
            distanceKm,
            pickup,
            delivery: dropoff,
        });

        await pool.query(
            `UPDATE orders SET
                pricing_rate_id = $2, priced_vehicle_class = $3,
                price_total = $4, price_fuel = $5, price_service = $6,
                platform_fee = $7, driver_net = $8,
                price_distance_km = $9, price_is_estimate = FALSE,
                return_leg_amount = $10,
                updated_at = NOW()
              WHERE id = $1`,
            [id, repriced.pricingRateId, repriced.vehicleClass, repriced.totalAmount,
             repriced.fuelAmount, repriced.serviceAmount, repriced.platformFee,
             repriced.driverNet, repriced.distanceKm, repriced.returnLegAmount]
        );
    } catch (err) {
        // Placing the order on the map is the operation the dispatcher asked
        // for and it has already succeeded. A pricing failure must not undo
        // that -- the order stays placed, keeps its estimate, and is reported
        // so it can be repriced.
        logError(req, `Repricing order #${id} after placement failed`, err);
        if (!(err instanceof PricingError)) Sentry.captureException(err, { tags: { orderId: String(id) } });
    }

    await appendAuditLog({
        actionType: 'ORDER_PLACED_ON_MAP',
        description: `Order #${id} pinned to ${pickupLat.toFixed(5)},${pickupLng.toFixed(5)} -> ${deliveryLat.toFixed(5)},${deliveryLng.toFixed(5)}`,
        username: req.user?.username || 'System',
    });

    return result.rows[0];
}

export const OrderController = {
    // Driver view of assigned jobs
    getDriverAssignments: async (req, res) => {
        try {
            const username = req.user?.username;
            if (!username) {
                return fail(res, {
                    status: 400,
                    code: 'DRIVER_USERNAME_MISSING',
                    message: 'Driver identity is missing in session token.',
                });
            }

            const query = `
                SELECT
                    id,
                    cargo_description,
                    status,
                    origin_hub_name,
                    delivery_lng,
                    delivery_lat,
                    recipient_name,
                    recipient_phone,
                    priority,
                    updated_at,
                    -- A customer-placed order has no hub and no coordinates
                    -- until a dispatcher places it, so without these the
                    -- driver received a job with no pickup, no destination
                    -- and nobody to call — assignable but undeliverable.
                    -- The customer is also the contact here: recipient_name
                    -- is only filled in when a dispatcher typed one.
                    source,
                    pickup_address_text,
                    delivery_address_text,
                    special_instructions,
                    customer_name,
                    customer_phone,
                    -- What this job pays, and nothing else about the money.
                    -- A driver is shown their own net, never the total the
                    -- customer pays or the platform's cut: the figure they
                    -- need in order to decide is what lands with them, and
                    -- the rest is the commercial arrangement between the
                    -- platform and its customer. This becomes the number an
                    -- independent driver accepts or declines a job on, so it
                    -- has to be the honest one -- it is already net of the
                    -- platform fee and already includes the fuel the run
                    -- will burn.
                    driver_net,
                    price_is_estimate,
                    -- Already folded into driver_net; shown separately so
                    -- a driver can see the wait was paid for rather than
                    -- wondering why the figure moved after they closed the job.
                    detention_amount
                FROM orders
                WHERE LOWER(COALESCE(assigned_to, '')) = LOWER($1)
                  AND UPPER(COALESCE(status, 'PENDING')) NOT IN ('DELIVERED', 'CANCELLED')
                ORDER BY updated_at DESC NULLS LAST, id DESC;
            `;

            const result = await pool.query(query, [username]);
            return ok(res, result.rows);
        } catch (error) {
            logError(req, 'Database error', error);
            return fail(res, {
                status: 500,
                code: 'DRIVER_ASSIGNMENTS_FETCH_FAILED',
                message: 'Failed to read assigned driver jobs.',
            });
        }
    },

    // GET /api/orders/driver/completed - a driver's own delivery history,
    // most recent first. An order can in principle have more than one
    // delivery_confirmations row (a genuine redelivery), so this takes the
    // latest one per order via LATERAL rather than joining naively, which
    // would otherwise duplicate rows.
    getMyCompletedDeliveries: async (req, res) => {
        try {
            const username = req.user?.username;
            if (!username) {
                return fail(res, {
                    status: 400,
                    code: 'DRIVER_USERNAME_MISSING',
                    message: 'Driver identity is missing in session token.',
                });
            }

            const query = `
                SELECT
                    o.id,
                    o.cargo_description,
                    o.weight_kg,
                    o.origin_hub_name,
                    latest.photo_url,
                    latest.confirmed_at
                FROM orders o
                LEFT JOIN LATERAL (
                    SELECT photo_url, confirmed_at
                    FROM delivery_confirmations dc
                    WHERE dc.order_id = o.id
                    ORDER BY dc.confirmed_at DESC
                    LIMIT 1
                ) latest ON true
                WHERE LOWER(COALESCE(o.assigned_to, '')) = LOWER($1)
                  AND o.status = 'DELIVERED'
                ORDER BY COALESCE(latest.confirmed_at, o.updated_at) DESC
                LIMIT 50;
            `;

            const result = await pool.query(query, [username]);
            // photo_url stores the object's storage KEY, not a public URL
            // (the bucket is private) — sign a short-lived download link
            // per row at response time instead.
            const rows = await Promise.all(result.rows.map(async (row) => ({
                ...row,
                photo_url: await toSignedUrl(row.photo_url),
            })));
            return ok(res, rows);
        } catch (error) {
            logError(req, 'Database error', error);
            return fail(res, {
                status: 500,
                code: 'DRIVER_COMPLETED_FETCH_FAILED',
                message: 'Failed to read completed deliveries.',
            });
        }
    },

    // 1. GET /api/v1/orders/active - Fetch pending orders
    getActiveOrders: async (req, res) => {
        try {
            const query = `
                SELECT
                    id,
                    cargo_description,
                    status,
                    weight_kg,
                    origin_hub_name,
                    pickup_lng,
                    pickup_lat,
                    delivery_lng,
                    delivery_lat,
                    priority,
                    -- Customer-submitted orders arrive through /api/public
                    -- with no coordinates (nobody picked points on a map)
                    -- and no hub. Without these columns the dispatch queue
                    -- shows such a row as bare cargo and weight, giving the
                    -- dispatcher no address to place and no number to call,
                    -- which makes it impossible to action.
                    source,
                    tracking_token,
                    customer_name,
                    customer_phone,
                    pickup_address_text,
                    delivery_address_text,
                    special_instructions,
                    -- What the customer said about timing. Informs the
                    -- dispatcher's priority call; deliberately does not set
                    -- it (see add_order_needed_by.sql).
                    needed_by,
                    -- The full breakdown, unlike the public tracking view
                    -- which gets the total alone. Dispatch is the side of the
                    -- business that has to know whether a job is worth
                    -- running: price_is_estimate says whether this row still
                    -- needs placing on the map before the price is real, and
                    -- platform_fee is the only place the operator can see
                    -- what the work actually earns them.
                    priced_vehicle_class,
                    price_total,
                    price_is_estimate,
                    platform_fee,
                    driver_net,
                    price_distance_km,
                    detention_minutes,
                    detention_amount,
                    backfill_credit,
                    backfilled_by_order_id,

                    -- A control tower's queue is a list of deviations, not a
                    -- diary. Sorted chronologically, the load that needs
                    -- somebody sits wherever it happens to fall.
                    --
                    -- 0  unplaced: a public booking with no coordinates. It
                    --    cannot be assigned, routed or priced firm -- it is
                    --    not merely urgent, it is stuck, and nothing else in
                    --    the queue can move until a dispatcher pins it.
                    -- 1  overdue against what the customer was promised.
                    -- 2  marked high priority.
                    -- 3  everything else.
                    CASE
                        WHEN pickup_lat IS NULL OR delivery_lat IS NULL THEN 0
                        WHEN (
                            -- needed_by is a promise, not a date: 'today',
                            -- 'tomorrow', 'this_week' or 'flexible'. Overdue
                            -- therefore has to be derived from when the order
                            -- was taken plus the window that was promised.
                            (needed_by = 'today'     AND created_at::date < CURRENT_DATE)
                         OR (needed_by = 'tomorrow'  AND created_at::date < CURRENT_DATE - 1)
                         OR (needed_by = 'this_week' AND created_at < NOW() - INTERVAL '7 days')
                        ) THEN 1
                        WHEN priority = 'high' THEN 2
                        ELSE 3
                    END AS urgency_rank,

                    -- Exposed separately so a row can be badged as late
                    -- without the UI re-deriving the rule, and so a high
                    -- priority order that is also late still reads as late.
                    (
                            (needed_by = 'today'     AND created_at::date < CURRENT_DATE)
                         OR (needed_by = 'tomorrow'  AND created_at::date < CURRENT_DATE - 1)
                         OR (needed_by = 'this_week' AND created_at < NOW() - INTERVAL '7 days')
                    ) AS is_overdue,

                    (pickup_lat IS NULL OR delivery_lat IS NULL) AS needs_placing
                FROM orders
                WHERE status = 'PENDING'
                -- Sorted here rather than client-side so the first screenful
                -- is the right screenful before a single row is rendered.
                ORDER BY urgency_rank ASC,
                         CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
                         created_at ASC;
            `;
            const result = await pool.query(query);
            return ok(res, result.rows);
        } catch (error) {
            logError(req, 'Database error', error);
            return fail(res, {
                status: 500,
                code: 'ORDERS_ACTIVE_FETCH_FAILED',
                message: 'Failed to read freight records.',
            });
        }
    },

    // 2. POST /api/v1/orders - Insert order and calculate native spatial geometry
    createOrder: async (req, res) => {
        try {
            const {
                cargo_description, weight_kg, origin_hub_id,
                delivery_lng, delivery_lat,
                recipient_name, recipient_phone, priority
            } = req.body;

            if (!origin_hub_id) {
                return fail(res, {
                    status: 400,
                    code: 'ORDERS_HUB_REQUIRED',
                    message: 'A pickup hub is required.',
                });
            }
            const normalizedPriority = priority ? String(priority).toLowerCase() : 'normal';
            if (!ALLOWED_ORDER_PRIORITIES.includes(normalizedPriority)) {
                return fail(res, {
                    status: 400,
                    code: 'ORDERS_INVALID_PRIORITY',
                    message: `Priority must be one of: ${ALLOWED_ORDER_PRIORITIES.join(', ')}.`,
                });
            }
            if (!isValidWeightKg(weight_kg)) {
                return fail(res, {
                    status: 400,
                    code: 'ORDERS_INVALID_WEIGHT',
                    message: 'Weight must be a positive number of kilograms.',
                });
            }
            if (!isValidLat(delivery_lat) || !isValidLng(delivery_lng)) {
                return fail(res, {
                    status: 400,
                    code: 'ORDERS_INVALID_DELIVERY_COORDINATES',
                    message: 'Delivery latitude must be between -90 and 90, and longitude between -180 and 180.',
                });
            }

            // Pickup coordinates and the denormalized hub name are derived
            // server-side from the hub record itself, not trusted from the
            // client — previously the client sent origin_hub_name/pickup_lat
            // /pickup_lng as free values with nothing tying them to a real
            // hub, so orders.origin_hub_id (a real FK to hubs) sat unused
            // and always NULL, silently defeating the "can't delete a hub
            // that's in use" protection that FK is there to provide.
            const hubResult = await pool.query(
                `SELECT id, name, ST_Y(coordinates) AS lat, ST_X(coordinates) AS lng FROM hubs WHERE id = $1;`,
                [origin_hub_id]
            );
            if (hubResult.rows.length === 0) {
                return fail(res, { status: 400, code: 'ORDERS_HUB_NOT_FOUND', message: 'Selected pickup hub no longer exists.' });
            }
            const hub = hubResult.rows[0];

            // A dispatcher-created order has both ends already: pickup from
            // the hub record above, delivery from the request. So unlike a
            // public booking this is priced firm on a real distance from the
            // start, and never carries an estimate.
            let priced;
            try {
                const pickup = { lat: hub.lat, lng: hub.lng };
                const dropoff = { lat: delivery_lat, lng: delivery_lng };
                const distanceKm = await distanceKmBetween(pickup, dropoff);
                // The points as well as the distance: which way the route runs
                // decides whether it climbs, and an eastbound run onto the
                // Akagera plain must not be charged for mountains.
                priced = await priceJob({ weightKg: weight_kg, distanceKm, pickup, delivery: dropoff });
            } catch (err) {
                if (err instanceof PricingError) {
                    return fail(res, { status: 400, code: 'PRICING_INVALID_INPUT', message: err.message });
                }
                throw err;
            }

            const query = `
                INSERT INTO orders (
                    cargo_description,
                    weight_kg,
                    origin_hub_id,
                    origin_hub_name,
                    pickup_lng,
                    pickup_lat,
                    delivery_lng,
                    delivery_lat,
                    recipient_name,
                    recipient_phone,
                    priority,
                    pickup_coordinates,
                    delivery_coordinates,
                    pickup_geom,
                    delivery_geom,
                    pricing_rate_id,
                    priced_vehicle_class,
                    quoted_total,
                    price_total,
                    price_fuel,
                    price_service,
                    platform_fee,
                    driver_net,
                    price_distance_km,
                    price_is_estimate,
                    return_leg_amount,
                    currency
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    $9,
                    $10,
                    $11,
                    ST_SetSRID(ST_MakePoint($5, $6), 4326),
                    ST_SetSRID(ST_MakePoint($7, $8), 4326),
                    ST_SetSRID(ST_MakePoint($5, $6), 4326),
                    ST_SetSRID(ST_MakePoint($7, $8), 4326),
                    $12, $13, $14, $14, $15, $16, $17, $18, $19, FALSE, $20, $21
                )
                RETURNING id, cargo_description, status, weight_kg, origin_hub_name, pickup_lng, pickup_lat, delivery_lng, delivery_lat, recipient_name, recipient_phone, priority,
                          price_total, platform_fee, driver_net, price_distance_km, priced_vehicle_class, price_is_estimate;
            `;

            const result = await pool.query(query, [
                cargo_description, weight_kg, hub.id, hub.name,
                hub.lng, hub.lat, delivery_lng, delivery_lat,
                recipient_name || null, recipient_phone || null, normalizedPriority,
                priced.pricingRateId, priced.vehicleClass, priced.totalAmount,
                priced.fuelAmount, priced.serviceAmount, priced.platformFee,
                priced.driverNet, priced.distanceKm, priced.returnLegAmount, priced.currency
            ]);

            const newOrder = result.rows[0];
            io.emit('order:created', newOrder);

            return ok(res, { message: "Order logged successfully.", order: newOrder }, { status: 201 });
        } catch (error) {
            logError(req, 'Database error', error);
            return fail(res, {
                status: 500,
                code: 'ORDERS_CREATE_FAILED',
                message: 'Failed to process freight manifest entry.',
            });
        }
    },

    // 3. POST /api/v1/orders/assign - Transaction-Safe Driver Assignment Block
    assignOrderBundle: async (req, res) => {
        // Acquire a dedicated database client thread for isolation operations
        const client = await pool.connect();
        try {
            const { orderIds, driverName } = req.body;
            const dispatcherEmail = req.user?.username || "SYSTEM_DISPATCH";

            if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
                return fail(res, {
                    status: 400,
                    code: 'ORDERS_ASSIGN_INVALID_PAYLOAD',
                    message: 'Invalid manifest payload.',
                });
            }
            if (typeof driverName !== 'string' || !driverName.trim()) {
                return fail(res, {
                    status: 400,
                    code: 'ORDERS_ASSIGN_INVALID_PAYLOAD',
                    message: 'A driver must be specified.',
                });
            }

            // Fire up ACID-compliant transaction locks
            await client.query('BEGIN');

            // Assignment used to accept any string as a "driver" — no check
            // it was a real account, let alone one with the driver role.
            // A typo or a dispatcher's own username would silently vanish
            // into an assignment nobody could ever see or act on.
            const driverResult = await client.query(
                `SELECT id FROM users WHERE username = $1 AND role = 'driver';`,
                [driverName]
            );
            if (driverResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return fail(res, {
                    status: 400,
                    code: 'ORDERS_ASSIGN_INVALID_DRIVER',
                    message: `"${driverName}" is not a registered driver account.`,
                });
            }
            const driverId = driverResult.rows[0].id;

            // Cargo needs a truck, not just a person — orders and
            // fleet_vehicles previously never referenced each other at
            // all, so there was no way to know (or check the capacity of)
            // what was actually carrying a shipment. If a driver somehow
            // has more than one vehicle currently assigned to them, the
            // most recently assigned one is treated as authoritative.
            const vehicleResult = await client.query(
                `SELECT id, max_weight_kg FROM fleet_vehicles WHERE current_driver_id = $1 ORDER BY id DESC LIMIT 1 FOR UPDATE;`,
                [driverId]
            );
            if (vehicleResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return fail(res, {
                    status: 409,
                    code: 'ORDERS_ASSIGN_NO_VEHICLE',
                    message: `${driverName} has no vehicle assigned. Assign a vehicle before dispatching cargo to them.`,
                });
            }
            const vehicle = vehicleResult.rows[0];

            // A driver can log in as soon as their account is approved, but
            // that's not the same as being cleared to actually carry cargo
            // — block dispatch until all 5 required compliance documents
            // (see driverVerificationService.js) are admin-approved.
            if (!(await isDriverVerified(client, driverName))) {
                await client.query('ROLLBACK');
                return fail(res, {
                    status: 409,
                    code: 'ORDERS_ASSIGN_DRIVER_UNVERIFIED',
                    message: `${driverName} has not completed document verification yet.`,
                });
            }

            // Select matching pending orders using a FOR UPDATE lock to freeze rows until transaction completes
            const verificationQuery = `SELECT id, weight_kg FROM orders WHERE id = ANY($1) AND status = 'PENDING' FOR UPDATE;`;
            const verificationResult = await client.query(verificationQuery, [orderIds]);

            if (verificationResult.rows.length !== orderIds.length) {
                await client.query('ROLLBACK');
                return fail(res, {
                    status: 409,
                    code: 'ORDERS_ASSIGN_CONFLICT',
                    message: 'Assignment conflict. One or more orders were altered by another session.',
                });
            }

            // Capacity check — only enforced when the vehicle actually has a
            // recorded limit, so vehicles registered before this field
            // existed don't suddenly block every assignment.
            if (vehicle.max_weight_kg !== null) {
                const newWeight = verificationResult.rows.reduce((sum, o) => sum + parseFloat(o.weight_kg), 0);
                const currentLoadResult = await client.query(
                    `SELECT COALESCE(SUM(weight_kg), 0) AS total
                     FROM orders
                     WHERE vehicle_id = $1 AND status NOT IN ('DELIVERED', 'CANCELLED');`,
                    [vehicle.id]
                );
                const currentWeight = parseFloat(currentLoadResult.rows[0].total);
                const totalWeight = currentWeight + newWeight;
                if (totalWeight > parseFloat(vehicle.max_weight_kg)) {
                    await client.query('ROLLBACK');
                    return fail(res, {
                        status: 409,
                        code: 'ORDERS_ASSIGN_CAPACITY_EXCEEDED',
                        message: `This would load ${totalWeight.toFixed(1)}kg onto a ${vehicle.max_weight_kg}kg-limit vehicle (already carrying ${currentWeight.toFixed(1)}kg).`,
                    });
                }
            }

            // Commit the state update
            const updateQuery = `
                UPDATE orders
                SET status = 'ASSIGNED', assigned_to = $1, vehicle_id = $3, updated_at = NOW()
                WHERE id = ANY($2)
                RETURNING id, cargo_description, status;
            `;
            const updateResult = await client.query(updateQuery, [driverName, orderIds, vehicle.id]);

            // Append entries to our historical audit tracking engine
            const logQuery = `
                INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by)
                SELECT unnest($1::int[]), 'PENDING', 'ASSIGNED', $2;
            `;
            await client.query(logQuery, [orderIds, dispatcherEmail]);

            // Save changes permanently to the core engine
            await client.query('COMMIT');

            io.emit('order:dispatched', {
                driverName,
                assignedManifest: updateResult.rows,
                timestamp: new Date().toISOString()
            });

            // Best-effort: a driver's phone being unreachable should never
            // fail the dispatch itself (the assignment is already committed).
            sendPushToUser(driverName, {
                title: 'New delivery assigned',
                body: `${updateResult.rows.length} job(s) dispatched to you.`,
                data: { type: 'order-assigned', orderIds: orderIds.join(',') },
            });

            return ok(res, {
                message: `Dispatched bundle to ${driverName}.`,
                dispatchedCount: updateResult.rows.length,
            });
        } catch (error) {
            await client.query('ROLLBACK');
            logError(req, 'Transaction aborted, rollback executed', error);
            return fail(res, {
                status: 500,
                code: 'ORDERS_ASSIGN_FAILED',
                message: 'Failed to execute transaction assignment safely.',
            });
        } finally {
            client.release(); // Return client back to connection pool
        }
    },

    // GET /api/orders/in-flight - orders already assigned to a driver but not
    // yet picked up. This is the working set a dispatcher can still safely
    // reassign or unassign (see reassignOrder below) — once a driver has
    // physically picked the cargo up, reassigning it to someone else who
    // doesn't have the truck doesn't reflect reality, so that's out of scope
    // here and would need an explicit transshipment workflow instead.
    getInFlightOrders: async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT id, cargo_description, status, weight_kg, origin_hub_name, assigned_to, vehicle_id, updated_at
                 FROM orders
                 WHERE status = 'ASSIGNED'
                 ORDER BY updated_at DESC;`
            );
            return ok(res, result.rows);
        } catch (error) {
            logError(req, 'Database error', error);
            return fail(res, {
                status: 500,
                code: 'ORDERS_IN_FLIGHT_FETCH_FAILED',
                message: 'Failed to read in-flight orders.',
            });
        }
    },

    // PATCH /api/orders/:id/reassign - dispatcher-only correction path for an
    // order that's already ASSIGNED. Pass a driverName to move it to a
    // different driver (validated the same way as the original assignment:
    // real driver, has a vehicle, capacity check), or omit it to send the
    // order back to PENDING with no driver/vehicle at all.
    reassignOrder: async (req, res) => {
        const client = await pool.connect();
        try {
            const { id } = req.params;
            const { driverName } = req.body || {};
            const dispatcherEmail = req.user?.username || 'SYSTEM_DISPATCH';

            await client.query('BEGIN');

            const currentResult = await client.query(
                `SELECT id, status, assigned_to, weight_kg FROM orders WHERE id = $1 FOR UPDATE;`,
                [id]
            );
            if (currentResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return fail(res, { status: 404, code: 'ORDERS_NOT_FOUND', message: 'Order record not found.' });
            }
            const order = currentResult.rows[0];

            if (order.status !== 'ASSIGNED') {
                await client.query('ROLLBACK');
                return fail(res, {
                    status: 409,
                    code: 'ORDERS_REASSIGN_INVALID_STATE',
                    message: `Cannot reassign an order with status ${order.status}. Only orders awaiting pickup can be reassigned.`,
                });
            }
            const previousDriver = order.assigned_to;

            // No driver given: send back to the dispatch queue.
            if (!driverName || !String(driverName).trim()) {
                const updateResult = await client.query(
                    `UPDATE orders SET status = 'PENDING', assigned_to = NULL, vehicle_id = NULL, updated_at = NOW()
                     WHERE id = $1 RETURNING id, cargo_description, status;`,
                    [id]
                );
                await client.query(
                    `INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by) VALUES ($1, 'ASSIGNED', 'PENDING', $2);`,
                    [id, dispatcherEmail]
                );
                await client.query('COMMIT');

                io.emit('order:unassigned', { orderId: Number(id), previousDriver, timestamp: new Date().toISOString() });
                io.emit('order:created', updateResult.rows[0]);

                return ok(res, { message: `Unassigned from ${previousDriver}. Back in the dispatch queue.`, order: updateResult.rows[0] });
            }

            const nextDriver = String(driverName).trim();
            if (nextDriver.toLowerCase() === String(previousDriver || '').toLowerCase()) {
                await client.query('ROLLBACK');
                return fail(res, { status: 400, code: 'ORDERS_REASSIGN_SAME_DRIVER', message: `Order is already assigned to ${previousDriver}.` });
            }

            const driverResult = await client.query(
                `SELECT id FROM users WHERE username = $1 AND role = 'driver';`,
                [nextDriver]
            );
            if (driverResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return fail(res, {
                    status: 400,
                    code: 'ORDERS_ASSIGN_INVALID_DRIVER',
                    message: `"${nextDriver}" is not a registered driver account.`,
                });
            }
            const driverId = driverResult.rows[0].id;

            const vehicleResult = await client.query(
                `SELECT id, max_weight_kg FROM fleet_vehicles WHERE current_driver_id = $1 ORDER BY id DESC LIMIT 1 FOR UPDATE;`,
                [driverId]
            );
            if (vehicleResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return fail(res, {
                    status: 409,
                    code: 'ORDERS_ASSIGN_NO_VEHICLE',
                    message: `${nextDriver} has no vehicle assigned. Assign a vehicle before reassigning cargo to them.`,
                });
            }
            const vehicle = vehicleResult.rows[0];

            if (!(await isDriverVerified(client, nextDriver))) {
                await client.query('ROLLBACK');
                return fail(res, {
                    status: 409,
                    code: 'ORDERS_ASSIGN_DRIVER_UNVERIFIED',
                    message: `${nextDriver} has not completed document verification yet.`,
                });
            }

            if (vehicle.max_weight_kg !== null) {
                const currentLoadResult = await client.query(
                    `SELECT COALESCE(SUM(weight_kg), 0) AS total
                     FROM orders
                     WHERE vehicle_id = $1 AND status NOT IN ('DELIVERED', 'CANCELLED') AND id != $2;`,
                    [vehicle.id, id]
                );
                const currentWeight = parseFloat(currentLoadResult.rows[0].total);
                const totalWeight = currentWeight + parseFloat(order.weight_kg);
                if (totalWeight > parseFloat(vehicle.max_weight_kg)) {
                    await client.query('ROLLBACK');
                    return fail(res, {
                        status: 409,
                        code: 'ORDERS_ASSIGN_CAPACITY_EXCEEDED',
                        message: `This would load ${totalWeight.toFixed(1)}kg onto a ${vehicle.max_weight_kg}kg-limit vehicle (already carrying ${currentWeight.toFixed(1)}kg).`,
                    });
                }
            }

            const updateResult = await client.query(
                `UPDATE orders SET assigned_to = $1, vehicle_id = $2, updated_at = NOW()
                 WHERE id = $3 RETURNING id, cargo_description, status;`,
                [nextDriver, vehicle.id, id]
            );

            await client.query(
                `INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by) VALUES ($1, 'ASSIGNED', 'ASSIGNED', $2);`,
                [id, dispatcherEmail]
            );

            await client.query('COMMIT');

            io.emit('order:reassigned', {
                orderId: Number(id),
                previousDriver,
                driverName: nextDriver,
                timestamp: new Date().toISOString(),
            });

            sendPushToUser(nextDriver, {
                title: 'Delivery reassigned to you',
                body: `Order #${id} has been reassigned to you.`,
                data: { type: 'order-assigned', orderIds: String(id) },
            });
            if (previousDriver) {
                sendPushToUser(previousDriver, {
                    title: 'Delivery reassigned',
                    body: `Order #${id} was reassigned to another driver.`,
                    data: { type: 'order-reassigned-away', orderId: String(id) },
                });
            }

            return ok(res, { message: `Reassigned to ${nextDriver}.`, order: updateResult.rows[0] });
        } catch (error) {
            await client.query('ROLLBACK');
            logError(req, 'Database error', error);
            return fail(res, {
                status: 500,
                code: 'ORDERS_REASSIGN_FAILED',
                message: 'Failed to reassign order.',
            });
        } finally {
            client.release();
        }
    },

    // 4. PATCH /api/v1/orders/:id/status - Update milestones with audit logging
    updateOrderStatus: async (req, res) => {
        const client = await pool.connect();
        try {
            const { id } = req.params;
            const { status } = req.body;
            const userEmail = req.user?.username || "SYSTEM_DRIVER";

            if (typeof status !== 'string' || !ALLOWED_ORDER_STATUSES.includes(status.toUpperCase())) {
                return fail(res, {
                    status: 400,
                    code: 'ORDERS_INVALID_STATUS',
                    message: `Status must be one of: ${ALLOWED_ORDER_STATUSES.join(', ')}.`,
                });
            }
            const normalizedStatus = status.toUpperCase();
            const requesterRole = String(req.user?.role || '').toLowerCase();

            if (requesterRole === 'driver' && !DRIVER_ALLOWED_STATUSES.includes(normalizedStatus)) {
                return fail(res, {
                    status: 403,
                    code: 'ORDERS_STATUS_DRIVER_FORBIDDEN',
                    message: `Drivers cannot set status to ${normalizedStatus}. Report a problem via an incident report instead — a dispatcher will cancel or reassign the order.`,
                });
            }

            await client.query('BEGIN');

            // Fetch the current state to populate previous status columns
            const currentQuery = `SELECT status, assigned_to FROM orders WHERE id = $1 FOR UPDATE;`;
            const currentResult = await client.query(currentQuery, [id]);

            if (currentResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return fail(res, {
                    status: 404,
                    code: 'ORDERS_NOT_FOUND',
                    message: 'Order record not found.',
                });
            }

            const previousStatus = currentResult.rows[0].status;
            const assignedTo = currentResult.rows[0].assigned_to;

            if (requesterRole === 'driver' && String(assignedTo || '').toLowerCase() !== String(req.user?.username || '').toLowerCase()) {
                await client.query('ROLLBACK');
                return fail(res, {
                    status: 403,
                    code: 'ORDERS_STATUS_FORBIDDEN',
                    message: 'Drivers may only update orders assigned to them.',
                });
            }

            // Commit state shift
            const updateQuery = `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, cargo_description, status;`;
            const result = await client.query(updateQuery, [normalizedStatus, id]);
            const updatedOrder = result.rows[0];

            // Log changes
            const logQuery = `INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by) VALUES ($1, $2, $3, $4);`;
            // Leaving the pickup is the moment the wait there ends, so it is
            // worked out here for the same reason the drop's is worked out
            // before DELIVERED is written.
            if (ARRIVAL_STATUSES.includes(normalizedStatus) && req.user?.role !== 'driver') {
                return fail(res, {
                    status: 403,
                    code: 'ORDERS_ARRIVAL_DRIVER_ONLY',
                    message: 'Only the driver can record arriving at the pickup or the drop.',
                });
            }

            // Keyed on leaving AT_PICKUP rather than on reaching any
            // particular next status. The driver app never sends PICKED_UP --
            // its flow runs ASSIGNED, IN_TRANSIT, ARRIVED, DELIVERED, and
            // PICKED_UP survives only in the status list -- so keying on it
            // would have been waiting for an event that never comes. What
            // ends the wait is leaving the gate, whatever the driver calls it.
            if (previousStatus === 'AT_PICKUP' && normalizedStatus !== 'AT_PICKUP') {
                try {
                    const waited = await detentionForOrder(client, id, { arrivalStatus: 'AT_PICKUP' });
                    if (waited) {
                        await client.query(
                            `UPDATE orders SET
                                pickup_detention_minutes = $2,
                                pickup_detention_amount = $3,
                                detention_minutes = COALESCE(detention_minutes, 0) + $2,
                                detention_amount = COALESCE(detention_amount, 0) + $3,
                                price_total = COALESCE(price_total, 0) + $3,
                                driver_net = COALESCE(driver_net, 0) + $3
                              WHERE id = $1`,
                            [id, waited.waitedMinutes, waited.detentionAmount]
                        );
                    }
                } catch (err) {
                    // Same rule as the drop: a driver must be able to move a
                    // job on whatever the pricing does. The wait stays in the
                    // status log and can be recovered.
                    logError(req, `Pickup detention for order #${id} could not be worked out`, err);
                }
            }

            // Issued when the driver sets off, not when they arrive. A code
            // that lands while the driver is already at the gate turns a
            // handover into a wait for an SMS.
            let codeToSend = null;
            if (normalizedStatus === 'IN_TRANSIT' || normalizedStatus === 'ARRIVED') {
                try {
                    const issued = await issueDeliveryCode(client, id);
                    if (issued && issued.code) codeToSend = issued;
                } catch (err) {
                    // A driver must be able to move a job on whatever the SMS
                    // does. Without a code they fall back to the photo, which
                    // is what every delivery used until now.
                    logError(req, `Could not issue a delivery code for #${id}`, err);
                }
            }

            await client.query(logQuery, [id, previousStatus, normalizedStatus, userEmail]);

            await client.query('COMMIT');

            // Outside the transaction: an SMS failure must not roll back a
            // status change the driver already made, and the code is on the
            // row either way so dispatch can resend it.
            if (codeToSend) {
                sendDeliveryCode(codeToSend).catch((err) =>
                    logError(req, `Delivery code SMS failed for #${id}`, err));
            }

            // After the commit, never before: an SMS round trip inside an
            // open transaction would hold this order's row lock for the
            // length of a third party's network call.
            notifyCustomerOfStatus({
                orderId: updatedOrder.id,
                previousStatus,
                newStatus: normalizedStatus,
            });

            io.emit('order:status-updated', {
                orderId: updatedOrder.id,
                status: updatedOrder.status,
                cargo_description: updatedOrder.cargo_description,
                assignedTo,
                // Lets the driver app's own alert feed skip notifying a
                // driver about a status change they just made themselves —
                // that's not new information, the trip screen already
                // reflects it immediately. Only a dispatcher/admin-driven
                // change (this same value false) is something the assigned
                // driver wouldn't otherwise know about.
                initiatedByDriver: requesterRole === 'driver',
                timestamp: new Date().toISOString()
            });

            return ok(res, { message: `Milestone updated to [${status}].`, order: updatedOrder });
        } catch (error) {
            await client.query('ROLLBACK');
            logError(req, 'Database error', error);
            return fail(res, {
                status: 500,
                code: 'ORDERS_STATUS_UPDATE_FAILED',
                message: 'Failed to update progress milestone safely.',
            });
        } finally {
            client.release();
        }
    },

    // POST /api/orders/:id/confirm-delivery - Proof-of-delivery: uploads a
    // photo to R2, records the confirmation, and marks the order DELIVERED
    // in one transaction. Expects multipart/form-data with a `photo` file
    // field (see routes/orderRoutes.js for the multer middleware) and an
    // optional `notes` text field.
    confirmDelivery: async (req, res) => {
        const client = await pool.connect();
        try {
            const { id } = req.params;
            const { notes } = req.body;
            const driverName = req.user?.username || 'SYSTEM_DRIVER';

            // Photo or code, not photo only. An app driver keeps taking the
            // picture and nothing about their day changes; a driver with no
            // camera closes the job on the code the recipient read out, which
            // is the better evidence of the two -- a photo shows a parcel
            // somewhere, a code shows it reached the person it was for.
            const submittedCode = typeof req.body?.deliveryCode === 'string' ? req.body.deliveryCode.trim() : '';
            if (!req.file && !submittedCode) {
                await client.query('ROLLBACK').catch(() => {});
                return fail(res, {
                    status: 400,
                    code: 'DELIVERY_PROOF_REQUIRED',
                    message: 'Take a photo, or enter the code the recipient was sent.',
                });
            }

            await client.query('BEGIN');

            let proofMethod = req.file ? 'photo' : null;
            if (submittedCode) {
                const check = await verifyDeliveryCode(client, id, submittedCode);
                if (!check.ok) {
                    await client.query('ROLLBACK').catch(() => {});
                    const reasons = {
                        NO_CODE_ISSUED: 'No code was sent for this delivery — take a photo instead.',
                        TOO_MANY_ATTEMPTS: `That code has been tried ${DELIVERY_CODE_MAX_ATTEMPTS} times. Take a photo instead.`,
                        NO_CODE_GIVEN: 'Enter the code the recipient was sent.',
                        WRONG_CODE: `That code is not right${check.attemptsLeft != null ? ` — ${check.attemptsLeft} tries left` : ''}.`,
                    };
                    return fail(res, {
                        status: check.reason === 'WRONG_CODE' ? 400 : 409,
                        code: `DELIVERY_CODE_${check.reason}`,
                        message: reasons[check.reason] || 'That code could not be checked.',
                    });
                }
                proofMethod = req.file ? 'photo+code' : 'code';
            }

            const currentResult = await client.query(
                'SELECT status, assigned_to, delivery_geom FROM orders WHERE id = $1 FOR UPDATE;',
                [id]
            );
            if (currentResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return fail(res, { status: 404, code: 'ORDERS_NOT_FOUND', message: 'Order record not found.' });
            }

            const { status: previousStatus, assigned_to: assignedTo, delivery_geom: deliveryGeom } = currentResult.rows[0];
            const requesterRole = String(req.user?.role || '').toLowerCase();
            if (requesterRole === 'driver' && String(assignedTo || '').toLowerCase() !== driverName.toLowerCase()) {
                await client.query('ROLLBACK');
                return fail(res, {
                    status: 403,
                    code: 'ORDERS_STATUS_FORBIDDEN',
                    message: 'Drivers may only confirm delivery for orders assigned to them.',
                });
            }

            // Upload before writing any rows — if R2 isn't configured or the
            // upload fails, we want a clean early error, not a committed
            // confirmation row pointing at a photo that doesn't exist.
            // Returns a storage KEY, not a URL — the bucket is private, so
            // only a freshly-signed URL (generated below, just for this
            // response) is ever handed to a client; the key is what's
            // persisted to delivery_confirmations.photo_url.
            //
            // Null on a code-only delivery: there is no file to upload, and
            // calling this with no req.file would throw on the buffer before
            // ever reaching storage.
            const photoKey = req.file
                ? await uploadDeliveryPhoto({
                    buffer: req.file.buffer,
                    mimeType: req.file.mimetype,
                    orderId: id,
                })
                : null;

            // Soft location check: compare the driver's last known position
            // against the order's delivery point. A missing/stale GPS fix
            // (no driver_locations row yet) is treated as "can't verify",
            // not "suspicious" — it doesn't flag anything.
            let distanceFromTargetM = null;
            let locationFlagged = false;
            if (deliveryGeom) {
                const proximityResult = await client.query(
                    `SELECT ST_DistanceSphere(geom, $2) AS distance_meters
                     FROM driver_locations WHERE driver_name = $1;`,
                    [driverName, deliveryGeom]
                );
                if (proximityResult.rows.length > 0) {
                    distanceFromTargetM = parseFloat(proximityResult.rows[0].distance_meters);
                    locationFlagged = distanceFromTargetM > DELIVERY_LOCATION_FLAG_METERS;
                }
            }

            await client.query(
                `INSERT INTO delivery_confirmations (order_id, driver_name, photo_url, notes, distance_from_target_m, location_flagged, proof_method)
                 VALUES ($1, $2, $3, $4, $5, $6, $7);`,
                [id, driverName, photoKey, notes || null, distanceFromTargetM, locationFlagged, proofMethod]
            );

            // Worked out before the status moves, because it reads the gap
            // between ARRIVED and now -- once DELIVERED is written the wait is
            // over and NOW() is the moment it ended.
            // What the run actually turned out to be, settled together. Both
            // are the same shape of question -- something only the finished
            // job can answer -- and both must leave the delivery itself alone
            // if they fail.
            let backfill = null;
            try {
                backfill = await backfillCreditForOrder(client, id);
            } catch (err) {
                logError(req, `Backfill credit for order #${id} could not be worked out`, err);
            }

            let detention = null;
            try {
                detention = await detentionForOrder(client, id);
            } catch (err) {
                // A driver must be able to close a job whatever the pricing
                // does. An uncharged wait can be recovered from the status log
                // afterwards; a delivery that would not confirm cannot.
                logError(req, `Detention for order #${id} could not be worked out`, err);
            }

            const updateResult = await client.query(
                `UPDATE orders SET
                    status = 'DELIVERED',
                    dropoff_detention_minutes = COALESCE($2, dropoff_detention_minutes),
                    dropoff_detention_amount = COALESCE($3, dropoff_detention_amount),
                    detention_minutes = COALESCE(detention_minutes, 0) + COALESCE($2, 0),
                    detention_amount = COALESCE(detention_amount, 0) + COALESCE($3, 0),
                    -- Added to the customer's total and passed to the driver
                    -- whole. No commission: this reimburses a driver's stolen
                    -- hour, it is not service the platform brokered, which is
                    -- the same reason fuel sits outside the fee.
                    price_total = COALESCE(price_total, 0) + COALESCE($3, 0) - COALESCE($4, 0),
                    driver_net = COALESCE(driver_net, 0) + COALESCE($3, 0) - COALESCE($4, 0),
                    -- The credit comes off the driver as well as the customer,
                    -- because the driver did not drive the empty leg either.
                    -- They are not out of pocket: the load that filled it is a
                    -- second fare on the same run, which is the whole reason
                    -- pairing is worth doing.
                    backfill_credit = COALESCE($4, backfill_credit),
                    backfilled_by_order_id = COALESCE($5, backfilled_by_order_id),
                    updated_at = NOW()
                 WHERE id = $1
                 RETURNING id, cargo_description, status, detention_minutes, detention_amount,
                           price_total, driver_net;`,
                [id, detention?.waitedMinutes ?? null, detention?.detentionAmount ?? null,
                 backfill?.creditAmount ?? null, backfill?.filledByOrderId ?? null]
            );

            await client.query(
                `INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by) VALUES ($1, $2, 'DELIVERED', $3);`,
                [id, previousStatus, driverName]
            );

            await client.query('COMMIT');

            const updatedOrder = updateResult.rows[0];
            const photoUrl = await toSignedUrl(photoKey);
            io.emit('order:status-updated', {
                orderId: updatedOrder.id,
                status: updatedOrder.status,
                cargo_description: updatedOrder.cargo_description,
                driverName,
                assignedTo,
                photoUrl,
                locationFlagged,
                distanceFromTargetM,
                initiatedByDriver: String(req.user?.role || '').toLowerCase() === 'driver',
                timestamp: new Date().toISOString(),
            });

            return ok(res, { message: 'Delivery confirmed.', order: updatedOrder, photoUrl, locationFlagged, distanceFromTargetM });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            logError(req, 'Database error', error);
            const isStorageError = error.message?.includes('not configured');
            const isFileTypeError = error.message?.includes('does not match an allowed');
            return fail(res, {
                status: isStorageError ? 503 : isFileTypeError ? 400 : 500,
                code: isStorageError ? 'DELIVERY_PHOTO_STORAGE_UNAVAILABLE' : isFileTypeError ? 'DELIVERY_PHOTO_INVALID_TYPE' : 'DELIVERY_CONFIRMATION_FAILED',
                message: isStorageError || isFileTypeError ? error.message : 'Failed to confirm delivery.',
            });
        } finally {
            client.release();
        }
    },
    // GET /api/orders/deliveries/recent - completed deliveries with their
    // proof-of-delivery photo, so a dispatcher can find one even if they
    // weren't watching live when the driver confirmed it.
    getRecentDeliveries: async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT
                    dc.id,
                    dc.order_id,
                    dc.driver_name,
                    dc.photo_url,
                    dc.notes,
                    dc.confirmed_at,
                    dc.distance_from_target_m,
                    dc.location_flagged,
                    o.cargo_description
                 FROM delivery_confirmations dc
                 JOIN orders o ON o.id = dc.order_id
                 ORDER BY dc.confirmed_at DESC
                 LIMIT 50;`
            );
            const rows = await Promise.all(result.rows.map(async (row) => ({
                ...row,
                photo_url: await toSignedUrl(row.photo_url),
            })));
            return ok(res, rows);
        } catch (error) {
            logError(req, 'Database error', error);
            return fail(res, {
                status: 500,
                code: 'DELIVERIES_FETCH_FAILED',
                message: 'Failed to read recent deliveries.',
            });
        }
    },

    getBatchedOrders: async (req, res) => {
        try {
            const selectQuery = `
                SELECT
                    id,
                    cargo_description,
                    weight_kg,
                    origin_hub_name,
                    pickup_lng,
                    pickup_lat,
                    delivery_lng,
                    delivery_lat
                FROM orders
                WHERE status = 'PENDING';
            `;
            const result = await pool.query(selectQuery);
            const pending = result.rows;

            if (pending.length === 0) return ok(res, []);

            const spatialMatrixQuery = `
                SELECT o1.id AS order_a_id, o2.id AS order_b_id
                FROM orders o1
                JOIN orders o2 ON o1.id < o2.id
                WHERE o1.status = 'PENDING' AND o2.status = 'PENDING'
                AND ST_DWithin(COALESCE(o1.pickup_geom, o1.pickup_coordinates)::GEOGRAPHY, COALESCE(o2.pickup_geom, o2.pickup_coordinates)::GEOGRAPHY, 1500)
                AND ST_DWithin(COALESCE(o1.delivery_geom, o1.delivery_coordinates)::GEOGRAPHY, COALESCE(o2.delivery_geom, o2.delivery_coordinates)::GEOGRAPHY, 3500);
            `;
            
            const matrixResult = await pool.query(spatialMatrixQuery);
            const spatialPairs = matrixResult.rows;

            const batches = [];
            const visited = new Set();

            for (let i = 0; i < pending.length; i++) {
                const currentOrder = pending[i];
                if (visited.has(currentOrder.id)) continue;

                const currentBatch = [currentOrder];
                visited.add(currentOrder.id);

                spatialPairs.forEach(pair => {
                    if (pair.order_a_id === currentOrder.id && !visited.has(pair.order_b_id)) {
                        const companion = pending.find(o => o.id === pair.order_b_id);
                        if (companion) {
                            currentBatch.push(companion);
                            visited.add(pair.order_b_id);
                        }
                    }
                });

                batches.push({
                    batch_id: `BATCH-${Math.floor(1000 + Math.random() * 9000)}`,
                    origin_cluster: currentBatch[0].origin_hub_name,
                    total_weight_kg: currentBatch.reduce((sum, o) => sum + parseFloat(o.weight_kg), 0).toFixed(2),
                    shipments: currentBatch
                });
            }

            return ok(res, batches);
        } catch (error) {
            logError(req, 'PostGIS index error', error);
            return fail(res, {
                status: 500,
                code: 'ORDERS_POOLING_FAILED',
                message: 'Spatial matching pipeline calculation error.',
            });
        }
    },

    // GET /api/orders/:id - Single order detail (used by the mobile trip screen)
    // PATCH /api/orders/:id/place — pins a customer-placed order to real
    // coordinates.
    //
    // Orders booked through the public site carry only the free text a
    // customer typed, because a web form cannot produce a location and
    // geocoding "Kimironko Market" would guess between several. Everything
    // downstream is coordinate-driven: the fleet map, nearest-driver
    // ranking, the ETA and the route-progress bar all stay dark until a
    // human says where this actually is. This is that step.
    // PATCH /api/orders/:id/priority
    //
    // The dispatch queue has always sorted by priority, but nothing could
    // change it after an order was created — so a customer ringing to say
    // "this one is urgent" left the dispatcher looking at a lever they
    // could not pull. This is that lever.
    updateOrderPriority: async (req, res) => {
        try {
            const { id } = req.params;
            const { priority } = req.body || {};

            if (!ALLOWED_ORDER_PRIORITIES.includes(priority)) {
                return fail(res, {
                    status: 400,
                    code: 'ORDERS_PRIORITY_INVALID',
                    message: `Priority must be one of: ${ALLOWED_ORDER_PRIORITIES.join(', ')}.`,
                });
            }

            const result = await pool.query(
                `UPDATE orders SET priority = $2, updated_at = NOW() WHERE id = $1
                 RETURNING id, priority, cargo_description`,
                [id, priority]
            );
            if (result.rows.length === 0) {
                return fail(res, { status: 404, code: 'ORDERS_NOT_FOUND', message: 'That order no longer exists.' });
            }

            await appendAuditLog({
                actionType: 'ORDER_PRIORITY_CHANGED',
                description: `Order #${id} set to ${priority} priority`,
                username: req.user?.username || 'System',
            });

            return ok(res, result.rows[0]);
        } catch (error) {
            logError(req, 'Database error', error);
            return fail(res, { status: 500, code: 'ORDERS_PRIORITY_FAILED', message: 'Could not change the priority.' });
        }
    },

    placeOrder: async (req, res) => {
        try {
            const { pickupLat, pickupLng, deliveryLat, deliveryLng, originHubId } = req.body || {};
            const row = await placeOneOrder({
                id: req.params.id, pickupLat, pickupLng, deliveryLat, deliveryLng, originHubId, req,
            });
            return ok(res, row);
        } catch (error) {
            if (error instanceof PlacementError) {
                return fail(res, { status: error.status, code: error.code, message: error.message });
            }
            logError(req, 'Database error', error);
            return fail(res, { status: 500, code: 'ORDERS_PLACE_FAILED', message: 'Could not save those locations.' });
        }
    },

    // PATCH /api/orders/place-batch
    //
    // Placing the unplaced backlog is the one job a dispatcher does dozens of
    // times in a sitting, and a round trip per pin makes the work feel like
    // the tool is arguing with them.
    //
    // Every order is placed independently and reported independently. One
    // order pinned into the sea must not discard the nineteen good pins
    // beside it -- the dispatcher would have to redo work that was correct,
    // which is worse than the bad pin. So there is no batch transaction:
    // partial success is the intended outcome, not a compromise.
    placeOrderBatch: async (req, res) => {
        const placements = Array.isArray(req.body?.placements) ? req.body.placements : null;
        if (!placements || placements.length === 0) {
            return fail(res, { status: 400, code: 'ORDERS_PLACE_BATCH_EMPTY', message: 'Send at least one placement.' });
        }
        // Bounded because the work is bounded: each placement is several
        // queries plus a repricing, and an unbounded array is an unbounded
        // request.
        if (placements.length > MAX_BATCH_PLACEMENTS) {
            return fail(res, {
                status: 400,
                code: 'ORDERS_PLACE_BATCH_TOO_LARGE',
                message: `Place at most ${MAX_BATCH_PLACEMENTS} orders at a time.`,
            });
        }

        const placed = [];
        const failed = [];
        for (const p of placements) {
            const orderId = p?.orderId;
            try {
                const row = await placeOneOrder({
                    id: orderId,
                    pickupLat: p?.pickupLat,
                    pickupLng: p?.pickupLng,
                    deliveryLat: p?.deliveryLat,
                    deliveryLng: p?.deliveryLng,
                    originHubId: p?.originHubId,
                    req,
                });
                placed.push(row);
            } catch (error) {
                if (error instanceof PlacementError) {
                    failed.push({ orderId, code: error.code, message: error.message });
                    continue;
                }
                // A real fault against one order still must not take the rest
                // of the batch down, but it is logged as the fault it is
                // rather than reported as the dispatcher's mistake.
                logError(req, `Placing order #${orderId} in a batch failed`, error);
                failed.push({ orderId, code: 'ORDERS_PLACE_FAILED', message: 'Could not save those locations.' });
            }
        }

        return ok(res, { placed, failed, placedCount: placed.length, failedCount: failed.length });
    },

    // POST /api/orders/priority
    //
    // Bulk sibling of PATCH /:id/priority. Reported the same way as the batch
    // above: ids that no longer exist come back as failures rather than
    // silently doing nothing, because a dispatcher who selected twenty rows
    // and changed nineteen needs to know which one got away.
    setOrderPriorityBatch: async (req, res) => {
        try {
            const { orderIds, priority } = req.body || {};
            if (!Array.isArray(orderIds) || orderIds.length === 0) {
                return fail(res, { status: 400, code: 'ORDERS_PRIORITY_NO_IDS', message: 'Select at least one order.' });
            }
            if (orderIds.length > MAX_BATCH_PLACEMENTS) {
                return fail(res, {
                    status: 400,
                    code: 'ORDERS_PRIORITY_TOO_MANY',
                    message: `Change at most ${MAX_BATCH_PLACEMENTS} orders at a time.`,
                });
            }
            if (!ALLOWED_ORDER_PRIORITIES.includes(priority)) {
                return fail(res, {
                    status: 400,
                    code: 'ORDERS_PRIORITY_INVALID',
                    message: `Priority must be one of: ${ALLOWED_ORDER_PRIORITIES.join(', ')}.`,
                });
            }

            const result = await pool.query(
                `UPDATE orders SET priority = $2, updated_at = NOW() WHERE id = ANY($1::int[])
                 RETURNING id, priority, cargo_description`,
                [orderIds, priority]
            );

            const updatedIds = new Set(result.rows.map((r) => r.id));
            const failed = orderIds
                .filter((id) => !updatedIds.has(Number(id)))
                .map((id) => ({ orderId: id, code: 'ORDERS_NOT_FOUND', message: 'That order no longer exists.' }));

            // One line for the batch, not one per order: twenty rows saying
            // the same thing at the same second buries the log it lives in.
            await appendAuditLog({
                actionType: 'ORDER_PRIORITY_CHANGED',
                description: `${result.rows.length} order(s) set to ${priority} priority: #${result.rows.map((r) => r.id).join(', #')}`,
                username: req.user?.username || 'System',
            });

            return ok(res, { updated: result.rows, failed, updatedCount: result.rows.length, failedCount: failed.length });
        } catch (error) {
            logError(req, 'Database error', error);
            return fail(res, { status: 500, code: 'ORDERS_PRIORITY_BATCH_FAILED', message: 'Could not change those priorities.' });
        }
    },

    getOrderById: async (req, res) => {
        try {
            const { id } = req.params;
            // dl (driver_locations) is LEFT JOINed, not INNER — a driver who
            // hasn't sent a telemetry ping yet simply has no row there, and
            // this endpoint still needs to return the order itself in that
            // case. Distance is real great-circle distance via PostGIS
            // (ST_DistanceSphere), the same function getNearestDrivers
            // already uses elsewhere in this file — straight-line, not a
            // road-routed distance, which is why the ETA computed from it
            // below is explicitly an estimate.
            const query = `
                SELECT
                    o.id,
                    o.cargo_description,
                    o.status,
                    o.weight_kg,
                    o.origin_hub_name,
                    o.assigned_to,
                    o.pickup_lng,
                    o.pickup_lat,
                    o.delivery_lng,
                    o.delivery_lat,
                    o.recipient_name,
                    o.recipient_phone,
                    o.priority,
                    o.updated_at,
                    -- Same reason as getDriverAssignments: on a
                    -- customer-placed order these are the only description
                    -- of where the job goes and who to ring.
                    o.source,
                    o.pickup_address_text,
                    o.delivery_address_text,
                    o.special_instructions,
                    o.customer_name,
                    o.customer_phone,
                    -- Same rule as the assignments list: the driver's own net,
                    -- never the customer total or the platform's cut.
                    o.driver_net,
                    o.price_is_estimate,
                    o.detention_amount,
                    o.delivery_code_sent_at,
                    dl.lat AS driver_lat,
                    dl.lng AS driver_lng,
                    EXTRACT(EPOCH FROM (NOW() - dl.updated_at)) AS telemetry_age_seconds,
                    ST_DistanceSphere(dl.geom, o.delivery_geom) AS distance_remaining_meters,
                    ST_DistanceSphere(o.pickup_geom, o.delivery_geom) AS total_distance_meters
                FROM orders o
                LEFT JOIN driver_locations dl ON dl.driver_name = o.assigned_to
                WHERE o.id = $1;
            `;
            const result = await pool.query(query, [id]);
            if (result.rows.length === 0) {
                return fail(res, { status: 404, code: 'ORDERS_NOT_FOUND', message: 'Order not found.' });
            }

            const order = result.rows[0];
            const requesterRole = String(req.user?.role || '').toLowerCase();
            if (requesterRole === 'driver' && String(order.assigned_to || '').toLowerCase() !== String(req.user?.username || '').toLowerCase()) {
                return fail(res, { status: 403, code: 'ORDERS_FORBIDDEN', message: 'You can only view orders assigned to you.' });
            }

            const {
                driver_lat, driver_lng, telemetry_age_seconds,
                distance_remaining_meters, total_distance_meters,
                ...publicOrderFields
            } = order;
            return ok(res, {
                ...publicOrderFields,
                ...computeRouteProgress({ driver_lat, telemetry_age_seconds, distance_remaining_meters, total_distance_meters }),
            });
        } catch (error) {
            logError(req, 'Database error', error);
            return fail(res, { status: 500, code: 'ORDERS_FETCH_FAILED', message: 'Failed to read order record.' });
        }
    },

    // 6. GET /api/v1/orders/:id/history - Pull immutable tracking timeline
    getOrderHistory: async (req, res) => {
        try {
            const { id } = req.params;
            const query = `
                SELECT previous_status, new_status, changed_by, changed_at 
                FROM order_status_logs 
                WHERE order_id = $1 
                ORDER BY changed_at ASC;
            `;
            const result = await pool.query(query, [id]);
            return ok(res, result.rows);
        } catch (error) {
            logError(req, 'Database error', error);
            return fail(res, {
                status: 500,
                code: 'ORDERS_HISTORY_FAILED',
                message: 'Failed to read history logs.',
            });
        }
    },

    // GET /api/orders/:id/return-loads
    //
    // Jobs that could ride home on this one's empty leg. Dispatch-only and
    // read-only: the credit at delivery only ever fires on a pairing that
    // actually happened, and a pairing only happens if somebody makes one.
    // Without this the empty leg is a number on an invoice nobody can act on.
    // POST /api/orders/offer — the partner-driver path.
    //
    // Dispatch still assigns fleet drivers directly through /assign; this is
    // for someone with their own truck, who is deciding whether the run is
    // worth their diesel rather than being told to do it. Both have to work at
    // once, which is why this is a second endpoint and not a changed one.
    offerOrders: async (req, res) => {
        const client = await pool.connect();
        try {
            const { orderIds, driverName, expiresInMinutes } = req.body || {};
            if (!Array.isArray(orderIds) || orderIds.length === 0 || typeof driverName !== 'string') {
                return fail(res, { status: 400, code: 'ORDERS_OFFER_INVALID', message: 'Give an order list and a driver.' });
            }
            // Long enough that a driver mid-delivery can answer, short enough
            // that a customer's job is not parked all afternoon on somebody
            // who has stopped looking at their phone.
            const minutes = Number.isFinite(Number(expiresInMinutes)) ? Math.min(Math.max(Number(expiresInMinutes), 5), 240) : 30;

            await client.query('BEGIN');

            const driver = await client.query(`SELECT id FROM users WHERE username = $1 AND role = 'driver'`, [driverName]);
            if (driver.rows.length === 0) {
                await client.query('ROLLBACK');
                return fail(res, { status: 400, code: 'ORDERS_DRIVER_NOT_FOUND', message: 'No such driver.' });
            }

            // Already refused is not re-offered. A driver who said no to this
            // run has told dispatch something, and handing it straight back
            // teaches them the button does nothing.
            const refused = await client.query(
                `SELECT order_id FROM order_offer_declines WHERE driver_username = $1 AND order_id = ANY($2)`,
                [driverName, orderIds]
            );
            if (refused.rows.length > 0) {
                await client.query('ROLLBACK');
                return fail(res, {
                    status: 409,
                    code: 'ORDERS_ALREADY_DECLINED',
                    message: `That driver has already turned down order ${refused.rows.map((r) => `#${r.order_id}`).join(', ')}.`,
                });
            }

            // Locked, and only from PENDING. Two dispatchers working the same
            // queue must not be able to offer one job to two drivers.
            const locked = await client.query(
                `SELECT id FROM orders WHERE id = ANY($1) AND status = 'PENDING' FOR UPDATE`,
                [orderIds]
            );
            if (locked.rows.length !== orderIds.length) {
                await client.query('ROLLBACK');
                return fail(res, {
                    status: 409,
                    code: 'ORDERS_NOT_OFFERABLE',
                    message: 'One of those is no longer waiting to be offered — someone may have taken it already.',
                });
            }

            const updated = await client.query(
                `UPDATE orders
                    SET status = 'OFFERED', assigned_to = $1,
                        offer_expires_at = NOW() + ($3 || ' minutes')::interval, updated_at = NOW()
                  WHERE id = ANY($2)
                  RETURNING id, cargo_description, status, offer_expires_at, driver_net`,
                [driverName, orderIds, String(minutes)]
            );

            await client.query('COMMIT');

            for (const order of updated.rows) io.emit('order:offered', order);
            sendPushToUser(driverName, {
                title: updated.rows.length === 1 ? 'A job is offered to you' : `${updated.rows.length} jobs offered to you`,
                body: 'Open the app to accept or turn it down.',
                data: { type: 'job-offer' },
            });

            return ok(res, { offered: updated.rows, expiresInMinutes: minutes });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            logError(req, 'Offer failed', error);
            return fail(res, { status: 500, code: 'ORDERS_OFFER_FAILED', message: 'Could not offer that work.' });
        } finally {
            client.release();
        }
    },

    // POST /api/orders/:id/accept — the driver takes it.
    acceptOffer: async (req, res) => {
        const client = await pool.connect();
        try {
            const { id } = req.params;
            const driverName = req.user?.username;

            await client.query('BEGIN');
            // The whole race, in one statement. Only an offer still standing,
            // still this driver's, and not yet lapsed can be taken -- so a
            // second accept, or one arriving after the offer expired, changes
            // nothing and reports honestly rather than quietly winning.
            const taken = await client.query(
                `UPDATE orders
                    SET status = 'ASSIGNED', offer_expires_at = NULL, updated_at = NOW()
                  WHERE id = $1 AND status = 'OFFERED' AND assigned_to = $2
                    AND (offer_expires_at IS NULL OR offer_expires_at > NOW())
                  RETURNING id, cargo_description, status, driver_net`,
                [id, driverName]
            );
            if (taken.rows.length === 0) {
                await client.query('ROLLBACK');
                return fail(res, {
                    status: 409,
                    code: 'ORDERS_OFFER_GONE',
                    message: 'That offer is no longer open — it may have expired or been withdrawn.',
                });
            }

            await client.query(
                `INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by) VALUES ($1, 'OFFERED', 'ASSIGNED', $2)`,
                [id, driverName]
            );
            await client.query('COMMIT');

            io.emit('order:status-updated', { orderId: Number(id), status: 'ASSIGNED', initiatedByDriver: true, timestamp: new Date().toISOString() });
            return ok(res, { order: taken.rows[0] });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            logError(req, 'Accept failed', error);
            return fail(res, { status: 500, code: 'ORDERS_ACCEPT_FAILED', message: 'Could not accept that job.' });
        } finally {
            client.release();
        }
    },

    // POST /api/orders/:id/decline — the driver says no.
    //
    // The refusal is recorded, not just the release. A run being turned down
    // repeatedly is dispatch learning the rate is wrong for it, and that is
    // only visible if the noes are kept.
    declineOffer: async (req, res) => {
        const client = await pool.connect();
        try {
            const { id } = req.params;
            const driverName = req.user?.username;
            const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : null;

            await client.query('BEGIN');
            const released = await client.query(
                `UPDATE orders
                    SET status = 'PENDING', assigned_to = NULL, offer_expires_at = NULL, updated_at = NOW()
                  WHERE id = $1 AND status = 'OFFERED' AND assigned_to = $2
                  RETURNING id, cargo_description`,
                [id, driverName]
            );
            if (released.rows.length === 0) {
                await client.query('ROLLBACK');
                return fail(res, { status: 409, code: 'ORDERS_OFFER_GONE', message: 'That offer is no longer open.' });
            }

            await client.query(
                `INSERT INTO order_offer_declines (order_id, driver_username, reason) VALUES ($1, $2, $3)
                 ON CONFLICT (order_id, driver_username) DO UPDATE SET reason = EXCLUDED.reason, declined_at = NOW()`,
                [id, driverName, reason]
            );
            await client.query(
                `INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by) VALUES ($1, 'OFFERED', 'PENDING', $2)`,
                [id, driverName]
            );
            await client.query('COMMIT');

            // Back on the board, and dispatch told why. A job silently
            // returning to PENDING looks like a glitch; a job returning with
            // "too far for the rate" is something to act on.
            io.emit('order:offer-declined', { orderId: Number(id), driverName, reason });
            return ok(res, { released: released.rows[0], reason });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            logError(req, 'Decline failed', error);
            return fail(res, { status: 500, code: 'ORDERS_DECLINE_FAILED', message: 'Could not turn that job down.' });
        } finally {
            client.release();
        }
    },

    getReturnLoads: async (req, res) => {
        try {
            const candidates = await returnLoadCandidatesFor(req.params.id);
            return ok(res, { candidates });
        } catch (error) {
            logError(req, 'Return-load lookup failed', error);
            return fail(res, {
                status: 500,
                code: 'ORDERS_RETURN_LOADS_FAILED',
                message: 'Could not look for a return load just now.',
            });
        }
    },

    getNearestDrivers: async (req, res) => {
        try {
            const { id } = req.params;

            // 1. Fetch the order's pickup geometry
            const orderCheck = await pool.query(
                `SELECT
                    id,
                    cargo_description,
                    COALESCE(pickup_geom, pickup_coordinates) AS pickup_geom,
                    status
                 FROM orders
                 WHERE id = $1;`,
                [id]
            );

            if (orderCheck.rows.length === 0) {
                return fail(res, {
                    status: 404,
                    code: 'ORDERS_NOT_FOUND',
                    message: 'Order not found.',
                });
            }

            const order = orderCheck.rows[0];

            // 2. Query active driver locations sorted by proximity to the pickup point
            const spatialMatchQuery = `
                SELECT 
                    dl.driver_name,
                    dl.lat AS current_lat,
                    dl.lng AS current_lng,
                    ST_DistanceSphere(dl.geom, $1) AS distance_meters,
                    EXTRACT(EPOCH FROM (NOW() - dl.updated_at)) AS cache_age_seconds
                FROM driver_locations dl
                -- Optional: filter out drivers currently on an active run if your schema tracks it
                ORDER BY dl.geom <-> $1 -- Knn index-assisted spatial sorting operator
                LIMIT 3;
            `;

            const driversResult = await pool.query(spatialMatchQuery, [order.pickup_geom]);

            const recommendations = driversResult.rows.map(driver => {
                const distanceKm = (parseFloat(driver.distance_meters) / 1000).toFixed(2);
                return {
                    driverName: driver.driver_name,
                    distanceFromPickupKm: parseFloat(distanceKm),
                    telemetryAgeSeconds: Math.round(driver.cache_age_seconds),
                    coordinates: { lat: driver.current_lat, lng: driver.current_lng }
                };
            });

            return ok(res, {
                orderId: order.id,
                cargo: order.cargo_description,
                status: order.status,
                recommendedDrivers: recommendations
            });
        } catch (error) {
            logError(req, 'Spatial dispatch matcher failure', error);
            return fail(res, {
                status: 500,
                code: 'ORDERS_NEAREST_DRIVERS_FAILED',
                message: 'Failed to run spatial dispatch matching algorithms.',
            });
        }
    }
};