// controllers/routeController.js
import pool from '../config/db.js';
import { io } from '../server.js';
import { solveVRP } from '../services/vrpOptimizer.js';
import { appendAuditLog, describeDriver } from '../services/auditLogService.js';
import { ok, fail, errorMessage } from '../utils/httpResponse.js';
import { logError } from '../utils/logger.js';

function normalizeRouteCoordinates(routePath) {
    if (!routePath) return [];

    const parsedPath = typeof routePath === 'string' ? JSON.parse(routePath) : routePath;

    if (Array.isArray(parsedPath)) {
        return parsedPath
            .map((node) => {
                if (Array.isArray(node) && node.length >= 2) {
                    return [Number(node[0]), Number(node[1])];
                }

                if (node && typeof node === 'object' && node.lng !== undefined && node.lat !== undefined) {
                    return [Number(node.lng), Number(node.lat)];
                }

                return null;
            })
            .filter(Boolean);
    }

    if (parsedPath.type === 'LineString' && Array.isArray(parsedPath.coordinates)) {
        return parsedPath.coordinates.map(([lng, lat]) => [Number(lng), Number(lat)]);
    }

    if (Array.isArray(parsedPath.coordinates)) {
        return parsedPath.coordinates.map(([lng, lat]) => [Number(lng), Number(lat)]);
    }

    return [];
}

function normalizeStoredRoutePath(routePath) {
    return {
        type: 'LineString',
        coordinates: normalizeRouteCoordinates(routePath),
    };
}

// The VRP solver only ever compares Haversine (as-the-crow-flies) distances,
// so the sequence it returns has no relationship to actual roads. This asks
// OSRM's public routing server to snap that same stop sequence to the real
// road network purely for map display — it doesn't feed back into the
// solver's distance/capacity math, which still uses the Haversine totals
// already computed. Returns null (not a thrown error) on any failure, since
// a missing road overlay is a cosmetic degradation, not something that
// should fail the whole optimization request — the frontend already knows
// to fall back to a straight line between stops when this is absent.
async function fetchRoadGeometry(sequence) {
    if (!Array.isArray(sequence) || sequence.length < 2) return null;
    try {
        const coordsString = sequence.map((node) => `${node.lng},${node.lat}`).join(';');
        const response = await fetch(
            `http://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`
        );
        const data = await response.json();
        if (data.code !== 'Ok' || !data.routes?.[0]?.geometry?.coordinates) return null;
        // GeoJSON coordinates are [lng, lat]; Leaflet positions are [lat, lng].
        return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    } catch (err) {
        logError(null, 'Road geometry lookup failed, falling back to straight line', err);
        return null;
    }
}

export const RouteController = {
    // Fetch all committed routes
    getRoutes: async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM completed_routes ORDER BY id DESC');
            return ok(res, result.rows);
        } catch (err) {
            logError(req, 'Fetch routes failed', err);
            return fail(res, {
                status: 500,
                code: 'ROUTES_FETCH_FAILED',
                message: errorMessage(err, 'Failed to fetch routes.'),
            });
        }
    },

    // Handle VRP optimization calculations
    optimizeRoute: async (req, res) => {
        const { depot, vehicles, stops, vehicleCapacity } = req.body;
        // solveVRP reads depot.lat/lng immediately, so a missing depot threw
        // and surfaced as a 500 ("Cannot read properties of undefined") —
        // a client payload mistake reported as a server fault.
        const isPoint = (p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));
        if (!isPoint(depot)) {
            return fail(res, {
                status: 400,
                code: 'ROUTES_INVALID_PAYLOAD',
                message: 'A depot with numeric lat and lng is required.',
            });
        }
        if (!Array.isArray(stops) || !stops.every(isPoint)) {
            return fail(res, {
                status: 400,
                code: 'ROUTES_INVALID_PAYLOAD',
                message: 'Every stop must have a numeric lat and lng.',
            });
        }

        try {
            const solution = solveVRP({ depot, stops: stops || [], vehicleCapacity: Number(vehicleCapacity) || 100 });
            const routes = await Promise.all(solution.routes.map(async (route, index) => ({
                vehicleId: vehicles?.[index]?.id || vehicles?.[0]?.id || index + 1,
                sequence: route.sequence,
                totalDistanceKm: route.totalDistanceKm,
                totalLoad: route.totalLoad,
                roadGeometry: await fetchRoadGeometry(route.sequence),
            })));

            return ok(res, {
                routes,
                summary: solution.summary,
            });
        } catch (err) {
            logError(req, 'Optimization failed', err);
            return fail(res, {
                status: 500,
                code: 'ROUTES_OPTIMIZE_FAILED',
                message: errorMessage(err, 'Failed to optimize route.'),
            });
        }
    },

    saveRouteHistory: async (req, res) => {
        const { driverName, coordinates } = req.body;

        try {
            const normalizedPath = normalizeStoredRoutePath(coordinates);
            const result = await pool.query(
                `INSERT INTO completed_routes (vehicle_id, driver_name, geojson_path, aggregate_distance_km, total_demand, status)
                 VALUES ($1, $2, $3, $4, $5, 'SNAPSHOT') RETURNING *`,
                [1, driverName || 'Dispatcher Snapshot', JSON.stringify(normalizedPath), 0, 0]
            );

            io.emit('routeUpdated', result.rows[0]);
            await appendAuditLog({
                actionType: 'ROUTE_SAVED',
                description: `Saved route snapshot for ${driverName ? await describeDriver(driverName) : 'Dispatcher Snapshot'}`,
                username: req.user?.username || 'System',
            });
            return ok(res, { route: result.rows[0] });
        } catch (err) {
            logError(req, 'Route snapshot save failed', err);
            return fail(res, {
                status: 500,
                code: 'ROUTES_SNAPSHOT_SAVE_FAILED',
                message: errorMessage(err, 'Failed to save route snapshot.'),
            });
        }
    },

    // Direct, robust route commit handler
    commitRoute: async (req, res) => {
        const { vehicleId, driverName, geojsonPath, aggregateDistanceKm, totalDemand } = req.body;
        
        const parsedVehicleId = parseInt(vehicleId, 10) || 1;

        try {
            const normalizedPath = normalizeStoredRoutePath(geojsonPath);
            const result = await pool.query(
                `INSERT INTO completed_routes (vehicle_id, driver_name, geojson_path, aggregate_distance_km, total_demand, status) 
                 VALUES ($1, $2, $3, $4, $5, 'COMMITTED') RETURNING *`,
                [
                    parsedVehicleId, 
                    driverName || `Driver #${parsedVehicleId}`, 
                    JSON.stringify(normalizedPath),
                    aggregateDistanceKm || 0, 
                    totalDemand || 0
                ]
            );

            io.emit('routeUpdated', result.rows[0]);
            await appendAuditLog({
                actionType: 'ROUTE_COMMITTED',
                description: `Committed route for ${driverName ? await describeDriver(driverName) : `Driver #${parsedVehicleId}`}`,
                username: req.user?.username || 'System',
            });
            return ok(res, { route: result.rows[0] });
        } catch (err) {
            logError(req, 'Route commit failed', err);
            return fail(res, {
                status: 500,
                code: 'ROUTES_COMMIT_FAILED',
                message: errorMessage(err, 'Failed to commit route.'),
            });
        }
    }
};