// controllers/fleetController.js
//
// Fleet analytics and history routes are backed by the same migration bundle
// as the live telemetry engine: driver_locations, driver_location_history,
// geofence_alerts, and the augmented orders table.
import pool from '../config/db.js';
import { ok, fail } from '../utils/httpResponse.js';
import { telemetryQueue } from '../server.js';
import {
    getComplianceIssues as findComplianceIssues,
    EXPIRY_WARNING_DAYS,
} from '../services/driverVerificationService.js';
import { logError } from '../utils/logger.js';

export const FleetController = {
    // POST /api/fleet/telemetry — a driver's own device (background location
    // task or foreground app) reports its current position. This feeds the
    // exact same durable queue the Socket.io `driver:telemetry-push` event
    // uses, so geofence checks, live map broadcasts, and history persistence
    // all happen identically regardless of which transport delivered the ping.
    reportTelemetry: async (req, res) => {
        const { lat, lng, speedKmh } = req.body || {};
        if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
            return fail(res, {
                status: 400,
                code: 'TELEMETRY_INVALID_COORDINATES',
                message: 'lat and lng must both be finite numbers.',
            });
        }

        // Always derive the driver's identity from their verified JWT, never
        // from the request body — a client should never be able to report
        // telemetry on behalf of a different driver.
        const driverName = req.user?.username;
        if (!driverName) {
            return fail(res, {
                status: 401,
                code: 'TELEMETRY_MISSING_IDENTITY',
                message: 'Could not determine driver identity from session.',
            });
        }

        // Real GPS speed from the device, or null. The client already
        // converts m/s to km/h and applies a stationary deadband, so what
        // arrives is usable as-is.
        //
        // The fallback here used to be Math.floor(Math.random() * 46) + 40.
        // A driver whose phone reported no speed for a fix was assigned a
        // plausible-looking invention, which then fed the live map and the
        // geofence speed check. Unknown is a fact worth keeping.
        const currentVelocityKmh = typeof speedKmh === 'number' && Number.isFinite(speedKmh) && speedKmh >= 0
            ? Math.round(speedKmh)
            : null;

        try {
            await telemetryQueue.enqueue({
                driverName,
                lat,
                lng,
                timestamp: new Date().toISOString(),
                currentVelocityKmh,
            });
            return ok(res, { queued: true });
        } catch (error) {
            logError(req, 'Telemetry enqueue failed', error);
            return fail(res, {
                status: 500,
                code: 'TELEMETRY_ENQUEUE_FAILED',
                message: 'Failed to accept telemetry report.',
            });
        }
    },

    getLiveFleetStatus: async (req, res) => {
        try {
            const spatialQuery = `
                SELECT 
                    o.id AS order_id,
                    o.cargo_description,
                    o.assigned_to AS driver_name,
                    dl.lat AS current_driver_lat,
                    dl.lng AS current_driver_lng,
                    COALESCE(o.delivery_lat, ST_Y(COALESCE(o.delivery_geom, o.delivery_coordinates))) AS target_delivery_lat,
                    COALESCE(o.delivery_lng, ST_X(COALESCE(o.delivery_geom, o.delivery_coordinates))) AS target_delivery_lng,
                    -- Compute exact distance remaining using native PostGIS spatial matching
                    ST_DistanceSphere(dl.geom, COALESCE(o.delivery_geom, o.delivery_coordinates)) AS distance_meters,
                    -- Check telemetry freshness
                    EXTRACT(EPOCH FROM (NOW() - dl.updated_at)) AS telemetry_age_seconds
                FROM orders o
                INNER JOIN driver_locations dl ON o.assigned_to = dl.driver_name
                WHERE o.status = 'ASSIGNED'
                ORDER BY distance_meters ASC;
            `;

            const result = await pool.query(spatialQuery);

            const liveFleetReport = result.rows.map(row => {
                const distanceKm = (parseFloat(row.distance_meters) / 1000).toFixed(2);
                const averageSpeedKmH = 35; 
                const hoursRemaining = distanceKm / averageSpeedKmH;
                const minutesRemaining = Math.ceil(hoursRemaining * 60);

                return {
                    orderId: row.order_id,
                    cargo: row.cargo_description,
                    driver: row.driver_name,
                    currentLocation: { lat: row.current_driver_lat, lng: row.current_driver_lng },
                    destinationLocation: { lat: row.target_delivery_lat, lng: row.target_delivery_lng },
                    distanceRemainingKm: parseFloat(distanceKm),
                    estimatedMinutesArrival: minutesRemaining <= 0 ? 1 : minutesRemaining,
                    telemetryStatus: row.telemetry_age_seconds > 60 ? "STALE_SIGNAL" : "LIVE"
                };
            });

            return ok(res, {
                systemTime: new Date().toISOString(),
                activeFleetCount: liveFleetReport.length,
                fleetReport: liveFleetReport
            });
        } catch (error) {
            logError(req, 'Spatial analytics pipeline error', error);
            return fail(res, {
                status: 500,
                code: 'FLEET_LIVE_STATUS_FAILED',
                message: 'Failed to compile fleet telemetry matrix data.',
            });
        }
    },

    getDriverBreadcrumbs: async (req, res) => {
        try {
            const { driverName } = req.params;
            const hours = parseInt(req.query.hours) || 4;
            
            // Expert Edge Case: Default RDP tolerance to 0.0001 degrees (~11 meters in Kigali)
            const tolerance = parseFloat(req.query.tolerance) || 0.0001;

            const compressionQuery = `
                WITH spatial_collection AS (
                    -- Step 1: Aggregate individual pings into a chronological path
                                        SELECT ST_MakeLine(geom ORDER BY recorded_at) AS raw_trajectory
                    FROM driver_location_history
                    WHERE driver_name = $1 
                      AND recorded_at >= NOW() - (INTERVAL '1 hour' * $2::int)
                ),
                rdp_compression AS (
                    -- Step 2: Apply Ramer-Douglas-Peucker simplification
                    SELECT ST_Simplify(raw_trajectory, $3::float) AS simplified_trajectory
                    FROM spatial_collection
                )
                -- Step 3: Extract the surviving key vertices back to point structures
                SELECT 
                    ST_Y(dumped.geom) AS lat,
                    ST_X(dumped.geom) AS lng
                FROM rdp_compression,
                LATERAL ST_DumpPoints(simplified_trajectory) AS dumped;
            `;

            const result = await pool.query(compressionQuery, [driverName, hours, tolerance]);

            const dynamicTrail = result.rows.map(row => [
                parseFloat(row.lat),
                parseFloat(row.lng)
            ]);

            return ok(res, {
                driverName,
                algorithm: "Ramer-Douglas-Peucker (PostGIS ST_Simplify)",
                inputToleranceDegrees: tolerance,
                survivingPointsCount: dynamicTrail.length,
                trail: dynamicTrail
            });
        } catch (error) {
            logError(req, 'Downsampling engine crash', error);
            return fail(res, {
                status: 500,
                code: 'FLEET_BREADCRUMBS_FAILED',
                message: 'Failed to compress tracking trajectory.',
            });
        }
    },

    // Add this method to your existing FleetController object
    getFleetPerformanceReport: async (req, res) => {
        try {
            // Dwell time is measured from arrival to delivery confirmation.
            // "Arrival" was previously only ever the ARRIVED_AT_DESTINATION
            // geofence alert, which requires the driver's GPS to have
            // actually crossed that geofence at the right moment — a dead
            // zone or a backgrounded app at exactly the wrong time drops the
            // order out of this report entirely even though it delivered
            // fine and is fully visible everywhere else (stats, history,
            // recent deliveries). The driver's own ARRIVED status update
            // (order_status_logs) is a reliable fallback arrival timestamp
            // that doesn't depend on a geofence event ever firing, so a
            // delivered order now only drops out of this report if *neither*
            // signal exists at all.
            const analyticsQuery = `
            WITH arrival_times AS (
                SELECT DISTINCT ON (o.id)
                    o.id AS order_id,
                    o.assigned_to AS driver_name,
                    o.updated_at AS delivered_at,
                    COALESCE(ga.created_at, osl.changed_at) AS arrived_at
                FROM orders o
                LEFT JOIN geofence_alerts ga ON ga.order_id = o.id AND ga.event_type = 'ARRIVED_AT_DESTINATION'
                LEFT JOIN order_status_logs osl ON osl.order_id = o.id AND osl.new_status = 'ARRIVED'
                WHERE o.status = 'DELIVERED' AND o.assigned_to IS NOT NULL
                ORDER BY o.id, ga.created_at DESC NULLS LAST, osl.changed_at DESC NULLS LAST
            )
            SELECT
                driver_name,
                COUNT(*) AS total_completed_orders,

                -- 1. Average time spent waiting at the loading dock (Dwell Time)
                ROUND(AVG(EXTRACT(EPOCH FROM (delivered_at - arrived_at)) / 60)::numeric, 1) AS avg_dwell_minutes,

                -- 2. Max bottleneck duration recorded at a loading dock
                ROUND(MAX(EXTRACT(EPOCH FROM (delivered_at - arrived_at)) / 60)::numeric, 1) AS max_dwell_minutes
            FROM arrival_times
            WHERE arrived_at IS NOT NULL
            GROUP BY driver_name
            ORDER BY avg_dwell_minutes DESC;
        `;

            const result = await pool.query(analyticsQuery);

            return ok(res, {
                generatedAt: new Date().toISOString(),
                metricScope: "Completed Orders Turnaround Analysis",
                fleetMetrics: result.rows.map(row => ({
                    driverName: row.driver_name,
                    completedDeliveriesCount: parseInt(row.total_completed_orders, 10),
                    averageUnloadingDwellTimeMinutes: parseFloat(row.avg_dwell_minutes),
                    worstCaseDwellTimeMinutes: parseFloat(row.max_dwell_minutes)
                }))
            });
        } catch (error) {
            logError(req, 'Analytics engine failure', error);
            return fail(res, {
                status: 500,
                code: 'FLEET_PERFORMANCE_FAILED',
                message: 'Failed to compile fleet operational analytics reports.',
            });
        }
    },

    // GET /api/fleet/compliance - documents that have lapsed or are about to.
    //
    // Without this the expiry rule is worse than no rule from the office's
    // point of view: a driver available on Tuesday is simply gone on
    // Wednesday, with nothing on any screen saying why. This is the warning
    // that makes an expiry actionable instead of a trapdoor.
    getComplianceIssues: async (req, res) => {
        try {
            const days = Number(req.query.days);
            const issues = await findComplianceIssues(
                pool,
                Number.isFinite(days) && days > 0 && days <= 180 ? Math.floor(days) : EXPIRY_WARNING_DAYS
            );
            return ok(res, {
                warningDays: EXPIRY_WARNING_DAYS,
                expired: issues.filter((i) => i.expired),
                expiringSoon: issues.filter((i) => !i.expired),
            });
        } catch (error) {
            logError(req, 'Compliance expiry lookup failed', error);
            return fail(res, {
                status: 500,
                code: 'FLEET_COMPLIANCE_FAILED',
                message: 'Failed to check document expiry.',
            });
        }
    }
};
