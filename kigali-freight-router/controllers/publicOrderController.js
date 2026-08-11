// Unauthenticated, internet-facing endpoints for the customer site. Every
// other write route in this app sits behind authMiddleware; these do not,
// so each one treats the caller as hostile until proven otherwise.
import crypto from 'crypto';
import pool from '../config/db.js';
import { sendSms } from '../services/smsService.js';
import { appendAuditLog } from '../services/auditLogService.js';
import { ok, fail } from '../utils/httpResponse.js';
import { normalizePhone } from '../utils/phone.js';
import { isValidWeightKg } from '../utils/validators.js';

// Ambiguity-free alphabet: no O/0, I/1, S/5. These codes get read aloud
// down a phone line to a dispatcher and typed off an SMS by someone in a
// hurry, so characters that look alike cost real support calls.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ23456789';
const CODE_LENGTH = 8;

// ~39 bits. Combined with the rate limit on the lookup route that is well
// out of guessing range — whereas a sequential code needs no guessing at
// all, which is the whole reason this is not derived from the order id.
function generateTrackingToken() {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let out = '';
    for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return `INZ-${out}`;
}

export const CARGO_TYPES = [
    'General goods', 'Retail stock', 'Construction materials',
    'Perishables', 'Documents', 'Fragile / high-value', 'Other',
];

// Caps so a single request cannot store unbounded text per field.
const LIMITS = { name: 120, phone: 40, email: 160, address: 300, cargo: 200, instructions: 1000, message: 2000 };

function cleanText(value, max) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, max) : null;
}

export const PublicOrderController = {
    // GET /api/public/cargo-types — the form's dropdown reads this so the
    // options and the validation below cannot drift apart.
    getCargoTypes(_req, res) {
        return ok(res, { cargoTypes: CARGO_TYPES });
    },

    // POST /api/public/orders
    async createOrder(req, res) {
        try {
            const pickup = cleanText(req.body?.pickupAddress, LIMITS.address);
            const delivery = cleanText(req.body?.deliveryAddress, LIMITS.address);
            const cargoType = cleanText(req.body?.cargoType, LIMITS.cargo);
            const customerName = cleanText(req.body?.customerName, LIMITS.name);
            const rawPhone = cleanText(req.body?.customerPhone, LIMITS.phone);
            const customerEmail = cleanText(req.body?.customerEmail, LIMITS.email);
            const instructions = cleanText(req.body?.specialInstructions, LIMITS.instructions);
            const weightKg = Number(req.body?.weightKg);

            if (!pickup || !delivery) {
                return fail(res, { status: 400, code: 'MISSING_LOCATIONS', message: 'Pickup and delivery locations are both required.' });
            }
            if (!customerName || !rawPhone) {
                return fail(res, { status: 400, code: 'MISSING_CONTACT', message: 'Your name and phone number are required.' });
            }
            if (!cargoType || !CARGO_TYPES.includes(cargoType)) {
                return fail(res, { status: 400, code: 'INVALID_CARGO_TYPE', message: 'Choose a cargo type from the list.' });
            }
            if (!isValidWeightKg(weightKg)) {
                return fail(res, { status: 400, code: 'INVALID_WEIGHT', message: 'Weight must be a positive number up to 50000 kg.' });
            }

            // Same normaliser the driver invite/OTP flow uses, so a customer
            // number and a driver number are stored in one comparable form.
            const customerPhone = normalizePhone(rawPhone);
            if (!customerPhone) {
                return fail(res, { status: 400, code: 'INVALID_PHONE', message: 'That phone number does not look right. Use the 07… or +250… form.' });
            }

            // The UNIQUE index is the real guarantee; retrying just avoids
            // failing a customer's booking on a collision that is
            // astronomically unlikely but cheap to absorb.
            let created = null;
            for (let attempt = 0; attempt < 5 && !created; attempt++) {
                try {
                    const result = await pool.query(
                        `INSERT INTO orders
                            (cargo_description, weight_kg, status, source, tracking_token,
                             customer_name, customer_phone, customer_email,
                             pickup_address_text, delivery_address_text, special_instructions)
                         VALUES ($1, $2, 'PENDING', 'public', $3, $4, $5, $6, $7, $8, $9)
                         RETURNING tracking_token AS "trackingToken"`,
                        [cargoType, weightKg, generateTrackingToken(), customerName, customerPhone,
                         customerEmail, pickup, delivery, instructions]
                    );
                    created = result.rows[0];
                } catch (err) {
                    if (err.code !== '23505') throw err; // not a uniqueness clash — a real failure
                }
            }
            if (!created) {
                return fail(res, { status: 503, code: 'TOKEN_COLLISION', message: 'Could not create your order just now. Please try again.' });
            }

            await appendAuditLog({
                actionType: 'PUBLIC_ORDER_SUBMITTED',
                description: `Public order ${created.trackingToken} submitted by ${customerName} (${customerPhone})`,
                username: 'Public',
            });

            // Not awaited: the customer sees their code on screen either
            // way, and the booking must not fail because an SMS gateway is
            // slow. On sandbox this never reaches a +250 number — the
            // service logs the text instead.
            sendSms(
                customerPhone,
                `Inzira: order received. Track it with code ${created.trackingToken}. A dispatcher will assign a driver shortly.`
            ).catch(() => {});

            return ok(res, { trackingToken: created.trackingToken }, { status: 201 });
        } catch (error) {
            console.error(`❌ public createOrder failed [${req.requestId || 'no-request-id'}]:`, error.stack || error.message);
            return fail(res, { status: 500, code: 'ORDER_CREATE_FAILED', message: 'Could not create your order just now. Please try again.' });
        }
    },

    // GET /api/public/track/:token
    async trackOrder(req, res) {
        try {
            const token = cleanText(req.params?.token, 40);
            if (!token) {
                return fail(res, { status: 400, code: 'MISSING_CODE', message: 'Enter a tracking code.' });
            }

            const result = await pool.query(
                `SELECT o.id, o.tracking_token AS "trackingToken", o.cargo_description AS "cargo",
                        o.status, o.created_at AS "createdAt", o.updated_at AS "updatedAt",
                        o.pickup_address_text AS "pickupText", o.delivery_address_text AS "deliveryText",
                        o.origin_hub_name AS "originHub", u.full_name AS "driverName"
                   FROM orders o
                   LEFT JOIN users u ON u.username = o.assigned_to
                  WHERE o.tracking_token = $1`,
                [token.toUpperCase()]
            );
            const order = result.rows[0];
            // Identical response whether the code is malformed or simply not
            // ours, so this cannot be used to probe which codes exist.
            if (!order) {
                return fail(res, { status: 404, code: 'NOT_FOUND', message: 'No shipment found with that code. Check the code from your confirmation SMS.' });
            }

            const history = await pool.query(
                // order_status_logs, not order_status_history — changed_by
                // is intentionally not selected: it is a staff username.
                `SELECT new_status AS "status", changed_at AS "at"
                   FROM order_status_logs WHERE order_id = $1 ORDER BY changed_at ASC`,
                [order.id]
            );

            // The internal id and the driver's username are deliberately not
            // returned: the id is exactly the enumeration handle this whole
            // design avoids exposing, and a driver's login is nobody's
            // business. First name only, which is all a customer needs to
            // greet whoever turns up.
            return ok(res, {
                trackingToken: order.trackingToken,
                cargo: order.cargo,
                status: order.status,
                pickup: order.pickupText || order.originHub,
                delivery: order.deliveryText,
                driverFirstName: order.driverName ? String(order.driverName).split(' ')[0] : null,
                placedAt: order.createdAt,
                updatedAt: order.updatedAt,
                timeline: history.rows,
            });
        } catch (error) {
            console.error(`❌ public trackOrder failed [${req.requestId || 'no-request-id'}]:`, error.stack || error.message);
            return fail(res, { status: 500, code: 'TRACK_FAILED', message: 'Could not look that up just now. Please try again.' });
        }
    },

    // POST /api/public/contact
    async submitContact(req, res) {
        try {
            const name = cleanText(req.body?.name, LIMITS.name);
            const rawPhone = cleanText(req.body?.phone, LIMITS.phone);
            const email = cleanText(req.body?.email, LIMITS.email);
            const message = cleanText(req.body?.message, LIMITS.message);

            if (!name || !rawPhone || !message) {
                return fail(res, { status: 400, code: 'MISSING_FIELDS', message: 'Name, phone and message are all required.' });
            }
            const phone = normalizePhone(rawPhone);
            if (!phone) {
                return fail(res, { status: 400, code: 'INVALID_PHONE', message: 'That phone number does not look right. Use the 07… or +250… form.' });
            }

            await pool.query(
                `INSERT INTO contact_messages (name, phone, email, message) VALUES ($1, $2, $3, $4)`,
                [name, phone, email, message]
            );
            return ok(res, { received: true }, { status: 201 });
        } catch (error) {
            console.error(`❌ public submitContact failed [${req.requestId || 'no-request-id'}]:`, error.stack || error.message);
            return fail(res, { status: 500, code: 'CONTACT_FAILED', message: 'Could not send your message just now. Please try again.' });
        }
    },
};

export { generateTrackingToken };
