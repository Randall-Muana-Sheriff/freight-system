// The code a recipient reads out to prove they took the delivery.
//
// Stored as a hash and never in the clear, the same treatment otp_codes gives
// a sign-in code and for the same reason: anyone who can read the database
// should not thereby be able to close somebody else's job.
import crypto from 'crypto';
import pool from '../config/db.js';
import { sendSms } from './smsService.js';
import { generateOtpCode } from '../utils/phone.js';

// Four digits, because this is read aloud at a gate over a running engine and
// every extra digit is another chance to mishear. Safe only because guesses
// are capped -- see MAX_ATTEMPTS.
const CODE_LENGTH = 4;
const MAX_ATTEMPTS = 5;

function hashCode(code) {
    return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function newCode() {
    // Reuses the OTP generator's entropy source rather than Math.random, then
    // takes the last digits -- randomInt is the part that matters.
    return generateOtpCode().slice(-CODE_LENGTH);
}

/**
 * Issues a handover code and texts it to whoever is receiving the goods.
 *
 * Sent when the driver sets off rather than when they arrive, so the
 * recipient already has it in hand. A code that lands while the driver is
 * standing at the gate turns a handover into a wait for an SMS.
 *
 * Idempotent: an order that already has a live code keeps it. Re-issuing on
 * every status change would invalidate the number the recipient is holding.
 */
export async function issueDeliveryCode(client, orderId) {
    const { rows } = await client.query(
        `SELECT id, delivery_code_hash, recipient_phone, customer_phone, cargo_description
           FROM orders WHERE id = $1`,
        [orderId]
    );
    const order = rows[0];
    if (!order) return null;
    if (order.delivery_code_hash) return { alreadyIssued: true };

    // recipient_phone is only filled in when a dispatcher typed one; on a
    // customer-placed order the customer is the person at the door.
    const phone = order.recipient_phone || order.customer_phone;
    if (!phone) return null;

    const code = newCode();
    await client.query(
        `UPDATE orders SET delivery_code_hash = $2, delivery_code_sent_at = NOW(), delivery_code_attempts = 0
          WHERE id = $1`,
        [orderId, hashCode(code)]
    );

    return { code, phone, cargo: order.cargo_description };
}

// Sent outside the transaction that issued it: an SMS failure must not roll
// back a status change the driver has already made, and the code is on the
// row either way so it can be resent.
export async function sendDeliveryCode({ code, phone, cargo }) {
    if (!code || !phone) return;
    await sendSms(phone, `Your Inzira delivery code is ${code}. Give it to the driver when your ${cargo || 'delivery'} arrives — it is how we prove it reached you.`);
}

/**
 * Checks a code the driver keyed in.
 *
 * Returns a reason rather than a bare false, because "wrong code" and "too
 * many tries, use a photo" need different things from the driver and telling
 * them apart at the gate is the difference between one more attempt and a
 * pointless argument with the recipient.
 */
export async function verifyDeliveryCode(client, orderId, submitted) {
    const { rows } = await client.query(
        `SELECT delivery_code_hash, delivery_code_attempts FROM orders WHERE id = $1 FOR UPDATE`,
        [orderId]
    );
    const order = rows[0];
    if (!order || !order.delivery_code_hash) return { ok: false, reason: 'NO_CODE_ISSUED' };
    if (order.delivery_code_attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'TOO_MANY_ATTEMPTS' };

    const given = String(submitted ?? '').replace(/\D/g, '');
    if (!given) return { ok: false, reason: 'NO_CODE_GIVEN' };

    if (hashCode(given) !== order.delivery_code_hash) {
        const bumped = await client.query(
            `UPDATE orders SET delivery_code_attempts = delivery_code_attempts + 1
              WHERE id = $1 RETURNING delivery_code_attempts`,
            [orderId]
        );
        const used = bumped.rows[0].delivery_code_attempts;
        return { ok: false, reason: 'WRONG_CODE', attemptsLeft: Math.max(0, MAX_ATTEMPTS - used) };
    }

    return { ok: true };
}

export const DELIVERY_CODE_MAX_ATTEMPTS = MAX_ATTEMPTS;
