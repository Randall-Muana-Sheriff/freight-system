import pool from '../config/db.js';
import { ok, fail, errorMessage } from '../utils/httpResponse.js';
import { dispatchExternalAlert, ALERT_CATEGORY } from '../services/alertDispatchService.js';

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
const ITEM_LABELS = Object.fromEntries(SAFETY_CHECKLIST_ITEMS.map((item) => [item.key, item.label]));

// Three states, not two. The old API took a boolean, so a driver who looked
// at the tyres and found them bad could only tick (a lie) or leave it blank
// (indistinguishable from not having looked). "fail" is the state that makes
// this an inspection rather than a formality, and it is the only one that
// produces anything downstream.
const VALID_RESULTS = new Set(['pass', 'fail', 'unchecked']);

// Two shapes of the same answer, because a build already on a driver's phone
// reads `items` and expects booleans.
//
// Storing the tri-state alone would have broken those quietly rather than
// loudly: 'unchecked' is a non-empty string, so `if (items[key])` is true for
// it, and an older app would have drawn an unchecked item as ticked. A
// checklist that lies in that direction is worse than one with two states.
//
// `items` stays boolean and means exactly what it used to — passed, or not.
// `results` carries the tri-state for clients that know about failures.
function toLegacyItems(results) {
    return Object.fromEntries(Object.entries(results || {}).map(([key, value]) => [key, value === 'pass']));
}

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
            const results = result.rows[0]?.items || {};
            return ok(res, { items: toLegacyItems(results), results });
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
        const { itemKey, checked, result: itemResult, note } = req.body || {};
        if (!VALID_ITEM_KEYS.has(itemKey)) {
            return fail(res, { status: 400, code: 'SAFETY_CHECKLIST_INVALID_ITEM', message: 'Unknown checklist item.' });
        }

        // `checked` is the old boolean shape. Accepted still, because an app
        // build already on a driver's phone speaks it and a checklist that
        // starts rejecting older clients is worse than one with two states.
        const resolved = itemResult !== undefined
            ? itemResult
            : typeof checked === 'boolean'
                ? (checked ? 'pass' : 'unchecked')
                : undefined;

        if (!VALID_RESULTS.has(resolved)) {
            return fail(res, {
                status: 400,
                code: 'SAFETY_CHECKLIST_INVALID_VALUE',
                message: '`result` must be pass, fail or unchecked.',
            });
        }
        try {
            const username = req.user?.username;
            const patch = JSON.stringify({ [itemKey]: resolved });
            // Which truck this driver is on. Recorded on the inspection so
            // the record says what was inspected, not merely who was holding
            // the phone.
            const vehicle = await pool.query(
                `SELECT fv.id FROM fleet_vehicles fv
                   JOIN users u ON u.id = fv.current_driver_id
                  WHERE u.username = $1 AND fv.status = 'ACTIVE'
                  LIMIT 1;`,
                [username]
            );
            const vehicleId = vehicle.rows[0]?.id ?? null;

            const result = await pool.query(
                `INSERT INTO driver_safety_checklists (driver_username, checklist_date, items, vehicle_id)
                 VALUES ($1, CURRENT_DATE, $2::jsonb, $3)
                 ON CONFLICT (driver_username, checklist_date)
                 DO UPDATE SET items = driver_safety_checklists.items || $2::jsonb,
                               vehicle_id = COALESCE(EXCLUDED.vehicle_id, driver_safety_checklists.vehicle_id),
                               updated_at = NOW()
                 RETURNING items;`,
                [username, patch, vehicleId]
            );

            // A failure is the whole point of the exercise. It becomes a
            // defect with a life of its own — open until somebody resolves
            // it, attached to the vehicle rather than to today's driver, and
            // on the same alert stream dispatch already watches. Everything
            // that makes this work (status lifecycle, resolved_by, photos,
            // Telegram) already existed for incidents; a defect is that,
            // pointed at a truck.
            let defectId = null;
            if (resolved === 'fail') {
                const label = ITEM_LABELS[itemKey] || itemKey;
                const detail = typeof note === 'string' && note.trim() ? ` — ${note.trim().slice(0, 300)}` : '';
                const inserted = await pool.query(
                    `INSERT INTO geofence_alerts
                       (driver_name, event_type, description, distance_meters, vehicle_id, created_at)
                     VALUES ($1, 'VEHICLE_DEFECT', $2, 0, $3, NOW())
                     RETURNING id;`,
                    [username, `Pre-departure check failed: ${label}${detail}`, vehicleId]
                );
                defectId = inserted.rows[0].id;

                // Fire-and-forget: a driver reporting a fault must not be
                // left waiting on Telegram, and a failed notification must
                // not lose the defect that is already safely in the table.
                dispatchExternalAlert(
                    `🔧 *VEHICLE DEFECT*\n\n*Check:* ${label}${detail}\n*Driver:* ${username}\n*Vehicle:* ${vehicleId ?? 'unassigned'}\n*Time:* ${new Date().toISOString()}`,
                    ALERT_CATEGORY.SYSTEM
                ).catch(() => {});
            }

            const results = result.rows[0].items;
            return ok(res, { items: toLegacyItems(results), results, defectId });
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'SAFETY_CHECKLIST_UPDATE_FAILED',
                message: errorMessage(error, 'Failed to update the safety checklist.'),
            });
        }
    },
};
