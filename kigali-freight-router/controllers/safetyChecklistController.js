import pool from '../config/db.js';
import { ok, fail, errorMessage } from '../utils/httpResponse.js';

// The canonical item list lives here, in application code, not as columns
// on the table — items is a flexible JSONB map (see
// migrations/add_driver_safety_checklists.sql), so adding, renaming, or
// reordering a check later never needs a migration, just a code change on
// both sides (this file and SafetyChecklistCard.tsx).
export const SAFETY_CHECKLIST_ITEMS = [
    { key: 'seatbelt', label: 'Seatbelt fastened' },
    { key: 'mirrorsLights', label: 'Mirrors & lights checked' },
    { key: 'tyres', label: 'Tyre condition & pressure checked' },
    { key: 'cargo', label: 'Cargo secured' },
    { key: 'fatigue', label: 'Rested and fit to drive' },
];

const VALID_ITEM_KEYS = new Set(SAFETY_CHECKLIST_ITEMS.map((item) => item.key));

export const SafetyChecklistController = {
    // GET /api/driver-safety-checklist/today - never auto-creates a row;
    // a driver who hasn't touched anything today just gets everything
    // back unchecked, same as if a row existed with an empty items map.
    getTodayChecklist: async (req, res) => {
        try {
            const username = req.user?.username;
            const result = await pool.query(
                `SELECT items FROM driver_safety_checklists
                 WHERE driver_username = $1 AND checklist_date = CURRENT_DATE;`,
                [username]
            );
            return ok(res, { items: result.rows[0]?.items || {} });
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'SAFETY_CHECKLIST_FETCH_FAILED',
                message: errorMessage(error, 'Failed to load today’s safety checklist.'),
            });
        }
    },

    // PATCH /api/driver-safety-checklist/today - toggles one item at a
    // time. The jsonb `||` merge only touches the one key being sent, so
    // two rapid taps on different items can never clobber each other the
    // way a read-modify-write from the client would.
    updateChecklistItem: async (req, res) => {
        const { itemKey, checked } = req.body || {};
        if (!VALID_ITEM_KEYS.has(itemKey)) {
            return fail(res, { status: 400, code: 'SAFETY_CHECKLIST_INVALID_ITEM', message: 'Unknown checklist item.' });
        }
        if (typeof checked !== 'boolean') {
            return fail(res, { status: 400, code: 'SAFETY_CHECKLIST_INVALID_VALUE', message: '`checked` must be true or false.' });
        }
        try {
            const username = req.user?.username;
            const patch = JSON.stringify({ [itemKey]: checked });
            const result = await pool.query(
                `INSERT INTO driver_safety_checklists (driver_username, checklist_date, items)
                 VALUES ($1, CURRENT_DATE, $2::jsonb)
                 ON CONFLICT (driver_username, checklist_date)
                 DO UPDATE SET items = driver_safety_checklists.items || $2::jsonb, updated_at = NOW()
                 RETURNING items;`,
                [username, patch]
            );
            return ok(res, { items: result.rows[0].items });
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'SAFETY_CHECKLIST_UPDATE_FAILED',
                message: errorMessage(error, 'Failed to update the safety checklist.'),
            });
        }
    },
};
