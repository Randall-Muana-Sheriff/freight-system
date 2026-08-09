import { hashDelete, hashGet, hashGetAll, hashSet, listLength, listPopBatch, listPush } from './sharedState.js';
import { sendPushToUser } from './pushNotificationService.js';
import { getAssetLabelForDriver } from './alertDispatchService.js';

const DEFAULT_FLUSH_INTERVAL_MS = 250;
const DEFAULT_BATCH_SIZE = 100;

// Consumer GPS has a real accuracy floor — typically 3-10m even with clear
// sky view, worse indoors/near buildings from multipath reflections. A
// phone sitting dead still reports a slightly different fix on every read
// from that noise alone, which without this would make the dispatcher
// map marker visibly "wander" in a small radius. This mirrors the existing
// STATIONARY_SPEED_DEADBAND_KMH in the driver app's locationTracking.ts,
// which already does the same thing for the speed readout — this is the
// position equivalent. 15m sits comfortably above the noise floor while
// still catching a driver who's genuinely repositioning (e.g. pulling
// forward at a loading dock).
const POSITION_NOISE_FLOOR_METERS = 15;

function haversineMeters(lat1, lng1, lat2, lng2) {
    const EARTH_RADIUS_METERS = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

// Shared-state keys. When REDIS_URL is configured these back real Redis
// structures (a list for the durable queue, hashes for live state) so any
// number of app instances/processes share the same fleet view and no
// in-flight telemetry is lost on a process restart. Without Redis, these
// fall back to in-process storage via services/sharedState.js — correct for
// local dev/tests, but only ever valid for a single running instance.
const QUEUE_KEY = 'kigali:telemetry:queue';
export const FLEET_STATE_KEY = 'kigali:fleet:live-state';
const DRIVER_BREACHES_KEY = 'kigali:fleet:driver-breaches';
const DRIVER_STALE_KEY = 'kigali:fleet:driver-stale';

// Matches the staleness threshold fleetController.js/orderController.js's
// route-progress computation already use ("STALE_SIGNAL") — one definition
// of "how old is too old" for a GPS fix, reused here rather than inventing
// a second one.
const STALE_TELEMETRY_THRESHOLD_SECONDS = 60;
// How often to scan for drivers who've gone quiet mid-delivery. Independent
// of the telemetry flush loop above (which only runs when new pings
// arrive) — a driver whose phone died mid-job stops producing pings
// entirely, so nothing would ever re-check them without this separate
// timer.
const STALE_TELEMETRY_CHECK_INTERVAL_MS = 30_000;

// A driver's assigned vehicle (and its type) changes rarely, but this join
// would otherwise run on every single GPS ping (every ~250ms flush). A short
// TTL cache keeps the live map's marker shape correct within half a minute
// of a reassignment without adding a DB round-trip to the hot path, and
// without the cross-module coupling a real invalidation hook into
// adminController's assignVehicle would require.
const VEHICLE_TYPE_CACHE_TTL_MS = 30_000;

export function createTelemetryQueue({ pool, io, dispatchExternalAlert }) {
    let flushTimer = null;
    let draining = false;
    const staleCheckTimer = setInterval(() => {
        checkStaleTelemetry();
    }, STALE_TELEMETRY_CHECK_INTERVAL_MS);
    const vehicleTypeCache = new Map(); // driverName -> { vehicleType, expiresAt }

    async function getVehicleTypeForDriver(driverName) {
        const cached = vehicleTypeCache.get(driverName);
        if (cached && cached.expiresAt > Date.now()) return cached.vehicleType;

        const result = await pool.query(
            `SELECT fv.vehicle_type AS "vehicleType"
             FROM fleet_vehicles fv
             JOIN users u ON u.id = fv.current_driver_id
             WHERE u.username = $1
             LIMIT 1;`,
            [driverName]
        );
        const vehicleType = result.rows[0]?.vehicleType ?? null;
        vehicleTypeCache.set(driverName, { vehicleType, expiresAt: Date.now() + VEHICLE_TYPE_CACHE_TTL_MS });
        return vehicleType;
    }

    async function processTelemetryItem(item) {
        const { driverName, lat, lng, timestamp, currentVelocityKmh } = item;

        // Full-fidelity raw trail — deliberately never noise-filtered. This
        // is what the breadcrumbs feature simplifies (Ramer-Douglas-Peucker)
        // for playback, and it's the kind of record you'd want unfiltered
        // for any later audit/dispute — filtering noise out at write time
        // would be throwing away the very data a smoothing algorithm needs.
        await pool.query(
            `INSERT INTO driver_location_history (driver_name, lat, lng, geom, recorded_at)
             VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($3, $2), 4326), NOW())`,
            [driverName, lat, lng]
        );

        // "Current position" (driver_locations) is what the live map, ETA
        // calculations, and nearest-driver suggestions treat as ground
        // truth for "where is this driver right now" — this is the one
        // that should hide GPS noise. If the new fix is within the noise
        // floor of wherever they were already recorded, keep the existing
        // point and just refresh updated_at, so a stationary driver still
        // reads as freshly-online without their marker visibly drifting.
        const previousFix = await pool.query(`SELECT lat, lng FROM driver_locations WHERE driver_name = $1`, [driverName]);
        const previous = previousFix.rows[0];
        const movedMeters = previous ? haversineMeters(previous.lat, previous.lng, lat, lng) : Infinity;
        const displayLat = movedMeters > POSITION_NOISE_FLOOR_METERS ? lat : previous.lat;
        const displayLng = movedMeters > POSITION_NOISE_FLOOR_METERS ? lng : previous.lng;

        await pool.query(
            `INSERT INTO driver_locations (driver_name, lat, lng, geom, updated_at)
             VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($3, $2), 4326), NOW())
             ON CONFLICT (driver_name)
             DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, geom = EXCLUDED.geom, updated_at = NOW()`,
            [driverName, displayLat, displayLng]
        );

        const boundaryCheck = await pool.query(
            `SELECT id, name, speed_limit_kmh AS "speedLimitKmh" FROM geofences WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)) LIMIT 1;`,
            [lng, lat]
        );

        const activeZone = boundaryCheck.rows[0];
        const ongoingViolation = await hashGet(DRIVER_BREACHES_KEY, driverName);

        // Alerts previously always recorded order_id = null, even though the
        // schema has always had a real FK for it — there was just no lookup
        // wiring it up. Only needed on the (much rarer) state-transition
        // branches below, not on every single ping.
        async function currentActiveOrderId() {
            const activeOrder = await pool.query(
                `SELECT id FROM orders
                 WHERE assigned_to = $1 AND status NOT IN ('DELIVERED', 'CANCELLED')
                 ORDER BY updated_at DESC LIMIT 1;`,
                [driverName]
            );
            return activeOrder.rows[0]?.id ?? null;
        }

        if (activeZone) {
            const speedThreshold = activeZone.speedLimitKmh;
            const isSpeeding = currentVelocityKmh > speedThreshold;
            const violationType = isSpeeding ? 'SPEED_VIOLATION' : 'BOUNDARY_BREACH';
            const description = isSpeeding
                ? `Speed limit breach inside [${activeZone.name}]. Value: ${currentVelocityKmh} km/h (Limit: ${speedThreshold} km/h)`
                : `Unauthorized Zone Entry: [${activeZone.name}]`;

            if (!ongoingViolation || ongoingViolation.zoneName !== activeZone.name || ongoingViolation.type !== violationType) {
                await hashSet(DRIVER_BREACHES_KEY, driverName, { zoneName: activeZone.name, type: violationType, description });
                await pool.query(
                    `INSERT INTO geofence_alerts (order_id, driver_name, event_type, description, distance_meters, created_at)
                     VALUES ($1, $2, $3, $4, $5, NOW())`,
                    [await currentActiveOrderId(), driverName, violationType, description, 0]
                );

                const incidentPayload = {
                    id: `incident-${Date.now()}`,
                    driverName,
                    zoneName: activeZone.name,
                    type: violationType,
                    description,
                    enteredAt: timestamp,
                };

                io.emit('geofence:violation', incidentPayload);
                getAssetLabelForDriver(driverName)
                    .catch(() => driverName)
                    .then((assetLabel) => {
                        dispatchExternalAlert(
                            `🚨 *CRITICAL SAFETY INCIDENT* 🚨\n\n*Asset:* ${assetLabel}\n*Incident:* ${violationType}\n*Detail:* ${description}\n*Timestamp:* ${new Date(timestamp).toLocaleTimeString()}`
                        );
                    });
                // The dispatcher sees this via the socket broadcast above,
                // but the driver themselves has no live dashboard open —
                // a push notification is the only way they'd know in the
                // moment that they've tripped a safety violation.
                sendPushToUser(driverName, {
                    title: isSpeeding ? '⚠️ Speed limit exceeded' : '🚨 Restricted zone entered',
                    body: description,
                    data: { type: violationType, zoneName: activeZone.name },
                });
            }
        } else if (!activeZone && ongoingViolation) {
            await hashDelete(DRIVER_BREACHES_KEY, driverName);
            await pool.query(
                `INSERT INTO geofence_alerts (order_id, driver_name, event_type, description, distance_meters, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [await currentActiveOrderId(), driverName, 'ZONE_EXIT', `${driverName} exited ${ongoingViolation.zoneName}`, 0]
            );
            io.emit('geofence:exit', { driverName, zoneName: ongoingViolation.zoneName, exitedAt: timestamp });
            getAssetLabelForDriver(driverName)
                .catch(() => driverName)
                .then((assetLabel) => {
                    dispatchExternalAlert(`✅ *RESOLVED:* ${assetLabel} has safely departed the restricted perimeter.`);
                });
        }

        // Broadcast the same noise-filtered position written above — using
        // the raw fix here would still make the live map marker jitter even
        // though driver_locations itself no longer does.
        const vehicleType = await getVehicleTypeForDriver(driverName);
        const nextState = { driverName, lat: displayLat, lng: displayLng, velocityKmh: currentVelocityKmh, lastSeen: timestamp, vehicleType };
        await hashSet(FLEET_STATE_KEY, driverName, nextState);
        io.emit('driver:location-update', nextState);
    }

    // Finds every driver with an active (picked-up/in-transit/arrived) job
    // and how stale their last GPS fix is, then reconciles that against who
    // was already flagged stale last time this ran: newly-stale drivers get
    // a critical alert, previously-stale drivers whose signal is fresh
    // again get a resolved alert, and drivers whose job ended while
    // flagged just get quietly un-flagged (the job's over, there's nothing
    // to resolve). DISTINCT ON collapses to one row per driver in the rare
    // case of multiple active orders at once.
    async function checkStaleTelemetry() {
        try {
            const result = await pool.query(
                `SELECT DISTINCT ON (o.assigned_to)
                        o.assigned_to AS "driverName",
                        EXTRACT(EPOCH FROM (NOW() - dl.updated_at)) AS "telemetryAgeSeconds"
                 FROM orders o
                 JOIN driver_locations dl ON dl.driver_name = o.assigned_to
                 WHERE o.status IN ('PICKED_UP', 'IN_TRANSIT', 'ARRIVED')
                 ORDER BY o.assigned_to, o.updated_at DESC;`
            );

            const activeDrivers = new Map(result.rows.map((row) => [row.driverName, Number(row.telemetryAgeSeconds)]));
            const flaggedStale = await hashGetAll(DRIVER_STALE_KEY);

            for (const [driverName, ageSeconds] of activeDrivers) {
                const alreadyFlagged = Boolean(flaggedStale[driverName]);
                const isStale = ageSeconds > STALE_TELEMETRY_THRESHOLD_SECONDS;

                if (isStale && !alreadyFlagged) {
                    await hashSet(DRIVER_STALE_KEY, driverName, { since: Date.now() });
                    const assetLabel = await getAssetLabelForDriver(driverName).catch(() => driverName);
                    dispatchExternalAlert(
                        `📡 *SIGNAL LOST* 📡\n\n*Asset:* ${assetLabel}\n*Detail:* No GPS update for over ${Math.round(ageSeconds / 60)} min during an active delivery.\n*Timestamp:* ${new Date().toLocaleTimeString()}`
                    );
                } else if (!isStale && alreadyFlagged) {
                    await hashDelete(DRIVER_STALE_KEY, driverName);
                    const assetLabel = await getAssetLabelForDriver(driverName).catch(() => driverName);
                    dispatchExternalAlert(`✅ *RESOLVED:* ${assetLabel} is reporting GPS signal again.`);
                }
            }

            // Anyone flagged stale whose job isn't active anymore (delivered,
            // cancelled, reassigned) — clear silently, nothing to resolve.
            for (const driverName of Object.keys(flaggedStale)) {
                if (!activeDrivers.has(driverName)) {
                    await hashDelete(DRIVER_STALE_KEY, driverName);
                }
            }
        } catch (err) {
            console.error('❌ Stale-telemetry check failed:', err.message);
        }
    }

    async function flushQueue() {
        if (draining) return;
        draining = true;
        try {
            while ((await listLength(QUEUE_KEY)) > 0) {
                const batch = await listPopBatch(QUEUE_KEY, DEFAULT_BATCH_SIZE);
                for (const item of batch) {
                    try {
                        await processTelemetryItem(item);
                    } catch (err) {
                        console.error('❌ Telemetry item processing failed:', err.message);
                    }
                }
            }
        } finally {
            draining = false;
        }
    }

    function scheduleFlush() {
        if (flushTimer) return;
        flushTimer = setTimeout(async () => {
            flushTimer = null;
            await flushQueue();
            if ((await listLength(QUEUE_KEY)) > 0) scheduleFlush();
        }, DEFAULT_FLUSH_INTERVAL_MS);
    }

    async function enqueue(item) {
        try {
            await listPush(QUEUE_KEY, item);
        } catch (err) {
            console.error('❌ Failed to enqueue telemetry item:', err.message);
            return;
        }
        scheduleFlush();
    }

    async function shutdown() {
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
        clearInterval(staleCheckTimer);
        await flushQueue();
    }

    return {
        enqueue,
        shutdown,
        getDepth: () => listLength(QUEUE_KEY),
    };
}
