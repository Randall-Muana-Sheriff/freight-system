// controllers/routeController.js
import pool from '../config/db.js';
import { io } from '../server.js';
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

export const RouteController = {
    // Saved route snapshots, replayed on the History tab.
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

    saveRouteHistory: async (req, res) => {
        const { driverName, coordinates } = req.body;

        try {
            const normalizedPath = normalizeStoredRoutePath(coordinates);
            const result = await pool.query(
                `INSERT INTO completed_routes (vehicle_id, driver_name, geojson_path, aggregate_distance_km, total_demand, status)
                 VALUES ($1, $2, $3, $4, $5, 'SNAPSHOT') RETURNING *`,
                [1, driverName || 'Dispatcher Snapshot', JSON.stringify(normalizedPath), 0, 0]
            );

            toDispatch('routeUpdated', result.rows[0]);
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
    }
};