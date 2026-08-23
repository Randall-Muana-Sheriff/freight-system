// Collecting at the door, and paying the driver afterwards.
//
// The sequence, and why it is this way round:
//
//   driver taps Arrived
//     -> we raise a payment_requests row FIRST, then call MTN. A request
//        that dies mid-flight is then still on record and reconcilable; the
//        reverse order loses it entirely.
//     -> MTN returns 202. That means "a PIN prompt is on its way", nothing
//        more. Nobody has paid yet.
//   customer enters PIN
//     -> MTN calls our webhook, which we treat as a nudge rather than news:
//        the callback is unsigned, so we always ask MTN ourselves before
//        believing anything.
//     -> on SUCCESSFUL: order.payment_status = PAID, driver told over the
//        socket, and the driver's earning is queued for release.
//
// What deliberately does NOT happen here: the order does not become
// DELIVERED. Paying and receiving are two different facts and each keeps its
// own proof. A driver who has been paid still has to confirm the handover.
import pool from '../config/db.js';
import { io } from '../server.js';
import { logError } from '../utils/logger.js';
import { appendAuditLog } from './auditLogService.js';
import { sendPushToUser } from './pushNotificationService.js';
import { canReceiveMomoPrompt, mobileNetwork, toMsisdn } from '../utils/phone.js';
import {
    MomoError, MOMO_CURRENCY, getRequestToPayStatus, isMomoConfigured,
    newReference, requestToPay,
} from './momoClient.js';

// How long after a customer pays before the driver's money is sent.
//
// Not zero, and the reason is not caution about the driver. A transfer is
// irreversible and costs a fee, so a window exists to catch the cases where
// the collection is reversed or the job turns out not to have happened. A
// few minutes is short enough that a driver on a rank sees the money before
// they take their next job, and long enough to stop a mistake becoming a
// clawback conversation.
const PAYOUT_DELAY_MINUTES = Number(process.env.DRIVER_PAYOUT_DELAY_MINUTES || 5);

// A prompt the customer never answers stays PENDING for ever otherwise. MTN
// expires these itself; this is our own view so the driver's screen stops
// spinning and they can ask again.
const REQUEST_EXPIRY_MINUTES = 10;

export class PaymentError extends Error {
    constructor(code, status, message) {
        super(message);
        this.name = 'PaymentError';
        this.code = code;
        this.status = status;
    }
}

/**
 * Raise a payment request against an order.
 *
 * payFrom is optional: when absent the customer's booking number is used,
 * and when present it is a different handset the customer has offered at the
 * door — usually because they booked from an Airtel line.
 */
export async function requestPaymentForOrder({ orderId, payFrom, requestedBy }) {
    if (!isMomoConfigured('collection')) {
        throw new PaymentError('PAYMENTS_NOT_CONFIGURED', 503,
            'Mobile money is not set up on this server. Take cash and record it with dispatch.');
    }

    const { rows } = await pool.query(
        `SELECT id, status, payment_status, customer_phone, price_total, price_is_estimate,
                currency, cargo_description, tracking_token, assigned_to
           FROM orders WHERE id = $1`,
        [orderId]
    );
    const order = rows[0];
    if (!order) throw new PaymentError('ORDERS_NOT_FOUND', 404, 'That order no longer exists.');

    if (order.payment_status === 'PAID') {
        throw new PaymentError('PAYMENT_ALREADY_PAID', 409, 'This delivery has already been paid for.');
    }
    // Asking before arrival would push a PIN prompt at somebody whose goods
    // are still on the road.
    if (!['ARRIVED', 'IN_TRANSIT'].includes(order.status)) {
        throw new PaymentError('PAYMENT_TOO_EARLY', 409,
            'Mark the delivery as arrived before asking the customer to pay.');
    }
    if (order.price_total === null) {
        throw new PaymentError('PAYMENT_NO_PRICE', 409,
            'This order has no settled price yet. Dispatch has to place it first.');
    }
    // An estimate is not a bill.
    //
    // Until an order is placed on the map there is no distance to price on,
    // so the quote falls back to the minimum fare — which measured 15 to 48
    // per cent below the real figure. Charging that at the door would take
    // the wrong amount from a real customer, and mobile money is not a
    // transaction anyone enjoys reversing.
    //
    // In practice the placement guard in orderController already stops an
    // unplaced order reaching a driver, and placing one is what clears this
    // flag. But that protection lives in another file and nothing here said
    // it was being relied on. Money is the wrong place to depend on a rule
    // enforced somewhere else, so it is checked again where it is spent.
    if (order.price_is_estimate) {
        throw new PaymentError('PAYMENT_PRICE_IS_ESTIMATE', 409,
            'This delivery is still on an estimated price. Dispatch has to confirm the real price before it can be charged.');
    }

    const target = payFrom || order.customer_phone;
    if (!target) {
        throw new PaymentError('PAYMENT_NO_NUMBER', 400,
            'No phone number to charge. Ask the customer which number to send the prompt to.');
    }
    const msisdn = toMsisdn(target);
    if (!msisdn) {
        throw new PaymentError('PAYMENT_INVALID_NUMBER', 400, 'That is not a valid mobile number.');
    }
    // Said before the request rather than after a silent failure: an Airtel
    // number cannot receive an MTN prompt, and the driver needs to know that
    // while the customer is still standing there.
    if (!canReceiveMomoPrompt(target)) {
        throw new PaymentError('PAYMENT_WRONG_NETWORK', 400,
            `${target} is not an MTN number, so it cannot receive a MoMo prompt. `
            + 'Ask the customer for an MTN number, or take cash.');
    }

    // An in-flight prompt is reused rather than stacked. Two prompts on one
    // handset for one delivery is how a customer pays twice.
    const existing = await pool.query(
        `SELECT id, reference, created_at FROM payment_requests
          WHERE order_id = $1 AND status = 'PENDING'
            AND created_at > NOW() - make_interval(mins => $2)
          ORDER BY created_at DESC LIMIT 1`,
        [orderId, REQUEST_EXPIRY_MINUTES]
    );
    if (existing.rows[0]) {
        return { reference: existing.rows[0].reference, reused: true, amount: Number(order.price_total) };
    }

    const reference = newReference();
    const amount = Number(order.price_total);
    const currency = order.currency || MOMO_CURRENCY;

    // Written before the call, so a request that never returns is still a
    // row somebody can reconcile rather than money in an unknown state.
    const inserted = await pool.query(
        `INSERT INTO payment_requests
            (order_id, reference, payer_msisdn, payer_is_booking_number, amount, currency, requested_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [orderId, reference, msisdn, !payFrom, amount, currency, requestedBy || null]
    );

    try {
        await requestToPay({
            reference,
            msisdn,
            amount,
            externalId: order.tracking_token || `ORDER-${orderId}`,
            payerMessage: `Inzira delivery ${order.tracking_token || orderId}`,
            payeeNote: (order.cargo_description || 'Freight delivery').slice(0, 100),
        });
    } catch (error) {
        await pool.query(
            `UPDATE payment_requests SET status = 'FAILED', failure_reason = $2,
                    resolved_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [inserted.rows[0].id, error.message.slice(0, 300)]
        );
        throw new PaymentError('PAYMENT_REQUEST_REFUSED', error instanceof MomoError && error.retryable ? 503 : 502,
            'Could not reach mobile money. Try again, or take cash and tell dispatch.');
    }

    await pool.query(
        `UPDATE orders SET payment_status = 'PENDING', updated_at = NOW() WHERE id = $1`,
        [orderId]
    );

    return { reference, reused: false, amount, currency, msisdn, network: mobileNetwork(target) };
}

/**
 * Settle one payment request against what MTN says, whatever prompted us to
 * look — a webhook, a poll from the driver's screen, or the sweep.
 *
 * Idempotent by construction: the UPDATE only matches a row still PENDING,
 * so a webhook and a poll arriving together cannot both credit the order or
 * both queue a payout.
 */
export async function reconcilePaymentRequest(reference) {
    const { rows } = await pool.query(
        `SELECT pr.*, o.assigned_to, o.driver_net, o.tracking_token
           FROM payment_requests pr JOIN orders o ON o.id = pr.order_id
          WHERE pr.reference = $1`,
        [reference]
    );
    const request = rows[0];
    if (!request) return { known: false };
    if (request.status !== 'PENDING') return { known: true, status: request.status, changed: false };

    // The authoritative read. Never the webhook body: MTN does not sign its
    // callbacks, so an unsigned POST claiming SUCCESSFUL is a request to go
    // and check, not evidence.
    let verdict;
    try {
        verdict = await getRequestToPayStatus(reference);
    } catch (error) {
        return { known: true, status: 'PENDING', changed: false, unreachable: true, error: error.message };
    }

    if (verdict.status === 'PENDING') return { known: true, status: 'PENDING', changed: false };

    const succeeded = verdict.status === 'SUCCESSFUL';
    const settled = await pool.query(
        `UPDATE payment_requests
            SET status = $2, provider_transaction_id = $3, failure_reason = $4,
                resolved_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND status = 'PENDING'
          RETURNING id`,
        [request.id, succeeded ? 'SUCCESSFUL' : 'FAILED', verdict.financialTransactionId,
         succeeded ? null : (verdict.reason || verdict.status)]
    );
    // Somebody else settled it between our read and our write. Theirs stands.
    if (settled.rows.length === 0) return { known: true, status: verdict.status, changed: false };

    if (!succeeded) {
        await pool.query(
            `UPDATE orders SET payment_status = 'FAILED', updated_at = NOW() WHERE id = $1`,
            [request.order_id]
        );
        notifyDriver(request, 'payment:failed', { reason: verdict.reason || verdict.status });
        return { known: true, status: verdict.status, changed: true };
    }

    await pool.query(
        `UPDATE orders SET payment_status = 'PAID', paid_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [request.order_id]
    );
    await queueDriverPayout(request);
    await appendAuditLog({
        actionType: 'PAYMENT_RECEIVED',
        description: `Order #${request.order_id} paid ${request.amount} ${request.currency} by ${request.payer_msisdn} (MTN ${verdict.financialTransactionId || 'no id'})`,
        username: 'MTN MoMo',
    });
    notifyDriver(request, 'payment:received', { amount: Number(request.amount), currency: request.currency });

    return { known: true, status: 'SUCCESSFUL', changed: true };
}

// The driver's earning, recorded now and sent shortly. The row is what the
// driver's screen reads, so the money is visible the instant the customer
// pays even though the transfer has not happened yet.
async function queueDriverPayout(request) {
    if (!request.assigned_to || request.driver_net === null) return;
    const msisdn = toMsisdn(request.assigned_to);
    if (!msisdn) {
        logError(null, `Driver ${request.assigned_to} has no payable number; payout held`, new Error('unpayable'));
        return;
    }
    await pool.query(
        `INSERT INTO driver_payouts
            (order_id, payment_request_id, driver_username, payee_msisdn, reference,
             amount, currency, release_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + make_interval(mins => $8))
         ON CONFLICT (payment_request_id) WHERE payment_request_id IS NOT NULL DO NOTHING`,
        [request.order_id, request.id, request.assigned_to, msisdn, newReference(),
         Number(request.driver_net), request.currency, PAYOUT_DELAY_MINUTES]
    );
}

function notifyDriver(request, event, payload) {
    const body = { orderId: request.order_id, reference: request.reference, ...payload };
    try {
        io.emit(event, body);
    } catch { /* the socket is a convenience; the database is the record */ }
    if (request.assigned_to) {
        sendPushToUser(request.assigned_to, {
            title: event === 'payment:received' ? '✅ Payment received' : '⚠️ Payment failed',
            body: event === 'payment:received'
                ? `${request.amount} ${request.currency} received. You can hand over the load.`
                : 'The customer\'s payment did not go through. Ask them to try again.',
            data: { type: event, orderId: String(request.order_id) },
        }).catch(() => {});
    }
}

/**
 * The safety net under the webhook.
 *
 * MTN's callback is best-effort and unauthenticated, so a delivery can be
 * paid and we never hear. This asks about every prompt still outstanding,
 * and ages out the ones nobody answered so the driver's screen stops waiting.
 */
export async function sweepPendingPayments() {
    const { rows } = await pool.query(
        `SELECT reference, created_at FROM payment_requests
          WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 50`
    );
    let settled = 0;
    for (const row of rows) {
        const ageMinutes = (Date.now() - new Date(row.created_at).getTime()) / 60000;
        if (ageMinutes > REQUEST_EXPIRY_MINUTES) {
            await pool.query(
                `UPDATE payment_requests SET status = 'TIMED_OUT', resolved_at = NOW(),
                        updated_at = NOW(), failure_reason = 'Customer did not respond'
                  WHERE reference = $1 AND status = 'PENDING'`,
                [row.reference]
            );
            continue;
        }
        const result = await reconcilePaymentRequest(row.reference).catch(() => null);
        if (result?.changed) settled += 1;
    }
    return { checked: rows.length, settled };
}

export const PAYOUT_DELAY_MINUTES_FOR_TEST = PAYOUT_DELAY_MINUTES;
