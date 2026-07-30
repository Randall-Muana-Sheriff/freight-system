import pool from '../config/db.js';
import { ok, fail, errorMessage } from '../utils/httpResponse.js';

function validateHubPayload(body) {
    const { name, code, lat, lng } = body || {};
    if (typeof name !== 'string' || !name.trim()) {
        return { error: 'Hub name is required.' };
    }
    if (typeof code !== 'string' || !code.trim()) {
        return { error: 'Hub code is required.' };
    }
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
        return { error: 'A valid pickup location (lat/lng) is required — pick one on the map.' };
    }
    return { name: name.trim(), code: code.trim().toUpperCase(), lat: parsedLat, lng: parsedLng };
}

export const HubController = {
    // GET /api/hubs - static dispatch/collection nodes, used to pre-fill
    // pickup coordinates when creating an order rather than making a
    // dispatcher type lat/lng by hand.
    getHubs: async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT id, name, code, ST_Y(coordinates) AS lat, ST_X(coordinates) AS lng
                 FROM hubs
                 ORDER BY name;`
            );
            return ok(res, result.rows);
        } catch (error) {
            console.error('Database Error:', error.message);
            return fail(res, {
                status: 500,
                code: 'HUBS_FETCH_FAILED',
                message: 'Failed to read hubs.',
            });
        }
    },

    // POST /api/hubs - previously hubs only ever existed via a one-time
    // hardcoded seed in the migration script; there was no way to add a
    // new one without a direct database edit.
    createHub: async (req, res) => {
        const parsed = validateHubPayload(req.body);
        if (parsed.error) {
            return fail(res, { status: 400, code: 'HUB_INVALID_PAYLOAD', message: parsed.error });
        }

        try {
            const result = await pool.query(
                `INSERT INTO hubs (name, code, coordinates)
                 VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326))
                 RETURNING id, name, code, ST_Y(coordinates) AS lat, ST_X(coordinates) AS lng;`,
                [parsed.name, parsed.code, parsed.lng, parsed.lat]
            );
            return ok(res, result.rows[0], { status: 201 });
        } catch (error) {
            if (error.code === '23505') {
                return fail(res, { status: 400, code: 'HUB_DUPLICATE', message: 'A hub with that name or code already exists.' });
            }
            return fail(res, { status: 500, code: 'HUB_CREATE_FAILED', message: errorMessage(error, 'Failed to create hub.') });
        }
    },

    // PATCH /api/hubs/:id
    updateHub: async (req, res) => {
        const { id } = req.params;
        const parsed = validateHubPayload(req.body);
        if (parsed.error) {
            return fail(res, { status: 400, code: 'HUB_INVALID_PAYLOAD', message: parsed.error });
        }

        try {
            const result = await pool.query(
                `UPDATE hubs
                 SET name = $1, code = $2, coordinates = ST_SetSRID(ST_MakePoint($3, $4), 4326)
                 WHERE id = $5
                 RETURNING id, name, code, ST_Y(coordinates) AS lat, ST_X(coordinates) AS lng;`,
                [parsed.name, parsed.code, parsed.lng, parsed.lat, id]
            );
            if (result.rows.length === 0) {
                return fail(res, { status: 404, code: 'HUB_NOT_FOUND', message: 'Hub not found.' });
            }
            return ok(res, result.rows[0]);
        } catch (error) {
            if (error.code === '23505') {
                return fail(res, { status: 400, code: 'HUB_DUPLICATE', message: 'A hub with that name or code already exists.' });
            }
            return fail(res, { status: 500, code: 'HUB_UPDATE_FAILED', message: errorMessage(error, 'Failed to update hub.') });
        }
    },

    // DELETE /api/hubs/:id - orders.origin_hub_id is ON DELETE RESTRICT, so
    // Postgres itself refuses to delete a hub that any order (past or
    // present) has ever used as a pickup point — this just turns that raw
    // FK violation into a clear message instead of a generic 500.
    deleteHub: async (req, res) => {
        const { id } = req.params;
        try {
            const result = await pool.query('DELETE FROM hubs WHERE id = $1 RETURNING id;', [id]);
            if (result.rows.length === 0) {
                return fail(res, { status: 404, code: 'HUB_NOT_FOUND', message: 'Hub not found.' });
            }
            return ok(res, { message: 'Hub deleted.' });
        } catch (error) {
            if (error.code === '23503') {
                return fail(res, {
                    status: 409,
                    code: 'HUB_HAS_ORDER_HISTORY',
                    message: 'This hub has order history and can\'t be deleted.',
                });
            }
            return fail(res, { status: 500, code: 'HUB_DELETE_FAILED', message: errorMessage(error, 'Failed to delete hub.') });
        }
    },
};
