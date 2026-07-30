import pool from '../config/db.js';
import { io } from '../server.js';
import { ok, fail } from '../utils/httpResponse.js';

export const IncidentController = {
    // GET /api/incidents - dispatcher/admin view of driver-submitted reports.
    // Manual incidents share the geofence_alerts table with automated
    // boundary/speed breaches (see createIncident below), distinguished by
    // event_type, so this filters to just the driver-reported ones.
    getIncidents: async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT id, order_id, driver_name, description, status, resolved_by, resolved_at, created_at
                 FROM geofence_alerts
                 WHERE event_type = 'MANUAL_INCIDENT'
                 ORDER BY (status = 'OPEN') DESC, created_at DESC
                 LIMIT 100;`
            );
            return ok(res, result.rows);
        } catch (error) {
            console.error('Database Error:', error.message);
            return fail(res, {
                status: 500,
                code: 'INCIDENTS_FETCH_FAILED',
                message: 'Failed to read incident reports.',
            });
        }
    },

    // POST /api/incidents
    createIncident: async (req, res) => {
        try {
            const { orderId = null, title, description } = req.body || {};
            const driverName = req.user?.username;

            if (!driverName) {
                return fail(res, {
                    status: 400,
                    code: 'INCIDENT_DRIVER_MISSING',
                    message: 'Driver identity is missing in session token.',
                });
            }

            if (!title || !description) {
                return fail(res, {
                    status: 400,
                    code: 'INCIDENT_INVALID_PAYLOAD',
                    message: 'Both title and description are required.',
                });
            }

            const query = `
                INSERT INTO geofence_alerts (order_id, driver_name, event_type, distance_meters, description)
                VALUES ($1, $2, 'MANUAL_INCIDENT', 0, $3)
                RETURNING id, order_id, driver_name, event_type, description, status, resolved_by, resolved_at, created_at;
            `;

            const payload = `${title.trim()}\n\n${description.trim()}`;
            const result = await pool.query(query, [orderId, driverName, payload]);

            io.emit('incident:reported', result.rows[0]);

            return ok(res, result.rows[0], { status: 201 });
        } catch (error) {
            console.error('Database Error:', error.message);
            return fail(res, {
                status: 500,
                code: 'INCIDENT_CREATE_FAILED',
                message: 'Failed to store incident report.',
            });
        }
    },

    // PATCH /api/incidents/:id/status - dispatcher/admin marks a report as
    // acknowledged (seen, being handled) or resolved (closed out).
    updateIncidentStatus: async (req, res) => {
        const ALLOWED_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'];
        try {
            const { id } = req.params;
            const { status } = req.body || {};

            if (typeof status !== 'string' || !ALLOWED_STATUSES.includes(status.toUpperCase())) {
                return fail(res, {
                    status: 400,
                    code: 'INCIDENT_INVALID_STATUS',
                    message: `Status must be one of: ${ALLOWED_STATUSES.join(', ')}.`,
                });
            }
            const normalizedStatus = status.toUpperCase();
            const isResolved = normalizedStatus === 'RESOLVED';

            const result = await pool.query(
                `UPDATE geofence_alerts
                 SET status = $1,
                     resolved_by = CASE WHEN $2 THEN $3 ELSE resolved_by END,
                     resolved_at = CASE WHEN $2 THEN NOW() ELSE resolved_at END
                 WHERE id = $4 AND event_type = 'MANUAL_INCIDENT'
                 RETURNING id, order_id, driver_name, description, status, resolved_by, resolved_at, created_at;`,
                [normalizedStatus, isResolved, req.user?.username || 'System', id]
            );

            if (result.rows.length === 0) {
                return fail(res, { status: 404, code: 'INCIDENT_NOT_FOUND', message: 'Incident report not found.' });
            }

            io.emit('incident:status-updated', result.rows[0]);

            return ok(res, result.rows[0]);
        } catch (error) {
            console.error('Database Error:', error.message);
            return fail(res, {
                status: 500,
                code: 'INCIDENT_STATUS_UPDATE_FAILED',
                message: 'Failed to update incident status.',
            });
        }
    },
};
