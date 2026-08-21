// Reading and superseding the rate card, so a price change does not need a
// developer and a deploy.
//
// Diesel is the reason this exists. RURA sets it nationally and it went from
// 1,757 to 2,927 RWF a litre in the twelve months to August 2026 -- three
// separate moves, any one of which left the card wrong until somebody edited
// SQL. An operator has to be able to follow that themselves, the day it moves.
import pool from '../config/db.js';
import { ok, fail } from '../utils/httpResponse.js';
import { logError } from '../utils/logger.js';
import { listCurrentRates } from '../services/pricingRepository.js';
import { quote, PricingError } from '../services/pricingService.js';

// Everything an operator may set. Deliberately not the whole row: id,
// effective_from and created_at are the record of when a card was written and
// are not anyone's to edit.
const EDITABLE = [
    'base_fare_rwf', 'per_km_rwf', 'per_km_long_rwf', 'per_kg_rwf', 'minimum_fare_rwf',
    'fuel_litres_per_100km', 'diesel_price_rwf_per_litre', 'road_distance_factor',
    'taper_after_km', 'return_leg_beyond_km', 'return_leg_share_pct', 'terrain_fuel_factor',
    'platform_commission_pct', 'platform_minimum_fee_rwf',
    'detention_free_minutes', 'detention_per_hour_rwf',
];

// A sanity net, not a business opinion. These bounds exist to catch a typed
// zero or a misplaced decimal -- a commission of 1500% or a diesel price of 29
// -- rather than to tell an operator what their own rates should be.
const BOUNDS = {
    platform_commission_pct: [0, 60],
    road_distance_factor: [1, 3],
    terrain_fuel_factor: [1, 2],
    return_leg_share_pct: [0, 100],
    fuel_litres_per_100km: [1, 100],
    diesel_price_rwf_per_litre: [100, 20000],
    detention_free_minutes: [0, 480],
};

export const PricingController = {
    // GET /api/pricing/rates
    getRates: async (req, res) => {
        try {
            return ok(res, { rates: await listCurrentRates() });
        } catch (error) {
            logError(req, 'Rate card read failed', error);
            return fail(res, { status: 500, code: 'PRICING_RATES_READ_FAILED', message: 'Could not read the rate card.' });
        }
    },

    // POST /api/pricing/rates
    //
    // Writes a new row rather than updating one. Every quote already given
    // stays explainable and every commission already taken stays as it was
    // charged -- an edit in place would silently restate both.
    createRate: async (req, res) => {
        try {
            const vehicleClass = typeof req.body?.vehicleClass === 'string' ? req.body.vehicleClass.trim() : '';
            if (!vehicleClass) {
                return fail(res, { status: 400, code: 'PRICING_CLASS_REQUIRED', message: 'Choose which vehicle class this card is for.' });
            }

            const current = (await listCurrentRates()).find((r) => r.vehicle_class === vehicleClass);
            if (!current) {
                return fail(res, { status: 400, code: 'PRICING_UNKNOWN_CLASS', message: `No existing card for ${vehicleClass}.` });
            }

            // Start from the card in force and change only what was sent, so
            // an operator adjusting diesel cannot blank the fields they left
            // alone in the form.
            const next = { ...current };
            for (const field of EDITABLE) {
                if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') continue;
                const value = Number(req.body[field]);
                if (!Number.isFinite(value) || value < 0) {
                    return fail(res, { status: 400, code: 'PRICING_INVALID_FIELD', message: `${field} must be a number that is not negative.` });
                }
                const bound = BOUNDS[field];
                if (bound && (value < bound[0] || value > bound[1])) {
                    return fail(res, {
                        status: 400,
                        code: 'PRICING_FIELD_OUT_OF_RANGE',
                        message: `${field} looks wrong at ${value} — expected between ${bound[0]} and ${bound[1]}.`,
                    });
                }
                next[field] = value;
            }

            // Priced before it is saved. A card that throws is a card that
            // would have broken every booking taken against it, and finding
            // that out at save time is far cheaper than at quote time.
            try {
                quote(next, { weightKg: 500, distanceKm: 10 });
                quote(next, { weightKg: 500, distanceKm: 120 });
            } catch (err) {
                return fail(res, {
                    status: 400,
                    code: 'PRICING_CARD_UNUSABLE',
                    message: `That card cannot price a job: ${err instanceof PricingError ? err.message : 'unknown error'}`,
                });
            }

            const columns = ['vehicle_class', ...EDITABLE, 'note'];
            const values = [vehicleClass, ...EDITABLE.map((f) => next[f]),
                (typeof req.body?.note === 'string' && req.body.note.trim())
                    || `Edited by ${req.user?.username || 'staff'}`];
            const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

            const inserted = await pool.query(
                `INSERT INTO pricing_rates (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
                values
            );

            return ok(res, { rate: inserted.rows[0] }, { status: 201 });
        } catch (error) {
            logError(req, 'Rate card write failed', error);
            return fail(res, { status: 500, code: 'PRICING_RATE_WRITE_FAILED', message: 'Could not save that rate card.' });
        }
    },
};
