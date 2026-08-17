// Multi-stop runs: one driver, one vehicle, an ordered sequence of stops
// drawn from real orders.
//
// The organising rule is that stops drive order status, never the other way
// round. Completing a PICKUP stop puts its order into PICKED_UP; completing
// a DROP puts it into DELIVERED. Everything downstream that already watches
// orders — the customer's tracking page, order_status_logs, the dispatch
// queue, the socket feed — therefore keeps working untouched, and there is
// exactly one place where an order's state can change as a result of work
// in the field.
//
// The alternative (a parallel status on the stop that dispatch reads
// instead) is how the old delivery_stops table ended up being a drawing
// nobody could act on.
import pool from '../config/db.js';
import { io } from '../server.js';
import { ok, fail } from '../utils/httpResponse.js';
import { appendAuditLog } from '../services/auditLogService.js';
import { sendPushToUser } from '../services/pushNotificationService.js';
import { logError } from '../utils/logger.js';
import { sequenceStops, plannedDistanceMetres } from '../utils/routeSequencing.js';

const STOP_KINDS = ['PICKUP', 'DROP'];
const OPEN_STOP_STATUSES = ['PENDING', 'ARRIVED'];
const TERMINAL_STOP_STATUSES = ['DONE', 'FAILED', 'SKIPPED'];
const DRIVER_STOP_TRANSITIONS = ['ARRIVED', 'DONE', 'FAILED', 'SKIPPED'];

// Which order status a completed stop implies. A pickup that is done means
// the cargo is on the vehicle; a drop that is done means it has arrived.
const STOP_COMPLETION_ORDER_STATUS = { PICKUP: 'PICKED_UP', DROP: 'DELIVERED' };

// Orders already finished or cancelled cannot be planned onto a run, and
// neither can an order with no cargo left to move.
const PLANNABLE_ORDER_STATUSES = ['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED'];

async function loadTrip(client, tripId) {
    const trip = await client.query(
        `SELECT t.*, u.full_name AS driver_full_name
           FROM trips t
           LEFT JOIN users u ON u.username = t.driver_username
          WHERE t.id = $1`,
        [tripId]
    );
    if (!trip.rows[0]) return null;

    const stops = await client.query(
        `SELECT s.id, s.order_id, s.kind, s.sequence, s.lat, s.lng, s.address_text,
                s.status, s.failure_reason, s.arrived_at, s.completed_at,
                o.cargo_description, o.weight_kg, o.status AS order_status,
                o.customer_name, o.customer_phone, o.recipient_name, o.recipient_phone,
                o.special_instructions, o.tracking_token, o.priority
           FROM trip_stops s
           JOIN orders o ON o.id = s.order_id
          WHERE s.trip_id = $1
          ORDER BY s.sequence ASC`,
        [tripId]
    );

    const done = stops.rows.filter((s) => TERMINAL_STOP_STATUSES.includes(s.status)).length;
    return {
        ...trip.rows[0],
        stops: stops.rows,
        stopCount: stops.rows.length,
        completedStopCount: done,
        // The stop a driver is on right now, which is what both the run
        // screen and the dispatcher's progress column want.
        currentStop: stops.rows.find((s) => OPEN_STOP_STATUSES.includes(s.status)) || null,
    };
}

// Where the driver is, if the fix is recent enough to plan from; otherwise
// the first stop's own position, so an unstarted run still sequences.
async function startingPoint(client, driverUsername, fallback) {
    if (!driverUsername) return fallback;
    const result = await client.query(
        `SELECT lat, lng FROM driver_locations
          WHERE driver_name = $1 AND updated_at > NOW() - INTERVAL '10 minutes'`,
        [driverUsername]
    );
    return result.rows[0] || fallback;
}

export const TripController = {
    // POST /api/trips — plan a run from existing orders.
    createTrip: async (req, res) => {
        const client = await pool.connect();
        try {
            const { orderIds, driverUsername = null, vehicleId = null } = req.body || {};
            if (!Array.isArray(orderIds) || orderIds.length === 0) {
                return fail(res, { status: 400, code: 'TRIP_NO_ORDERS', message: 'Pick at least one order for this run.' });
            }
            const ids = [...new Set(orderIds.map(Number).filter(Number.isInteger))];
            if (ids.length !== orderIds.length) {
                return fail(res, { status: 400, code: 'TRIP_BAD_ORDER_IDS', message: 'Order list contains duplicates or invalid ids.' });
            }

            await client.query('BEGIN');

            const orders = await client.query(
                `SELECT id, status, pickup_lat, pickup_lng, delivery_lat, delivery_lng,
                        pickup_address_text, delivery_address_text, origin_hub_name
                   FROM orders WHERE id = ANY($1::int[]) FOR UPDATE`,
                [ids]
            );
            if (orders.rows.length !== ids.length) {
                await client.query('ROLLBACK');
                return fail(res, { status: 404, code: 'TRIP_ORDER_NOT_FOUND', message: 'One or more of those orders no longer exists.' });
            }
            const unplannable = orders.rows.filter((o) => !PLANNABLE_ORDER_STATUSES.includes(o.status));
            if (unplannable.length) {
                await client.query('ROLLBACK');
                return fail(res, {
                    status: 409,
                    code: 'TRIP_ORDER_NOT_PLANNABLE',
                    message: `Order ${unplannable[0].id} is ${unplannable[0].status} and cannot be added to a run.`,
                });
            }

            const trip = await client.query(
                `INSERT INTO trips (driver_username, vehicle_id, created_by) VALUES ($1, $2, $3) RETURNING *`,
                [driverUsername, vehicleId, req.user?.username || 'System']
            );
            const tripId = trip.rows[0].id;

            // A pickup is only planned if the cargo is not already aboard —
            // re-collecting something the driver picked up this morning is
            // not a stop, it is a wrong turn.
            const draft = [];
            for (const order of orders.rows) {
                const alreadyCollected = ['PICKED_UP', 'IN_TRANSIT', 'ARRIVED'].includes(order.status);
                if (!alreadyCollected) {
                    draft.push({
                        order_id: order.id,
                        kind: 'PICKUP',
                        lat: order.pickup_lat,
                        lng: order.pickup_lng,
                        address_text: order.pickup_address_text || order.origin_hub_name,
                        status: 'PENDING',
                    });
                }
                draft.push({
                    order_id: order.id,
                    kind: 'DROP',
                    lat: order.delivery_lat,
                    lng: order.delivery_lng,
                    address_text: order.delivery_address_text,
                    status: 'PENDING',
                });
            }

            const start = await startingPoint(client, driverUsername, draft[0]);
            const ordered = sequenceStops(draft, start);

            for (let i = 0; i < ordered.length; i++) {
                const stop = ordered[i];
                try {
                    await client.query(
                        `INSERT INTO trip_stops (trip_id, order_id, kind, sequence, lat, lng, address_text)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [tripId, stop.order_id, stop.kind, i + 1, stop.lat, stop.lng, stop.address_text]
                    );
                } catch (err) {
                    if (err.code === '23505') {
                        await client.query('ROLLBACK');
                        return fail(res, {
                            status: 409,
                            code: 'TRIP_ORDER_ALREADY_PLANNED',
                            message: `Order ${stop.order_id} is already on another live run. Remove it from that run first.`,
                        });
                    }
                    throw err;
                }
            }

            await client.query(
                `UPDATE trips SET planned_distance_m = $2, updated_at = NOW() WHERE id = $1`,
                [tripId, plannedDistanceMetres(ordered, start)]
            );

            // Assigning the run assigns its orders, so the existing queue and
            // the driver's own job list agree with it rather than showing the
            // same work twice under two different owners.
            if (driverUsername) {
                await client.query(
                    `UPDATE orders SET assigned_to = $2, status = CASE WHEN status = 'PENDING' THEN 'ASSIGNED' ELSE status END,
                            updated_at = NOW()
                      WHERE id = ANY($1::int[])`,
                    [ids, driverUsername]
                );
            }

            const full = await loadTrip(client, tripId);
            await client.query('COMMIT');

            await appendAuditLog({
                actionType: 'TRIP_CREATED',
                description: `Run #${tripId} planned with ${full.stopCount} stops across ${ids.length} orders${driverUsername ? ` for ${driverUsername}` : ''}`,
                username: req.user?.username || 'System',
            });
            io.emit('trip:updated', { tripId, status: full.status });
            if (driverUsername) {
                sendPushToUser(driverUsername, {
                    title: 'New run assigned',
                    body: `${full.stopCount} stops. Open the app to see the sequence.`,
                    data: { type: 'trip', tripId: String(tripId) },
                }).catch(() => {});
            }

            return ok(res, full, { status: 201 });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            logError(req, 'Create trip failed', error);
            return fail(res, { status: 500, code: 'TRIP_CREATE_FAILED', message: 'Could not plan that run.' });
        } finally {
            client.release();
        }
    },

    // GET /api/trips — dispatcher list.
    listTrips: async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT t.id, t.driver_username, t.vehicle_id, t.status, t.planned_distance_m,
                        t.created_at, t.started_at, t.completed_at,
                        u.full_name AS driver_full_name,
                        COUNT(s.id)::int AS stop_count,
                        COUNT(s.id) FILTER (WHERE s.status IN ('DONE','FAILED','SKIPPED'))::int AS completed_stop_count,
                        COUNT(s.id) FILTER (WHERE s.status = 'FAILED')::int AS failed_stop_count
                   FROM trips t
                   LEFT JOIN users u ON u.username = t.driver_username
                   LEFT JOIN trip_stops s ON s.trip_id = t.id
                  WHERE t.status <> 'CANCELLED'
                  GROUP BY t.id, u.full_name
                  ORDER BY CASE t.status WHEN 'ACTIVE' THEN 0 WHEN 'PLANNED' THEN 1 ELSE 2 END, t.created_at DESC
                  LIMIT 100`
            );
            return ok(res, result.rows);
        } catch (error) {
            logError(req, 'List trips failed', error);
            return fail(res, { status: 500, code: 'TRIPS_FETCH_FAILED', message: 'Could not load runs.' });
        }
    },

    // GET /api/trips/:id
    getTrip: async (req, res) => {
        const client = await pool.connect();
        try {
            const trip = await loadTrip(client, Number(req.params.id));
            if (!trip) return fail(res, { status: 404, code: 'TRIP_NOT_FOUND', message: 'Run not found.' });
            return ok(res, trip);
        } catch (error) {
            logError(req, 'Get trip failed', error);
            return fail(res, { status: 500, code: 'TRIP_FETCH_FAILED', message: 'Could not load that run.' });
        } finally {
            client.release();
        }
    },

    // GET /api/trips/mine — the driver's own run.
    getMyTrip: async (req, res) => {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT id FROM trips
                  WHERE driver_username = $1 AND status IN ('ACTIVE', 'PLANNED')
                  ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END, created_at ASC
                  LIMIT 1`,
                [req.user?.username]
            );
            if (!result.rows[0]) return ok(res, null);
            return ok(res, await loadTrip(client, result.rows[0].id));
        } catch (error) {
            logError(req, 'Get my trip failed', error);
            return fail(res, { status: 500, code: 'TRIP_FETCH_FAILED', message: 'Could not load your run.' });
        } finally {
            client.release();
        }
    },

    // POST /api/trips/:id/optimise — re-sequence the stops still open.
    optimiseTrip: async (req, res) => {
        const client = await pool.connect();
        try {
            const tripId = Number(req.params.id);
            await client.query('BEGIN');
            const trip = await client.query(`SELECT * FROM trips WHERE id = $1 FOR UPDATE`, [tripId]);
            if (!trip.rows[0]) {
                await client.query('ROLLBACK');
                return fail(res, { status: 404, code: 'TRIP_NOT_FOUND', message: 'Run not found.' });
            }

            const stops = await client.query(
                `SELECT id, order_id, kind, sequence, lat, lng, status FROM trip_stops WHERE trip_id = $1 ORDER BY sequence`,
                [tripId]
            );
            // Stops already visited keep their place in history — only what
            // is still ahead of the driver gets re-ordered.
            const settled = stops.rows.filter((s) => TERMINAL_STOP_STATUSES.includes(s.status));
            const open = stops.rows.filter((s) => OPEN_STOP_STATUSES.includes(s.status));
            if (open.length < 2) {
                await client.query('ROLLBACK');
                return fail(res, { status: 409, code: 'TRIP_NOTHING_TO_OPTIMISE', message: 'There are fewer than two stops left to re-order.' });
            }

            const start = await startingPoint(client, trip.rows[0].driver_username, settled[settled.length - 1] || open[0]);
            const ordered = [...settled, ...sequenceStops(open, start)];
            for (let i = 0; i < ordered.length; i++) {
                await client.query(`UPDATE trip_stops SET sequence = $2 WHERE id = $1`, [ordered[i].id, i + 1]);
            }
            await client.query(
                `UPDATE trips SET planned_distance_m = $2, updated_at = NOW() WHERE id = $1`,
                [tripId, plannedDistanceMetres(ordered, start)]
            );

            const full = await loadTrip(client, tripId);
            await client.query('COMMIT');
            io.emit('trip:updated', { tripId, status: full.status });
            return ok(res, full);
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            logError(req, 'Optimise trip failed', error);
            return fail(res, { status: 500, code: 'TRIP_OPTIMISE_FAILED', message: 'Could not re-order that run.' });
        } finally {
            client.release();
        }
    },

    // PATCH /api/trips/:id/sequence — the dispatcher's own ordering wins.
    reorderTrip: async (req, res) => {
        const client = await pool.connect();
        try {
            const tripId = Number(req.params.id);
            const { stopIds } = req.body || {};
            if (!Array.isArray(stopIds) || stopIds.length === 0) {
                return fail(res, { status: 400, code: 'TRIP_NO_SEQUENCE', message: 'Send the stop ids in the order you want them.' });
            }

            await client.query('BEGIN');
            const existing = await client.query(`SELECT id FROM trip_stops WHERE trip_id = $1`, [tripId]);
            const known = new Set(existing.rows.map((r) => r.id));
            const requested = stopIds.map(Number);
            // Every stop, exactly once. A partial list would silently leave
            // stops holding stale sequence numbers and two stops claiming
            // the same position.
            if (requested.length !== known.size || requested.some((id) => !known.has(id)) || new Set(requested).size !== requested.length) {
                await client.query('ROLLBACK');
                return fail(res, { status: 400, code: 'TRIP_SEQUENCE_MISMATCH', message: 'Send every stop on the run exactly once.' });
            }

            for (let i = 0; i < requested.length; i++) {
                await client.query(`UPDATE trip_stops SET sequence = $2 WHERE id = $1`, [requested[i], i + 1]);
            }
            const full = await loadTrip(client, tripId);
            await client.query('COMMIT');

            await appendAuditLog({
                actionType: 'TRIP_RESEQUENCED',
                description: `Run #${tripId} re-ordered by hand`,
                username: req.user?.username || 'System',
            });
            io.emit('trip:updated', { tripId, status: full.status });
            return ok(res, full);
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            logError(req, 'Reorder trip failed', error);
            return fail(res, { status: 500, code: 'TRIP_REORDER_FAILED', message: 'Could not re-order that run.' });
        } finally {
            client.release();
        }
    },

    // PATCH /api/trips/:id — assign a driver, start it, or cancel it.
    updateTrip: async (req, res) => {
        const client = await pool.connect();
        try {
            const tripId = Number(req.params.id);
            const { driverUsername, vehicleId, status } = req.body || {};
            if (status && !['PLANNED', 'ACTIVE', 'CANCELLED'].includes(status)) {
                return fail(res, { status: 400, code: 'TRIP_INVALID_STATUS', message: 'Status must be PLANNED, ACTIVE or CANCELLED.' });
            }

            await client.query('BEGIN');
            const current = await client.query(`SELECT * FROM trips WHERE id = $1 FOR UPDATE`, [tripId]);
            if (!current.rows[0]) {
                await client.query('ROLLBACK');
                return fail(res, { status: 404, code: 'TRIP_NOT_FOUND', message: 'Run not found.' });
            }
            if (current.rows[0].status === 'COMPLETED') {
                await client.query('ROLLBACK');
                return fail(res, { status: 409, code: 'TRIP_ALREADY_COMPLETED', message: 'That run is already finished.' });
            }

            const nextDriver = driverUsername === undefined ? current.rows[0].driver_username : driverUsername;
            try {
                await client.query(
                    `UPDATE trips
                        SET driver_username = $2,
                            vehicle_id = COALESCE($3, vehicle_id),
                            status = COALESCE($4, status),
                            started_at = CASE WHEN $4 = 'ACTIVE' AND started_at IS NULL THEN NOW() ELSE started_at END,
                            updated_at = NOW()
                      WHERE id = $1`,
                    [tripId, nextDriver, vehicleId ?? null, status ?? null]
                );
            } catch (err) {
                if (err.code === '23505') {
                    await client.query('ROLLBACK');
                    return fail(res, {
                        status: 409,
                        code: 'TRIP_DRIVER_BUSY',
                        message: 'That driver already has a run in progress. Finish or cancel it first.',
                    });
                }
                throw err;
            }

            // Cancelling frees the orders so they can be planned onto another
            // run — otherwise the partial unique index would keep blocking
            // them forever on the strength of a run nobody is driving.
            if (status === 'CANCELLED') {
                await client.query(
                    `UPDATE trip_stops SET status = 'SKIPPED', failure_reason = COALESCE(failure_reason, 'Run cancelled')
                      WHERE trip_id = $1 AND status IN ('PENDING','ARRIVED')`,
                    [tripId]
                );
            }
            if (nextDriver) {
                await client.query(
                    `UPDATE orders SET assigned_to = $2,
                            status = CASE WHEN status = 'PENDING' THEN 'ASSIGNED' ELSE status END,
                            updated_at = NOW()
                      WHERE id IN (SELECT order_id FROM trip_stops WHERE trip_id = $1)`,
                    [tripId, nextDriver]
                );
            }

            const full = await loadTrip(client, tripId);
            await client.query('COMMIT');

            await appendAuditLog({
                actionType: 'TRIP_UPDATED',
                description: `Run #${tripId}${status ? ` set to ${status}` : ''}${driverUsername !== undefined ? ` assigned to ${driverUsername || 'nobody'}` : ''}`,
                username: req.user?.username || 'System',
            });
            io.emit('trip:updated', { tripId, status: full.status });
            return ok(res, full);
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            logError(req, 'Update trip failed', error);
            return fail(res, { status: 500, code: 'TRIP_UPDATE_FAILED', message: 'Could not update that run.' });
        } finally {
            client.release();
        }
    },

    // PATCH /api/trips/stops/:stopId — the driver working through the run.
    updateStop: async (req, res) => {
        const client = await pool.connect();
        try {
            const stopId = Number(req.params.stopId);
            const { status, failureReason } = req.body || {};
            if (!DRIVER_STOP_TRANSITIONS.includes(status)) {
                return fail(res, {
                    status: 400,
                    code: 'STOP_INVALID_STATUS',
                    message: `Status must be one of: ${DRIVER_STOP_TRANSITIONS.join(', ')}.`,
                });
            }
            const reason = typeof failureReason === 'string' ? failureReason.trim().slice(0, 500) : '';
            // A stop that did not happen has to say why. Without it dispatch
            // cannot tell a locked gate from a driver running out of time,
            // and those need opposite responses.
            if (['FAILED', 'SKIPPED'].includes(status) && !reason) {
                return fail(res, { status: 400, code: 'STOP_REASON_REQUIRED', message: 'Say what went wrong so dispatch can act on it.' });
            }

            await client.query('BEGIN');
            const stopResult = await client.query(
                `SELECT s.*, t.driver_username, t.status AS trip_status
                   FROM trip_stops s JOIN trips t ON t.id = s.trip_id
                  WHERE s.id = $1 FOR UPDATE OF s`,
                [stopId]
            );
            const stop = stopResult.rows[0];
            if (!stop) {
                await client.query('ROLLBACK');
                return fail(res, { status: 404, code: 'STOP_NOT_FOUND', message: 'Stop not found.' });
            }

            const role = String(req.user?.role || '').toLowerCase();
            const isOwner = String(stop.driver_username || '').toLowerCase() === String(req.user?.username || '').toLowerCase();
            if (role === 'driver' && !isOwner) {
                await client.query('ROLLBACK');
                return fail(res, { status: 403, code: 'STOP_FORBIDDEN', message: 'That stop is on another driver\'s run.' });
            }
            if (TERMINAL_STOP_STATUSES.includes(stop.status)) {
                await client.query('ROLLBACK');
                return fail(res, { status: 409, code: 'STOP_ALREADY_CLOSED', message: 'That stop is already finished.' });
            }

            await client.query(
                `UPDATE trip_stops
                    SET status = $2,
                        failure_reason = CASE WHEN $2 IN ('FAILED','SKIPPED') THEN $3 ELSE failure_reason END,
                        arrived_at = CASE WHEN $2 = 'ARRIVED' AND arrived_at IS NULL THEN NOW() ELSE arrived_at END,
                        completed_at = CASE WHEN $2 IN ('DONE','FAILED','SKIPPED') THEN NOW() ELSE completed_at END
                  WHERE id = $1`,
                [stopId, status, reason || null]
            );

            // Starting work on a run starts the run.
            if (stop.trip_status === 'PLANNED') {
                await client.query(
                    `UPDATE trips SET status = 'ACTIVE', started_at = COALESCE(started_at, NOW()), updated_at = NOW() WHERE id = $1`,
                    [stop.trip_id]
                );
            }

            // The one place field work changes an order's state.
            if (status === 'DONE') {
                const orderStatus = STOP_COMPLETION_ORDER_STATUS[stop.kind];
                const previous = await client.query(`SELECT status FROM orders WHERE id = $1 FOR UPDATE`, [stop.order_id]);
                if (previous.rows[0] && previous.rows[0].status !== orderStatus) {
                    await client.query(`UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1`, [stop.order_id, orderStatus]);
                    await client.query(
                        `INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by) VALUES ($1, $2, $3, $4)`,
                        [stop.order_id, previous.rows[0].status, orderStatus, req.user?.username || 'System']
                    );
                    io.emit('order:status-updated', {
                        orderId: stop.order_id,
                        status: orderStatus,
                        initiatedByDriver: role === 'driver',
                        timestamp: new Date().toISOString(),
                    });
                }
            }

            // A run with nothing open left is finished, whether every stop
            // succeeded or some failed — a driver should not have to close it
            // by hand, and a run left ACTIVE blocks their next one.
            const openLeft = await client.query(
                `SELECT COUNT(*)::int AS n FROM trip_stops WHERE trip_id = $1 AND status IN ('PENDING','ARRIVED')`,
                [stop.trip_id]
            );
            if (openLeft.rows[0].n === 0) {
                await client.query(
                    `UPDATE trips SET status = 'COMPLETED', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
                    [stop.trip_id]
                );
            }

            const full = await loadTrip(client, stop.trip_id);
            await client.query('COMMIT');

            if (['FAILED', 'SKIPPED'].includes(status)) {
                await appendAuditLog({
                    actionType: 'TRIP_STOP_FAILED',
                    description: `Stop ${stop.sequence} on run #${stop.trip_id} (order ${stop.order_id}) marked ${status}: ${reason}`,
                    username: req.user?.username || 'System',
                });
            }
            io.emit('trip:updated', { tripId: stop.trip_id, status: full.status });
            return ok(res, full);
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            logError(req, 'Update stop failed', error);
            return fail(res, { status: 500, code: 'STOP_UPDATE_FAILED', message: 'Could not update that stop.' });
        } finally {
            client.release();
        }
    },
};
