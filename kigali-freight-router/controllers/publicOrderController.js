// Unauthenticated, internet-facing endpoints for the customer site. Every
// other write route in this app sits behind authMiddleware; these do not,
// so each one treats the caller as hostile until proven otherwise.
import crypto from 'crypto';
import pool from '../config/db.js';
import { sendSms } from '../services/smsService.js';
import { appendAuditLog } from '../services/auditLogService.js';
import { dispatchExternalAlert, escapeAlertText, ALERT_CATEGORY } from '../services/alertDispatchService.js';
import { ok, fail } from '../utils/httpResponse.js';
import { logError } from '../utils/logger.js';
import { PricingError } from '../services/pricingService.js';
import { priceJob } from '../services/pricingRepository.js';
import { normalizePhone } from '../utils/phone.js';
import { isValidWeightKg } from '../utils/validators.js';
import { toSignedUrl } from '../config/r2Client.js';

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

// What the customer is asked, in their own terms. Deliberately a question
// about their need rather than a priority ranking: people answer "when do
// you need it" honestly because it is a fact about their situation, and
// answer "how important is this" with "very" every time.
export const NEEDED_BY_OPTIONS = ['today', 'tomorrow', 'this_week', 'flexible'];

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
    // GET /api/public/quote?weightKg=&distanceKm=
    //
    // Read-only and side-effect free, so the booking form can price a job
    // while the customer is still typing. distanceKm is optional and usually
    // absent: a public booking captures addresses as free text, so there is
    // no distance until a dispatcher places the order. The response says
    // which it gave with `isEstimate`, and the site must show an estimate as
    // an estimate rather than as a price the customer has been promised.
    //
    // The class is not a parameter. It comes from the weight, the same way
    // order creation derives it, so what this quotes and what the order
    // stores cannot diverge.
    async getQuote(req, res) {
        try {
            const weightKg = Number(req.query.weightKg);
            const hasDistance = req.query.distanceKm !== undefined && req.query.distanceKm !== '';
            const distanceKm = hasDistance ? Number(req.query.distanceKm) : null;

            // Goes through priceJob, the same function order creation uses,
            // rather than picking a rate card here. The booking form has no
            // vehicle-class selector -- the class is derived from weight -- so
            // choosing a card any other way would let the site show a price
            // that the order then stores differently.
            const priced = await priceJob({ weightKg, distanceKm });

            // The customer is told the total and nothing else. What the
            // platform keeps and what the driver nets are on the same
            // breakdown internally, and neither is the customer's business.
            return ok(res, {
                currency: priced.currency,
                vehicleClass: priced.vehicleClass,
                totalAmount: priced.totalAmount,
                isEstimate: priced.isEstimate,
                distanceKm: priced.distanceKm,
                minimumFareApplied: priced.minimumFareApplied,
                // So the site can warn about waiting in the rate card's own
                // terms. Hardcoding "an hour" in the copy would quietly become
                // a lie the day somebody edits the card.
                freeWaitingMinutes: priced.freeWaitingMinutes,
                detentionPerHour: priced.detentionPerHour,
            });
        } catch (error) {
            if (error instanceof PricingError) {
                return fail(res, { status: 400, code: 'PRICING_INVALID_INPUT', message: error.message });
            }
            logError(req, 'Quote failed', error);
            return fail(res, { status: 500, code: 'PRICING_QUOTE_FAILED', message: 'Could not price that job.' });
        }
    },

    // GET /api/public/cargo-types — the form's dropdown reads this so the
    // options and the validation below cannot drift apart.
    getCargoTypes(_req, res) {
        return ok(res, { cargoTypes: CARGO_TYPES, neededByOptions: NEEDED_BY_OPTIONS });
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
            const neededBy = cleanText(req.body?.neededBy, 20);

            if (!pickup || !delivery) {
                return fail(res, { status: 400, code: 'MISSING_LOCATIONS', message: 'Pickup and delivery locations are both required.' });
            }
            if (!customerName || !rawPhone) {
                return fail(res, { status: 400, code: 'MISSING_CONTACT', message: 'Your name and phone number are required.' });
            }
            if (!cargoType || !CARGO_TYPES.includes(cargoType)) {
                return fail(res, { status: 400, code: 'INVALID_CARGO_TYPE', message: 'Choose a cargo type from the list.' });
            }
            if (neededBy && !NEEDED_BY_OPTIONS.includes(neededBy)) {
                return fail(res, { status: 400, code: 'INVALID_NEEDED_BY', message: 'Choose when you need it from the list.' });
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
            // Priced before the insert so a pricing failure refuses the
            // booking rather than storing an order nobody can be billed for.
            // A public booking has no coordinates -- only the two addresses
            // above, as free text -- so this is the estimate case: class and
            // weight only, no distance, flagged price_is_estimate. It becomes
            // a firm price when a dispatcher places the order.
            let priced;
            try {
                priced = await priceJob({ weightKg, distanceKm: null });
            } catch (err) {
                if (err instanceof PricingError) {
                    return fail(res, {
                        status: 400,
                        code: 'PRICING_INVALID_INPUT',
                        message: 'We could not price that job. Check the weight and try again.',
                    });
                }
                throw err;
            }

            let created = null;
            for (let attempt = 0; attempt < 5 && !created; attempt++) {
                try {
                    const result = await pool.query(
                        `INSERT INTO orders
                            (cargo_description, weight_kg, status, source, tracking_token,
                             customer_name, customer_phone, customer_email,
                             pickup_address_text, delivery_address_text, special_instructions,
                             needed_by,
                             pricing_rate_id, priced_vehicle_class, quoted_total,
                             price_total, price_fuel, price_service,
                             platform_fee, driver_net, price_distance_km, price_is_estimate, currency)
                         VALUES ($1, $2, 'PENDING', 'public', $3, $4, $5, $6, $7, $8, $9, $10,
                                 $11, $12, $13, $13, $14, $15, $16, $17, $18, $19, $20)
                         RETURNING tracking_token AS "trackingToken"`,
                        [cargoType, weightKg, generateTrackingToken(), customerName, customerPhone,
                         customerEmail, pickup, delivery, instructions, neededBy,
                         priced.pricingRateId, priced.vehicleClass, priced.totalAmount,
                         priced.fuelAmount, priced.serviceAmount, priced.platformFee,
                         priced.driverNet, priced.distanceKm, priced.isEstimate, priced.currency]
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
                        o.origin_hub_name AS "originHub", u.full_name AS "driverName",
                        o.price_total AS "priceAmount", o.price_is_estimate AS "priceIsEstimate",
                        o.detention_amount AS "detentionAmount"
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

            // Proof of delivery, once there is a delivery to prove.
            //
            // The driver photographs every handover and it has always been
            // stored — but only dispatch could see it, which left the one
            // person who actually cares whether their goods arrived unable
            // to look at the evidence that they did.
            //
            // Gated on DELIVERED rather than on a row existing: a photo
            // surfacing mid-journey would be a state the customer cannot
            // interpret, and the order's own status is the thing that
            // decides whether this consignment is finished.
            //
            // distance_from_target_m and location_flagged are deliberately
            // not selected. They are how dispatch audits whether a driver
            // was really at the address — an internal judgement about staff,
            // not information about the customer's parcel. Telling someone
            // their delivery was "flagged" would alarm them about something
            // they can neither verify nor act on.
            let proofOfDelivery = null;
            if (order.status === 'DELIVERED') {
                const pod = await pool.query(
                    `SELECT photo_url, notes, confirmed_at
                       FROM delivery_confirmations
                      WHERE order_id = $1
                      ORDER BY confirmed_at DESC LIMIT 1`,
                    [order.id]
                );
                if (pod.rows[0]) {
                    // photo_url is a storage key, not a public address — the
                    // bucket is private, so it is signed per response and
                    // expires. Nothing durable is handed out.
                    const photoUrl = await toSignedUrl(pod.rows[0].photo_url);
                    proofOfDelivery = {
                        photoUrl,
                        notes: pod.rows[0].notes || null,
                        confirmedAt: pod.rows[0].confirmed_at,
                    };
                }
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
                // The total and nothing else. platform_fee and
                // driver_net are deliberately not selected above, for the
                // same reason distance_from_target_m is not: what the
                // platform keeps and what the driver is paid are the
                // commercial terms between this business and its drivers, not
                // information about the customer's parcel. A customer who can
                // see the split can negotiate against it or take it straight
                // to the driver, and neither is a conversation this screen
                // should start.
                priceAmount: order.priceAmount === null ? null : Number(order.priceAmount),
                // An estimate has not had a distance applied yet, so the site
                // must say so rather than presenting it as a settled price.
                priceIsEstimate: order.priceIsEstimate,
                // Broken out of the total rather than folded in silently. A
                // customer whose warehouse held the driver for two hours is
                // owed the reason their bill went up, and the alternative is
                // an unexplained number and a phone call.
                detentionAmount: order.detentionAmount == null ? null : Number(order.detentionAmount),
                placedAt: order.createdAt,
                updatedAt: order.updatedAt,
                timeline: history.rows,
                proofOfDelivery,
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

            const saved = await pool.query(
                `INSERT INTO contact_messages (name, phone, email, message) VALUES ($1, $2, $3, $4) RETURNING id`,
                [name, phone, email, message]
            );

            // Storing it is not the same as anyone reading it. Nothing in
            // the app surfaces contact_messages, so without this an enquiry
            // lands in a table no human opens — while the page promises the
            // sender an answer the same day. The alert goes to the channel
            // safety alerts already use, so it reaches someone who is
            // actually watching.
            //
            // Not awaited: a customer's "message sent" must not depend on
            // Telegram being up, and the row is already committed above.
            dispatchExternalAlert(
                `*New enquiry* from ${escapeAlertText(name)}\n`
                + `📞 ${escapeAlertText(phone)}`
                + (email ? `\n✉️ ${escapeAlertText(email)}` : '')
                + `\n\n${escapeAlertText(message)}`,
                ALERT_CATEGORY.ENQUIRY
            ).catch(() => {});

            return ok(res, { received: true, id: saved.rows[0].id }, { status: 201 });
        } catch (error) {
            console.error(`❌ public submitContact failed [${req.requestId || 'no-request-id'}]:`, error.stack || error.message);
            return fail(res, { status: 500, code: 'CONTACT_FAILED', message: 'Could not send your message just now. Please try again.' });
        }
    },
};

export { generateTrackingToken };
