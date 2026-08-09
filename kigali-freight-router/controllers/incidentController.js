import pool from '../config/db.js';
import { io } from '../server.js';
import { ok, fail } from '../utils/httpResponse.js';
import { logError } from '../utils/logger.js';
import { uploadIncidentPhoto, toSignedUrl, assertRealFileType } from '../config/r2Client.js';
import { analyzeIncident } from '../services/incidentAnalysisService.js';
import { findNearestHub } from '../services/hubService.js';
import { sendPushToUser } from '../services/pushNotificationService.js';
import { appendAuditLog, describeDriver } from '../services/auditLogService.js';
import { dispatchExternalAlert, getAssetLabelForDriver } from '../services/alertDispatchService.js';

const SEVERITY_EMOJI = { high: '🚨', medium: '⚠️', low: 'ℹ️' };

const STATUS_PUSH_COPY = {
    ACKNOWLEDGED: { title: 'Report seen by dispatch', body: (label) => `Dispatch is looking into "${label}".` },
    RESOLVED: { title: 'Report resolved', body: (label) => `Your report "${label}" has been marked resolved.` },
};

// Mirrors the stage grouping the driver app's own trip screen already uses
// (STATUS_ORDER in trip/[id].tsx) — reused here purely for phrasing, not
// as a source of truth for order state.
function stagePhraseForStatus(status) {
    switch (String(status || '').toUpperCase()) {
        case 'ASSIGNED':
            return 'heading to pick up';
        case 'PICKED_UP':
        case 'IN_TRANSIT':
            return 'in transit with';
        case 'ARRIVED':
            return 'heading to deliver';
        default:
            return null;
    }
}

export const IncidentController = {
    // GET /api/incidents - dispatcher/admin view of driver-submitted reports.
    // Manual incidents share the geofence_alerts table with automated
    // boundary/speed breaches (see createIncident below), distinguished by
    // event_type, so this filters to just the driver-reported ones.
    // High-severity OPEN reports sort first, ahead of even more recent
    // low/medium ones — the point of triage is that a dispatcher scanning
    // the queue sees the dangerous one before the routine ones, not just
    // whatever came in most recently.
    getIncidents: async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT ga.id, ga.order_id, ga.driver_name, ga.description, ga.status, ga.resolved_by, ga.resolved_at, ga.created_at,
                        ga.photo_url, ga.lat, ga.lng, ga.severity, ga.ai_analysis AS "aiAnalysis",
                        o.cargo_description AS "orderCargoDescription", o.status AS "orderStatus"
                 FROM geofence_alerts ga
                 LEFT JOIN orders o ON o.id = ga.order_id
                 WHERE ga.event_type = 'MANUAL_INCIDENT'
                   -- Resolved reports drop off the live queue 30 minutes
                   -- after resolution — decluttering, not deletion: the row
                   -- itself is untouched and still fully queryable/exists
                   -- for history, it just stops competing for space in the
                   -- dispatcher's working view once it's no longer actionable.
                   AND (ga.status != 'RESOLVED' OR ga.resolved_at > NOW() - INTERVAL '30 minutes')
                 ORDER BY (ga.status = 'OPEN') DESC, (ga.severity = 'high') DESC, ga.created_at DESC
                 LIMIT 100;`
            );
            const rows = await Promise.all(result.rows.map(async (row) => ({ ...row, photo_url: await toSignedUrl(row.photo_url) })));
            return ok(res, rows);
        } catch (error) {
            logError(req, 'Database error', error);
            return fail(res, {
                status: 500,
                code: 'INCIDENTS_FETCH_FAILED',
                message: 'Failed to read incident reports.',
            });
        }
    },

    // GET /api/incidents/mine - a driver's own submitted reports and their
    // status. getIncidents (above) is the dispatcher/admin-only full queue
    // — a driver could POST a report but had no way to ever find out
    // whether anyone looked at it or what happened next.
    getMyIncidents: async (req, res) => {
        try {
            const driverName = req.user?.username;
            const result = await pool.query(
                `SELECT id, order_id, description, status, resolved_at, created_at, photo_url, severity
                 FROM geofence_alerts
                 WHERE event_type = 'MANUAL_INCIDENT' AND driver_name = $1
                 ORDER BY created_at DESC
                 LIMIT 50;`,
                [driverName]
            );
            const rows = await Promise.all(result.rows.map(async (row) => ({ ...row, photo_url: await toSignedUrl(row.photo_url) })));
            return ok(res, rows);
        } catch (error) {
            logError(req, 'Database error', error);
            return fail(res, {
                status: 500,
                code: 'INCIDENTS_MINE_FETCH_FAILED',
                message: 'Failed to read your incident reports.',
            });
        }
    },

    // POST /api/incidents — multipart (a photo is optional but, when
    // present, is the whole point of "photo-first" reporting: a driver who
    // just had something go wrong can submit with a photo alone and let
    // the AI draft the report, rather than composing a paragraph first).
    // Unlike document review's fire-and-forget analysis, this AWAITS the
    // AI call — the driver's own response needs real-time guidance
    // (nearest hub) and dispatch needs the severity signal immediately,
    // neither of which can happen after the response already went out.
    createIncident: async (req, res) => {
        try {
            const { orderId, title, description, lat: latRaw, lng: lngRaw } = req.body || {};
            const driverName = req.user?.username;
            const lat = latRaw !== undefined ? parseFloat(latRaw) : null;
            const lng = lngRaw !== undefined ? parseFloat(lngRaw) : null;

            if (!driverName) {
                return fail(res, {
                    status: 400,
                    code: 'INCIDENT_DRIVER_MISSING',
                    message: 'Driver identity is missing in session token.',
                });
            }

            const hasText = Boolean(description && description.trim());
            const hasPhoto = Boolean(req.file);
            if (!hasText && !hasPhoto) {
                return fail(res, {
                    status: 400,
                    code: 'INCIDENT_INVALID_PAYLOAD',
                    message: 'Describe what happened or attach a photo.',
                });
            }

            let photoKey = null;
            let realType = null;
            if (hasPhoto) {
                realType = assertRealFileType(req.file.buffer, ['image/jpeg', 'image/png']);
                photoKey = await uploadIncidentPhoto({ buffer: req.file.buffer, mimeType: realType });
            }

            // Derived server-side from a verified, owned order — never from
            // whatever the client claims — so the AI's "in transit with the
            // rice bags order" framing is always describing a job this
            // driver actually currently has, not an arbitrary id they sent.
            let orderContext = null;
            let verifiedOrderId = null;
            if (orderId) {
                const orderResult = await pool.query(
                    `SELECT id, cargo_description, status FROM orders WHERE id = $1 AND LOWER(assigned_to) = LOWER($2)`,
                    [orderId, driverName]
                );
                const order = orderResult.rows[0];
                if (order) {
                    verifiedOrderId = order.id;
                    const stage = stagePhraseForStatus(order.status);
                    if (stage) orderContext = { cargoDescription: order.cargo_description, stage };
                }
            }

            const analysis = await analyzeIncident({
                buffer: hasPhoto ? req.file.buffer : null,
                mimeType: realType,
                title,
                description,
                orderContext,
            });

            // The driver's own words always win when they gave any — the AI
            // only fills in for a title/description the driver skipped
            // (the photo-only path), never overwrites what they actually
            // wrote.
            const finalTitle = (title && title.trim()) || analysis?.suggestedTitle || 'Incident report';
            const finalDescription = (description && description.trim()) || analysis?.summary || '(No description provided — see attached photo.)';
            const payload = `${finalTitle}\n\n${finalDescription}`;

            const nearestHub = lat !== null && lng !== null ? await findNearestHub(lat, lng) : null;

            const result = await pool.query(
                `INSERT INTO geofence_alerts (order_id, driver_name, event_type, distance_meters, description, photo_url, lat, lng, severity, ai_analysis)
                 VALUES ($1, $2, 'MANUAL_INCIDENT', 0, $3, $4, $5, $6, $7, $8)
                 RETURNING id, order_id, driver_name, event_type, description, status, resolved_by, resolved_at, created_at, photo_url, lat, lng, severity, ai_analysis AS "aiAnalysis";`,
                [verifiedOrderId, driverName, payload, photoKey, lat, lng, analysis?.severity || null, analysis ? JSON.stringify(analysis) : null]
            );

            const incident = result.rows[0];
            io.emit('incident:reported', { ...incident, photo_url: await toSignedUrl(incident.photo_url) });

            // Fire-and-forget, same as the geofence/stale-signal alerts —
            // never delay the driver's own response waiting on Telegram.
            // Unlike those two, this is driver-initiated rather than
            // automatic, so it's the one alert category dispatch has no
            // other way to learn about except by having the dashboard open.
            const severity = (analysis?.severity || 'medium').toLowerCase();
            getAssetLabelForDriver(driverName)
                .catch(() => driverName)
                .then((assetLabel) => {
                    dispatchExternalAlert(
                        `${SEVERITY_EMOJI[severity] || 'ℹ️'} *DRIVER REPORTED INCIDENT* ${SEVERITY_EMOJI[severity] || 'ℹ️'}\n\n*Asset:* ${assetLabel}\n*Severity:* ${severity}\n*Report:* ${finalTitle}\n${finalDescription}\n*Timestamp:* ${new Date().toLocaleTimeString()}`
                    );
                });

            return ok(
                res,
                {
                    ...incident,
                    photo_url: await toSignedUrl(incident.photo_url),
                    nearestHub: nearestHub
                        ? { name: nearestHub.name, distanceKm: Math.round((nearestHub.distance_meters / 1000) * 10) / 10 }
                        : null,
                },
                { status: 201 }
            );
        } catch (error) {
            logError(req, 'Database error', error);
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

            const incident = result.rows[0];
            const reviewer = req.user?.username || 'System';
            const [reportTitle] = String(incident.description || '').split('\n\n');

            await appendAuditLog({
                actionType: `INCIDENT_${normalizedStatus}`,
                description: `${reviewer} marked ${await describeDriver(incident.driver_name)}'s report "${reportTitle}" as ${normalizedStatus.toLowerCase()}`,
                username: reviewer,
            });

            const pushCopy = STATUS_PUSH_COPY[normalizedStatus];
            if (pushCopy) {
                sendPushToUser(incident.driver_name, {
                    title: pushCopy.title,
                    body: pushCopy.body(reportTitle),
                    data: { type: 'incident-status', incidentId: String(incident.id) },
                });
            }

            io.emit('incident:status-updated', incident);

            return ok(res, incident);
        } catch (error) {
            logError(req, 'Database error', error);
            return fail(res, {
                status: 500,
                code: 'INCIDENT_STATUS_UPDATE_FAILED',
                message: 'Failed to update incident status.',
            });
        }
    },
};
