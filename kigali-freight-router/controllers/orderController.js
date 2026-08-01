// Order lifecycle routes are now backed by the full freight schema.
// The migration bundle creates the missing geometry, assignment, and audit
// tables that these controllers query.
import pool from '../config/db.js';
import { io } from '../server.js';
import { ok, fail } from '../utils/httpResponse.js';
import { sendPushToUser } from '../services/pushNotificationService.js';
import { uploadDeliveryPhoto, toSignedUrl } from '../config/r2Client.js';
import { isDriverVerified } from '../services/driverVerificationService.js';
import { logError } from '../utils/logger.js';
import { isValidLat, isValidLng, isValidWeightKg } from '../utils/validators.js';

const ALLOWED_ORDER_STATUSES = ['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'CANCELLED'];

// Drivers can move a job forward or confirm delivery, but cancelling an
// order is a dispatch decision — a driver who can't complete a job reports
// it through the incident-report flow instead, and a dispatcher/admin
// decides from there whether to cancel or reassign it.
const DRIVER_ALLOWED_STATUSES = ['PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'];

// Soft-flag threshold: a delivery confirmed more than this far from the
// order's recorded delivery point gets flagged for dispatcher review, but
// is still accepted — a stale/missing GPS fix or an imprecise drop pin
// shouldn't block a driver from closing out a real delivery.
const DELIVERY_LOCATION_FLAG_METERS = 500;

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
                    updated_at
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
                    delivery_lat
                FROM orders
                WHERE status = 'PENDING'
                ORDER BY id DESC;
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
                recipient_name, recipient_phone
            } = req.body;

            if (!origin_hub_id) {
                return fail(res, {
                    status: 400,
                    code: 'ORDERS_HUB_REQUIRED',
                    message: 'A pickup hub is required.',
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
                    pickup_coordinates,
                    delivery_coordinates,
                    pickup_geom,
                    delivery_geom
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
                    ST_SetSRID(ST_MakePoint($5, $6), 4326),
                    ST_SetSRID(ST_MakePoint($7, $8), 4326),
                    ST_SetSRID(ST_MakePoint($5, $6), 4326),
                    ST_SetSRID(ST_MakePoint($7, $8), 4326)
                )
                RETURNING id, cargo_description, status, weight_kg, origin_hub_name, pickup_lng, pickup_lat, delivery_lng, delivery_lat, recipient_name, recipient_phone;
            `;

            const result = await pool.query(query, [
                cargo_description, weight_kg, hub.id, hub.name,
                hub.lng, hub.lat, delivery_lng, delivery_lat,
                recipient_name || null, recipient_phone || null
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
            await client.query(logQuery, [id, previousStatus, normalizedStatus, userEmail]);

            await client.query('COMMIT');

            io.emit('order:status-updated', {
                orderId: updatedOrder.id,
                status: updatedOrder.status,
                cargo_description: updatedOrder.cargo_description,
                assignedTo,
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

            if (!req.file) {
                await client.query('ROLLBACK').catch(() => {});
                return fail(res, {
                    status: 400,
                    code: 'DELIVERY_PHOTO_REQUIRED',
                    message: 'A delivery confirmation photo is required.',
                });
            }

            await client.query('BEGIN');

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
            const photoKey = await uploadDeliveryPhoto({
                buffer: req.file.buffer,
                mimeType: req.file.mimetype,
                orderId: id,
            });

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
                `INSERT INTO delivery_confirmations (order_id, driver_name, photo_url, notes, distance_from_target_m, location_flagged)
                 VALUES ($1, $2, $3, $4, $5, $6);`,
                [id, driverName, photoKey, notes || null, distanceFromTargetM, locationFlagged]
            );

            const updateResult = await client.query(
                `UPDATE orders SET status = 'DELIVERED', updated_at = NOW() WHERE id = $1 RETURNING id, cargo_description, status;`,
                [id]
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
    getOrderById: async (req, res) => {
        try {
            const { id } = req.params;
            const query = `
                SELECT
                    id,
                    cargo_description,
                    status,
                    weight_kg,
                    origin_hub_name,
                    assigned_to,
                    pickup_lng,
                    pickup_lat,
                    delivery_lng,
                    delivery_lat,
                    recipient_name,
                    recipient_phone,
                    updated_at
                FROM orders
                WHERE id = $1;
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

            return ok(res, order);
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