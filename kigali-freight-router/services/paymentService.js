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
import { distinctCurrencies, soleCurrency } from '../utils/money.js';
import { toDispatchAndDriver } from './realtime.js';
import {
    MomoError, getRequestToPayStatus, isMomoConfigured,
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
    //
    // DELIVERED is allowed, and it was not. The natural order is arrive,
    // collect, hand over, photograph — but a driver who photographs first has
    // already given the goods away, and refusing the payment does not undo
    // that. It only loses the money, and left the driver with
    // PAYMENT_TOO_EARLY telling them to mark a delivery as arrived when the
    // state machine has no path back from DELIVERED. An instruction that
    // cannot be followed is worse than no instruction.
    //
    // Collecting after handover is worse discipline, not a worse outcome, and
    // payment_outstanding already puts a delivered unpaid job in front of
    // dispatch as something to chase.
    if (!['ARRIVED', 'IN_TRANSIT', 'DELIVERED'].includes(order.status)) {
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
    // ANY unresolved request, at any age.
    //
    // This used to reuse only a prompt raised in the last ten minutes, on the
    // assumption that an older one had lapsed. An MTN prompt does not expire
    // on our schedule, so at minute eleven a second live prompt went to the
    // same handset for the same fare — and because the payout dedupe keys on
    // payment_request_id, which now differed, both could settle and both
    // could pay the driver. Two collections and two payouts on one job.
    //
    // A request stops being in flight when something resolves it, not when a
    // clock we own says so.
    const existing = await pool.query(
        `SELECT id, reference, created_at FROM payment_requests
          WHERE order_id = $1 AND status = 'PENDING'
          ORDER BY created_at DESC LIMIT 1`,
        [orderId]
    );
    if (existing.rows[0]) {
        return { reference: existing.rows[0].reference, reused: true, amount: Number(order.price_total) };
    }

    const reference = newReference();
    const amount = Number(order.price_total);
    // The order's own currency, from the rate card its price was computed
    // against. There is no fallback: an order with no currency cannot be
    // charged, because there is no honest guess about what its number means.
    const currency = order.currency;
    if (!currency) {
        throw new PaymentError('PAYMENT_NO_CURRENCY', 409,
            'This order has no currency on it, so it cannot be charged. Dispatch has to reprice it.');
    }

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
            currency,
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

    // What MTN says was actually moved, against what we asked for.
    //
    // The status alone was being trusted and the amount and currency thrown
    // away — so a request that went out in the wrong currency, or was settled
    // for a different sum, would have been recorded as a clean payment. Three
    // lines that turn a silent wrong number into a loud one, on the first
    // transaction rather than at the first reconciliation.
    const settledAmount = Number(verdict.amount);
    const amountMatches = Number.isFinite(settledAmount)
        && Math.abs(settledAmount - Number(request.amount)) < 0.01;
    const currencyMatches = !verdict.currency
        || String(verdict.currency).toUpperCase() === String(request.currency).toUpperCase();

    if (verdict.status === 'SUCCESSFUL' && !(amountMatches && currencyMatches)) {
        await pool.query(
            `UPDATE payment_requests
                SET status = 'FAILED', provider_transaction_id = $2, failure_reason = $3,
                    resolved_at = NOW(), updated_at = NOW()
              WHERE id = $1 AND status = 'PENDING'`,
            [request.id, verdict.financialTransactionId,
             `Settled ${verdict.amount} ${verdict.currency} against ${request.amount} ${request.currency} requested`]
        );
        await pool.query(
            `UPDATE orders SET payment_status = 'FAILED', updated_at = NOW() WHERE id = $1`,
            [request.order_id]
        );
        await appendAuditLog({
            actionType: 'PAYMENT_AMOUNT_MISMATCH',
            description: `Order #${request.order_id}: MTN settled ${verdict.amount} ${verdict.currency} `
                + `but ${request.amount} ${request.currency} was requested. Not marked paid. `
                + `MTN reference ${verdict.financialTransactionId || 'none'}.`,
            username: 'MTN MoMo',
        });
        return { known: true, status: 'MISMATCH', changed: true };
    }

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

// The most of a single payout that can be taken to clear a cash debt.
//
// Not all of it, deliberately. A driver who owes fifty thousand and earns
// five today would otherwise finish a day's work with nothing, and a platform
// that can leave someone with an empty pocket after a full shift will not
// keep its drivers. Half clears a debt over a few jobs while the driver is
// always paid for the day they worked.
const CASH_RECOVERY_MAX_SHARE = Number(process.env.CASH_RECOVERY_MAX_SHARE || 0.5);

/**
 * Take what can be taken of a driver's outstanding cash commission out of a
 * payout that is about to be queued.
 *
 * Oldest debts first, and only whole jobs — settling half of one order's
 * commission would leave a figure nobody can reconcile against anything.
 *
 * Returns what was withheld and which orders it cleared. Runs inside the
 * caller's transaction so a payout can never be reduced without the matching
 * orders being marked, or the reverse.
 */
async function recoverCashOwed(client, driverUsername, payoutAmount, payoutId) {
    const ceiling = payoutAmount * CASH_RECOVERY_MAX_SHARE;
    if (!(ceiling > 0)) return { recovered: 0, cleared: [] };

    const { rows } = await client.query(
        `SELECT id, platform_fee FROM orders
          WHERE assigned_to = $1 AND payment_method = 'CASH'
            AND cash_settled_at IS NULL AND platform_fee IS NOT NULL
            AND platform_fee > 0
          ORDER BY cash_collected_at ASC
          FOR UPDATE`,
        [driverUsername]
    );

    let recovered = 0;
    const cleared = [];
    for (const row of rows) {
        const fee = Number(row.platform_fee);
        // Whole jobs only. Stop at the first one that does not fit rather
        // than skipping ahead to a smaller later debt — oldest first is
        // easier for a driver to follow than cheapest first.
        if (recovered + fee > ceiling) break;
        recovered += fee;
        cleared.push(row.id);
    }
    if (cleared.length === 0) return { recovered: 0, cleared: [] };

    await client.query(
        `UPDATE orders SET cash_settled_at = NOW(), cash_settled_by_payout_id = $2, updated_at = NOW()
          WHERE id = ANY($1::int[])`,
        [cleared, payoutId]
    );
    return { recovered, cleared };
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
    // One transaction, because a payout reduced without its orders being
    // marked settled would take a driver's money for a debt that still shows
    // as owed — and the reverse would clear a debt nobody paid.
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const gross = Number(request.driver_net);
        const inserted = await client.query(
            `INSERT INTO driver_payouts
                (order_id, payment_request_id, driver_username, payee_msisdn, reference,
                 amount, gross_amount, currency, release_at)
             VALUES ($1, $2, $3, $4, $5, $6, $6, $7, NOW() + make_interval(mins => $8))
             ON CONFLICT (payment_request_id) WHERE payment_request_id IS NOT NULL DO NOTHING
             RETURNING id`,
            [request.order_id, request.id, request.assigned_to, msisdn, newReference(),
             gross, request.currency, PAYOUT_DELAY_MINUTES]
        );
        // Nothing inserted means a payout for this collection already exists.
        if (inserted.rows.length === 0) {
            await client.query('ROLLBACK');
            return;
        }
        const payoutId = inserted.rows[0].id;

        // Netting the cash debt off here rather than chasing it separately.
        // The money is already moving, so recovery costs the driver no trip,
        // no transfer fee and no reminder — and a debt that clears itself is
        // one nobody has to have an awkward conversation about.
        const { recovered, cleared } = await recoverCashOwed(
            client, request.assigned_to, gross, payoutId
        );
        if (recovered > 0) {
            await client.query(
                `UPDATE driver_payouts SET amount = gross_amount - $2, cash_recovered = $2
                  WHERE id = $1`,
                [payoutId, recovered]
            );
        } else {
            await client.query('UPDATE driver_payouts SET cash_recovered = 0 WHERE id = $1', [payoutId]);
        }
        await client.query('COMMIT');

        if (recovered > 0) {
            await appendAuditLog({
                actionType: 'DRIVER_CASH_RECOVERED',
                description: `${recovered} ${request.currency || ''} of cash commission recovered from `
                    + `${request.assigned_to}'s payout on order #${request.order_id}, `
                    + `clearing order(s) #${cleared.join(', #')}.`,
                username: 'System',
            });
        }
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        logError(null, `Queuing payout for order #${request.order_id} failed`, error);
    } finally {
        client.release();
    }
}

function notifyDriver(request, event, payload) {
    const body = { orderId: request.order_id, reference: request.reference, ...payload };
    try {
        toDispatchAndDriver(request.assigned_to, event, body);
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
        // ASK MTN FIRST. Always, whatever the age.
        //
        // This used to stamp TIMED_OUT on anything older than the window
        // without ever asking, and TIMED_OUT is terminal. A customer who
        // entered their PIN at minute eleven had genuinely paid, and the row
        // said permanently that nobody had — money collected, order unpaid,
        // and the evidence overwritten by our own clock. An expiry we invented
        // is not a fact about the transaction.
        const result = await reconcilePaymentRequest(row.reference).catch(() => null);
        if (result?.changed) { settled += 1; continue; }

        // Only once MTN has confirmed it is still waiting does age matter,
        // and even then it is our view of it rather than a verdict: the row
        // records that the customer never answered, which is true.
        const ageMinutes = (Date.now() - new Date(row.created_at).getTime()) / 60000;
        if (result && !result.unreachable && ageMinutes > REQUEST_EXPIRY_MINUTES) {
            await pool.query(
                `UPDATE payment_requests SET status = 'TIMED_OUT', resolved_at = NOW(),
                        updated_at = NOW(), failure_reason = 'Customer did not respond'
                  WHERE reference = $1 AND status = 'PENDING'`,
                [row.reference]
            );
        }
    }
    return { checked: rows.length, settled };
}

export const PAYOUT_DELAY_MINUTES_FOR_TEST = PAYOUT_DELAY_MINUTES;

// The sweep, on a timer.
//
// MTN's callback is best-effort and unauthenticated, so a payment can succeed
// and we never hear about it. Until now sweepPendingPayments had exactly one
// caller — an admin endpoint nobody was going to remember to press — which
// meant the safety net under the webhook existed but was never deployed.
const SWEEP_INTERVAL_MS = Number(process.env.PAYMENT_SWEEP_INTERVAL_MS || 120_000);
let sweepTimer = null;
let sweeping = false;

export function startPaymentSweep() {
    if (sweepTimer || !isMomoConfigured('collection')) return;
    sweepTimer = setInterval(async () => {
        if (sweeping) return;
        sweeping = true;
        try {
            await sweepPendingPayments();
        } catch (error) {
            console.error('❌ Payment sweep tick failed:', error.message);
        } finally {
            sweeping = false;
        }
    }, SWEEP_INTERVAL_MS);
    if (sweepTimer.unref) sweepTimer.unref();
}

export function stopPaymentSweep() {
    if (sweepTimer) clearInterval(sweepTimer);
    sweepTimer = null;
}

/**
 * A driver records taking the fare in cash at the door.
 *
 * This is the other half of "take cash and record it with dispatch" — until
 * now that sentence pointed at nothing, so a cash job was indistinguishable
 * from an unpaid one and an honest driver had no way to show which they were.
 *
 * The money runs the opposite way to mobile money and the code has to know
 * that. On a MoMo job the customer pays the platform and the platform owes
 * the driver their share; on a cash job the driver is already holding the
 * whole fare, so nobody owes them anything — they owe the platform its
 * commission. No payout is queued, deliberately: doing so would pay a driver
 * a second time for money already in their pocket.
 */
export async function recordCashPayment({ orderId, collectedBy, note }) {
    const { rows } = await pool.query(
        `SELECT id, status, payment_status, price_total, platform_fee, currency,
                price_is_estimate, assigned_to
           FROM orders WHERE id = $1`,
        [orderId]
    );
    const order = rows[0];
    if (!order) throw new PaymentError('ORDERS_NOT_FOUND', 404, 'That order no longer exists.');

    if (order.payment_status === 'PAID') {
        throw new PaymentError('PAYMENT_ALREADY_PAID', 409, 'This delivery has already been paid for.');
    }
    // Same gate as the MoMo path, including DELIVERED — and here it matters
    // most. A driver who took notes at the door and photographed the handover
    // before recording it had no way to say the fare was ever collected, and
    // an unrecorded cash job is indistinguishable from a pocketed one. This
    // record exists to protect the honest driver; refusing it because they
    // did two correct things in the wrong order defeats the point of having
    // it at all.
    if (!['ARRIVED', 'IN_TRANSIT', 'DELIVERED'].includes(order.status)) {
        throw new PaymentError('PAYMENT_TOO_EARLY', 409,
            'Mark the delivery as arrived before recording payment.');
    }
    if (order.price_total === null) {
        throw new PaymentError('PAYMENT_NO_PRICE', 409,
            'This order has no settled price, so there is no amount to record.');
    }
    if (order.price_is_estimate) {
        throw new PaymentError('PAYMENT_PRICE_IS_ESTIMATE', 409,
            'This delivery is still on an estimated price. Dispatch has to confirm the real price first.');
    }
    // A live MoMo prompt and a cash collection on the same job is how a
    // customer pays twice.
    const inFlight = await pool.query(
        `SELECT 1 FROM payment_requests WHERE order_id = $1 AND status = 'PENDING'`, [orderId]
    );
    if (inFlight.rows.length > 0) {
        throw new PaymentError('PAYMENT_PROMPT_IN_FLIGHT', 409,
            'A mobile money prompt is already on the customer\'s phone. Wait for it to finish or fail before taking cash.');
    }

    const updated = await pool.query(
        `UPDATE orders
            SET payment_status = 'PAID', payment_method = 'CASH',
                paid_at = NOW(), cash_collected_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND payment_status <> 'PAID'
          RETURNING id, price_total, platform_fee, currency, assigned_to`,
        [orderId]
    );
    if (updated.rows.length === 0) {
        throw new PaymentError('PAYMENT_ALREADY_PAID', 409, 'This delivery has already been paid for.');
    }
    const row = updated.rows[0];

    // The permanent record, because this is the one payment nobody else can
    // corroborate. MoMo has MTN's own transaction id behind it; cash has only
    // a driver's word and this line.
    // An order can carry a price with no currency on it — eight do in this
    // database — and the MoMo path refuses those outright. Cash is the
    // fallback for exactly the jobs where something else is missing, so it
    // still records them, but the amount is written without a unit rather
    // than with the word "null" beside it.
    const unit = row.currency ? ` ${row.currency}` : '';
    await appendAuditLog({
        actionType: 'PAYMENT_CASH_COLLECTED',
        description: `Order #${orderId}: ${row.price_total}${unit} taken in cash by `
            + `${row.assigned_to || 'unknown'}. Platform fee ${row.platform_fee ?? 'unknown'}${unit} owed back.`
            + (row.currency ? '' : ' (no currency recorded on this order)')
            + (note ? ` Note: ${String(note).slice(0, 200)}` : ''),
        username: collectedBy || 'System',
    });

    toDispatchAndDriver(row.assigned_to, 'payment:received', {
        orderId: Number(orderId),
        amount: Number(row.price_total),
        currency: row.currency,
        method: 'CASH',
    });

    return {
        orderId: Number(orderId),
        amount: Number(row.price_total),
        currency: row.currency,
        platformFeeOwed: row.platform_fee === null ? null : Number(row.platform_fee),
        method: 'CASH',
    };
}

/** Dispatch confirms the driver has handed the platform's share over. */
export async function settleCashForOrder({ orderId, settledBy }) {
    const { rows } = await pool.query(
        `UPDATE orders SET cash_settled_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND payment_method = 'CASH' AND cash_settled_at IS NULL
          RETURNING id, platform_fee, currency, assigned_to`,
        [orderId]
    );
    if (rows.length === 0) {
        throw new PaymentError('CASH_NOT_OUTSTANDING', 409,
            'That order has no cash commission outstanding.');
    }
    await appendAuditLog({
        actionType: 'PAYMENT_CASH_SETTLED',
        description: `Order #${orderId}: ${rows[0].platform_fee} ${rows[0].currency} commission `
            + `received from ${rows[0].assigned_to || 'unknown'}.`,
        username: settledBy || 'System',
    });
    return { orderId: Number(orderId), settled: true };
}

/**
 * What a driver still owes the platform from cash fares, oldest first.
 *
 * Shared by everything that needs the figure — the settlement flow, the
 * assignment gate, the driver's own screen — so there is one definition of
 * "owing" rather than three queries that drift apart.
 */
export async function cashOwedBy(queryable, driverUsername) {
    const { rows } = await queryable.query(
        `SELECT id, platform_fee, currency, cash_collected_at
           FROM orders
          WHERE assigned_to = $1 AND payment_method = 'CASH'
            AND cash_settled_at IS NULL AND platform_fee IS NOT NULL AND platform_fee > 0
          ORDER BY cash_collected_at ASC`,
        [driverUsername]
    );
    // Every distinct currency in the debt, not just the first row's.
    //
    // `total` is a bare sum, so across currencies it is a number with no
    // honest unit -- 2000 RWF and 15 USD reduce to 2015, and reporting that
    // against rows[0].currency would charge 2015 RWF and mark both jobs
    // settled. The summary endpoint already treats mixed currency as real
    // (it nulls the totals and returns byCurrency); this is the same fact,
    // and callers that turn the total into a charge have to check it.
    const currencies = distinctCurrencies(rows);
    return {
        total: rows.reduce((a, r) => a + Number(r.platform_fee), 0),
        currency: soleCurrency(rows),
        currencies,
        jobs: rows.map((r) => ({ id: r.id, fee: Number(r.platform_fee) })),
    };
}

/**
 * Ask a driver to pay their outstanding commission from their own phone.
 *
 * The same MTN prompt a customer gets, pointed the other way. Netting off a
 * payout only helps a driver who has one coming; somebody working mostly in
 * cash may not for days, and their alternative was carrying notes to an
 * office.
 */
export async function requestCashSettlement({ driverUsername, amount }) {
    if (!isMomoConfigured('collection')) {
        throw new PaymentError('PAYMENTS_NOT_CONFIGURED', 503,
            'Mobile money is not set up on this server. Hand the commission to dispatch instead.');
    }

    const owed = await cashOwedBy(pool, driverUsername);
    if (owed.total <= 0) {
        throw new PaymentError('CASH_NOTHING_OWED', 409, 'You have no commission outstanding.');
    }

    // A debt in two currencies cannot be paid with one prompt.
    //
    // owed.total sums the fees regardless of unit, so 2000 RWF plus 15 USD is
    // 2015 -- and charging that against the first job's currency takes 2015
    // RWF and marks the dollar job settled too. Refusing is the only correct
    // answer here: the driver is sent to a person who can split it, rather
    // than being quietly overcharged in one currency and undercharged in the
    // other. Unreachable while every rate card is in francs, which is exactly
    // why it would not have been noticed.
    if (owed.currencies.length > 1) {
        throw new PaymentError('CASH_SETTLE_MIXED_CURRENCY', 409,
            `Your outstanding commission is in more than one currency (${owed.currencies.join(', ')}), `
            + 'so it cannot be paid in one prompt. Hand it to dispatch instead.');
    }

    // Default to everything. A partial payment is allowed because a driver
    // may genuinely only have part of it, but it must not exceed the debt --
    // this endpoint settles commission, it is not a way to send the platform
    // arbitrary money.
    const requested = amount === undefined || amount === null ? owed.total : Number(amount);
    if (!Number.isFinite(requested) || requested <= 0) {
        throw new PaymentError('CASH_SETTLE_INVALID_AMOUNT', 400, 'Enter how much you are paying.');
    }
    if (requested > owed.total + 0.01) {
        throw new PaymentError('CASH_SETTLE_OVER_OWED', 400,
            `You owe ${owed.total}${owed.currency ? ` ${owed.currency}` : ''}. You cannot pay more than that here.`);
    }

    const msisdn = toMsisdn(driverUsername);
    if (!msisdn) {
        throw new PaymentError('PAYMENT_INVALID_NUMBER', 400, 'Your account has no valid mobile number.');
    }
    if (!canReceiveMomoPrompt(driverUsername)) {
        throw new PaymentError('PAYMENT_WRONG_NETWORK', 400,
            'Your number is not an MTN line, so it cannot receive a MoMo prompt. Hand the commission to dispatch instead.');
    }

    // Reuse an in-flight prompt rather than stacking a second. Same reason as
    // a customer's fare, and worse here: nobody else is watching the money.
    const existing = await pool.query(
        `SELECT reference, amount FROM cash_settlements
          WHERE driver_username = $1 AND status = 'PENDING' LIMIT 1`,
        [driverUsername]
    );
    if (existing.rows[0]) {
        return { reference: existing.rows[0].reference, amount: Number(existing.rows[0].amount), reused: true };
    }

    const reference = newReference();
    const currency = owed.currency;
    if (!currency) {
        throw new PaymentError('PAYMENT_NO_CURRENCY', 409,
            'Those jobs have no currency recorded, so the amount cannot be charged. Hand the commission to dispatch instead.');
    }

    // Written before the call, so a request that dies in flight is still on
    // record rather than lost.
    const inserted = await pool.query(
        `INSERT INTO cash_settlements (driver_username, reference, payer_msisdn, amount, currency)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [driverUsername, reference, msisdn, requested, currency]
    );

    try {
        await requestToPay({
            reference,
            msisdn,
            amount: requested,
            currency,
            externalId: `COMMISSION-${inserted.rows[0].id}`,
            payerMessage: 'Inzira commission on cash deliveries',
            payeeNote: `Cash commission from ${driverUsername}`,
        });
    } catch (error) {
        await pool.query(
            `UPDATE cash_settlements SET status = 'FAILED', failure_reason = $2,
                    resolved_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [inserted.rows[0].id, error.message.slice(0, 300)]
        );
        throw new PaymentError('PAYMENT_REQUEST_REFUSED', 502,
            'Could not reach mobile money. Try again, or hand the commission to dispatch.');
    }

    return { reference, amount: requested, currency, reused: false };
}

/**
 * Settle one commission payment against what MTN says actually happened.
 *
 * Whole jobs, oldest first, up to what was paid -- the same rule netting uses,
 * so a driver sees one consistent story however the money reached us. A part
 * payment that does not cover the oldest job clears nothing and stays on
 * record as paid, which is visible rather than silently absorbed.
 */
export async function reconcileCashSettlement(reference) {
    const { rows } = await pool.query(
        `SELECT * FROM cash_settlements WHERE reference = $1`, [reference]
    );
    const settlement = rows[0];
    if (!settlement) return { known: false };
    if (settlement.status !== 'PENDING') return { known: true, status: settlement.status, changed: false };

    let verdict;
    try {
        verdict = await getRequestToPayStatus(reference);
    } catch (error) {
        return { known: true, status: 'PENDING', changed: false, unreachable: true, error: error.message };
    }
    if (verdict.status === 'PENDING') return { known: true, status: 'PENDING', changed: false };

    const settledAmount = Number(verdict.amount);
    const amountMatches = Number.isFinite(settledAmount)
        && Math.abs(settledAmount - Number(settlement.amount)) < 0.01;
    const succeeded = verdict.status === 'SUCCESSFUL' && amountMatches;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const claimed = await client.query(
            `UPDATE cash_settlements
                SET status = $2, provider_transaction_id = $3, failure_reason = $4,
                    resolved_at = NOW(), updated_at = NOW()
              WHERE id = $1 AND status = 'PENDING' RETURNING id`,
            [settlement.id, succeeded ? 'SUCCESSFUL' : 'FAILED', verdict.financialTransactionId,
             succeeded ? null
               : amountMatches ? (verdict.reason || verdict.status)
               : `Settled ${verdict.amount} against ${settlement.amount} requested`]
        );
        if (claimed.rows.length === 0) { await client.query('ROLLBACK'); return { known: true, changed: false }; }

        const cleared = [];
        if (succeeded) {
            const owed = await cashOwedBy(client, settlement.driver_username);
            let remaining = Number(settlement.amount);
            for (const job of owed.jobs) {
                if (job.fee > remaining) break;
                remaining -= job.fee;
                cleared.push(job.id);
            }
            if (cleared.length > 0) {
                await client.query(
                    `UPDATE orders SET cash_settled_at = NOW(), cash_settled_by_settlement_id = $2,
                            updated_at = NOW() WHERE id = ANY($1::int[])`,
                    [cleared, settlement.id]
                );
            }
        }
        await client.query('COMMIT');

        if (succeeded) {
            await appendAuditLog({
                actionType: 'CASH_COMMISSION_SETTLED',
                description: `${settlement.driver_username} paid ${settlement.amount} ${settlement.currency} `
                    + `commission by mobile money, clearing ${cleared.length} job(s)`
                    + (cleared.length ? `: #${cleared.join(', #')}` : ' (part payment, no whole job covered)')
                    + `. MTN reference ${verdict.financialTransactionId || 'none'}.`,
                username: settlement.driver_username,
            });
            toDispatchAndDriver(settlement.driver_username, 'cash:settled', {
                amount: Number(settlement.amount), currency: settlement.currency, clearedJobs: cleared.length,
            });
        }
        return { known: true, status: succeeded ? 'SUCCESSFUL' : 'FAILED', changed: true, cleared };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}
