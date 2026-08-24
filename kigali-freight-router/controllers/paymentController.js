// Asking for money at the door, and telling the driver when it arrives.
import pool from '../config/db.js';
import { ok, fail } from '../utils/httpResponse.js';
import { logError } from '../utils/logger.js';
import {
    PaymentError, requestPaymentForOrder, reconcilePaymentRequest, sweepPendingPayments,
    recordCashPayment, settleCashForOrder,
} from '../services/paymentService.js';
import { canReceiveMomoPrompt, mobileNetwork } from '../utils/phone.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PaymentController = {
    // POST /api/payments/orders/:orderId/request   { payFrom? }
    //
    // The driver has arrived and is asking the customer to pay. payFrom is
    // the "some other number" case: the customer booked on Airtel and hands
    // over an MTN number at the gate.
    request: async (req, res) => {
        try {
            const requesterRole = String(req.user?.role || '').toLowerCase();
            if (requesterRole === 'driver') {
                const owns = await pool.query(
                    'SELECT 1 FROM orders WHERE id = $1 AND assigned_to = $2',
                    [req.params.orderId, req.user.username]
                );
                if (owns.rows.length === 0) {
                    return fail(res, { status: 403, code: 'PAYMENT_NOT_YOUR_ORDER',
                        message: 'You can only take payment for your own deliveries.' });
                }
            }

            const result = await requestPaymentForOrder({
                orderId: req.params.orderId,
                payFrom: typeof req.body?.payFrom === 'string' ? req.body.payFrom.trim() : null,
                requestedBy: req.user?.username,
            });
            return ok(res, {
                ...result,
                // Said plainly, because the driver is standing in front of
                // somebody and needs to know what happens next rather than
                // whether an API returned 202.
                message: result.reused
                    ? 'A prompt is already on their phone. Ask them to check it.'
                    : 'Prompt sent. Ask the customer to enter their MoMo PIN.',
            });
        } catch (error) {
            if (error instanceof PaymentError) {
                return fail(res, { status: error.status, code: error.code, message: error.message });
            }
            logError(req, 'Payment request failed', error);
            return fail(res, { status: 500, code: 'PAYMENT_REQUEST_FAILED',
                message: 'Could not ask for payment. Take cash and tell dispatch.' });
        }
    },

    // POST /api/payments/orders/:orderId/cash   { note? }
    //
    // The driver took the fare in cash and is saying so. This is the other
    // half of a sentence the system has been printing at drivers with nowhere
    // to act on it — "take cash and record it with dispatch" pointed at
    // nothing, so a cash job and an unpaid job were the same row.
    //
    // That is a fairness problem before it is an accounting one. With no way
    // to record it, a driver who collected honestly and one who pocketed the
    // fare look identical, and the honest one has no way to show which they
    // were.
    cash: async (req, res) => {
        try {
            const requesterRole = String(req.user?.role || '').toLowerCase();
            if (requesterRole === 'driver') {
                const owns = await pool.query(
                    'SELECT 1 FROM orders WHERE id = $1 AND assigned_to = $2',
                    [req.params.orderId, req.user.username]
                );
                if (owns.rows.length === 0) {
                    return fail(res, { status: 403, code: 'PAYMENT_NOT_YOUR_ORDER',
                        message: 'You can only record payment for your own deliveries.' });
                }
            }
            const result = await recordCashPayment({
                orderId: req.params.orderId,
                collectedBy: req.user?.username,
                note: req.body?.note,
            });
            return ok(res, {
                ...result,
                message: result.platformFeeOwed === null
                    ? 'Cash recorded.'
                    : `Cash recorded. ${result.platformFeeOwed}${result.currency ? ` ${result.currency}` : ''} commission to hand in.`,
            });
        } catch (error) {
            if (error instanceof PaymentError) {
                return fail(res, { status: error.status, code: error.code, message: error.message });
            }
            logError(req, 'Recording cash failed', error);
            return fail(res, { status: 500, code: 'PAYMENT_CASH_FAILED',
                message: 'Could not record that cash payment. Tell dispatch before you leave.' });
        }
    },

    // POST /api/payments/orders/:orderId/cash/settle
    //
    // Dispatch confirms the driver handed the platform's share over. Staff
    // only: a driver marking their own debt settled is the one thing this
    // whole record exists to prevent.
    settleCash: async (req, res) => {
        try {
            return ok(res, await settleCashForOrder({
                orderId: req.params.orderId,
                settledBy: req.user?.username,
            }));
        } catch (error) {
            if (error instanceof PaymentError) {
                return fail(res, { status: error.status, code: error.code, message: error.message });
            }
            logError(req, 'Settling cash failed', error);
            return fail(res, { status: 500, code: 'PAYMENT_CASH_SETTLE_FAILED',
                message: 'Could not record that settlement.' });
        }
    },

    // GET /api/payments/orders/:orderId
    //
    // What the driver's screen polls while the customer is holding their
    // phone. It reconciles rather than just reading, so the answer is never
    // staler than this call — the webhook may not have arrived, or may never.
    status: async (req, res) => {
        try {
            // The same check its sibling makes, and the omission was mine.
            //
            // PaymentController.request above refuses a driver reading an
            // order that is not theirs; this did not, so the same identity
            // was turned away by /request and let through by /status. It
            // returns the customer's MoMo number — including the alternative
            // one handed over at the gate — the amount, and the payment
            // reference, and it triggers an outbound MTN call against
            // somebody else's payment on the way.
            const requesterRole = String(req.user?.role || '').toLowerCase();
            if (requesterRole === 'driver') {
                const owns = await pool.query(
                    'SELECT 1 FROM orders WHERE id = $1 AND assigned_to = $2',
                    [req.params.orderId, req.user.username]
                );
                if (owns.rows.length === 0) {
                    return fail(res, { status: 403, code: 'PAYMENT_NOT_YOUR_ORDER',
                        message: 'You can only see payments for your own deliveries.' });
                }
            }

            const { rows } = await pool.query(
                `SELECT pr.reference, pr.status, pr.amount, pr.currency, pr.payer_msisdn,
                        pr.failure_reason, pr.created_at, o.payment_status
                   FROM payment_requests pr JOIN orders o ON o.id = pr.order_id
                  WHERE pr.order_id = $1 ORDER BY pr.created_at DESC LIMIT 1`,
                [req.params.orderId]
            );
            if (rows.length === 0) {
                const order = await pool.query('SELECT payment_status FROM orders WHERE id = $1', [req.params.orderId]);
                if (order.rows.length === 0) {
                    return fail(res, { status: 404, code: 'ORDERS_NOT_FOUND', message: 'That order no longer exists.' });
                }
                return ok(res, { paymentStatus: order.rows[0].payment_status, attempt: null });
            }

            let latest = rows[0];
            if (latest.status === 'PENDING') {
                await reconcilePaymentRequest(latest.reference).catch(() => null);
                const refreshed = await pool.query(
                    `SELECT pr.reference, pr.status, pr.amount, pr.currency, pr.payer_msisdn,
                            pr.failure_reason, pr.created_at, o.payment_status
                       FROM payment_requests pr JOIN orders o ON o.id = pr.order_id
                      WHERE pr.reference = $1`, [latest.reference]
                );
                latest = refreshed.rows[0] || latest;
            }

            return ok(res, {
                paymentStatus: latest.payment_status,
                attempt: {
                    reference: latest.reference,
                    status: latest.status,
                    amount: Number(latest.amount),
                    currency: latest.currency,
                    payer: latest.payer_msisdn,
                    failureReason: latest.failure_reason,
                    requestedAt: latest.created_at,
                },
            });
        } catch (error) {
            logError(req, 'Payment status read failed', error);
            return fail(res, { status: 500, code: 'PAYMENT_STATUS_FAILED', message: 'Could not read the payment status.' });
        }
    },

    // GET /api/payments/can-charge?phone=+2507...
    //
    // Lets the driver app grey out the button and say why before anybody
    // taps it, rather than after a minute of waiting.
    canCharge: async (req, res) => {
        const phone = typeof req.query.phone === 'string' ? req.query.phone : '';
        const network = mobileNetwork(phone);
        return ok(res, {
            phone,
            network,
            canCharge: canReceiveMomoPrompt(phone),
            reason: canReceiveMomoPrompt(phone) ? null
                : network === 'OTHER'
                    ? 'MoMo prompts only reach MTN numbers. Ask for an MTN number, or take cash.'
                    : 'That is not a mobile number we can send a prompt to.',
        });
    },

    // GET /api/payments/driver/cash
    //
    // The mirror of earnings, and the number that matters is the one the
    // driver owes rather than the one they took.
    //
    // A driver holding a week of cash does not automatically know which part
    // of it is not theirs. commissionOwed is that part, and it is the figure
    // this endpoint exists to make impossible to lose track of.
    //
    // Deliberately NOT combined with the payout totals. A cash price_total is
    // the whole fare including the platform's share; a payout is the driver's
    // net. Adding them overstates what a driver has earned, and the two are
    // different facts about money anyway — one is in their hand with a debt
    // attached, the other is in their wallet.
    cashSummary: async (req, res) => {
        try {
            const username = req.user.username;
            const { rows } = await pool.query(
                `SELECT id AS order_id, price_total, platform_fee, currency,
                        cash_collected_at, cash_settled_at
                   FROM orders
                  WHERE assigned_to = $1 AND payment_method = 'CASH'
                  ORDER BY cash_collected_at DESC NULLS LAST
                  LIMIT 50`,
                [username]
            );
            const totals = await pool.query(
                `SELECT currency,
                        COALESCE(SUM(price_total), 0) AS collected,
                        COALESCE(SUM(platform_fee) FILTER (WHERE cash_settled_at IS NULL), 0) AS owed,
                        COALESCE(SUM(platform_fee) FILTER (WHERE cash_settled_at IS NOT NULL), 0) AS settled,
                        -- A total cannot carry a null the way a row can.
                        --
                        -- SUM ignores nulls, so a driver whose cash jobs all
                        -- have an unworked-out commission sees owed = 0 and
                        -- reads it as "you owe nothing" — the same trap as
                        -- coercing a row's fee to zero, one level up, and
                        -- more expensive because it is the headline figure.
                        -- Counting them lets the screen say the total is
                        -- incomplete rather than quietly understating a debt.
                        COUNT(*) FILTER (WHERE cash_settled_at IS NULL AND platform_fee IS NULL)::int AS owed_unknown
                   FROM orders
                  WHERE assigned_to = $1 AND payment_method = 'CASH'
                  GROUP BY currency`,
                [username]
            );
            const single = totals.rows.length === 1 ? totals.rows[0].currency : null;
            const sum = (f) => totals.rows.reduce((acc, r) => acc + Number(r[f]), 0);

            return ok(res, {
                collected: totals.rows.length > 1 ? null : sum('collected'),
                commissionOwed: totals.rows.length > 1 ? null : sum('owed'),
                commissionSettled: totals.rows.length > 1 ? null : sum('settled'),
                // How many jobs the owed figure could not include. Zero means
                // the total is complete; anything else means it is a floor.
                commissionOwedUnknownJobs: totals.rows.reduce((a, r) => a + Number(r.owed_unknown), 0),
                currency: single,
                byCurrency: totals.rows.map((r) => ({
                    currency: r.currency,
                    collected: Number(r.collected),
                    commissionOwed: Number(r.owed),
                    commissionSettled: Number(r.settled),
                    commissionOwedUnknownJobs: Number(r.owed_unknown),
                })),
                jobs: rows.map((r) => ({
                    orderId: r.order_id,
                    amount: Number(r.price_total),
                    // Left null rather than coerced to zero. "We do not know
                    // what you owe" and "you owe nothing" are different
                    // statements, and a driver reading the second when the
                    // first is true will be surprised later.
                    platformFee: r.platform_fee === null ? null : Number(r.platform_fee),
                    currency: r.currency,
                    collectedAt: r.cash_collected_at,
                    settledAt: r.cash_settled_at,
                })),
            });
        } catch (error) {
            logError(req, 'Cash summary read failed', error);
            return fail(res, { status: 500, code: 'CASH_SUMMARY_FAILED',
                message: 'Could not load your cash collections.' });
        }
    },

    // POST /api/payments/momo/callback/:reference
    //
    // MTN's callback. Unauthenticated by design on their side — there is no
    // signature to check — so this endpoint deliberately reads nothing from
    // the body. It is a nudge meaning "go and ask about this reference", and
    // the answer comes from MTN's own status endpoint.
    //
    // That is what makes it safe to leave open: the worst a forged call can
    // do is make us ask MTN a question we already knew the answer to.
    callback: async (req, res) => {
        const { reference } = req.params;
        // Always 200, whatever we think. A provider that gets an error back
        // retries, and there is nothing here for a retry to fix.
        if (!UUID.test(reference || '')) return ok(res, { received: true });
        try {
            await reconcilePaymentRequest(reference);
        } catch (error) {
            logError(req, `MoMo callback reconciliation failed for ${reference}`, error);
        }
        return ok(res, { received: true });
    },

    // POST /api/payments/sweep — the net under the webhook, for ops and cron.
    sweep: async (req, res) => {
        try {
            return ok(res, await sweepPendingPayments());
        } catch (error) {
            logError(req, 'Payment sweep failed', error);
            return fail(res, { status: 500, code: 'PAYMENT_SWEEP_FAILED', message: 'Could not sweep pending payments.' });
        }
    },

    // GET /api/payments/driver/earnings
    //
    // Reads driver_payouts, not transfers, so a driver sees the money the
    // moment the customer pays rather than when it lands.
    earnings: async (req, res) => {
        try {
            const username = req.user.username;
            const { rows } = await pool.query(
                `SELECT id, order_id, amount, currency, status, release_at, sent_at, created_at, failure_reason
                   FROM driver_payouts WHERE driver_username = $1
                  ORDER BY created_at DESC LIMIT 50`,
                [username]
            );
            // Summed per currency, not across all of them.
            //
            // This was a bare SUM(amount), which on the day a driver has
            // payouts in two currencies quietly adds francs to something
            // else and reports the result as one number. Nobody would notice
            // until the figure was already wrong on somebody's screen.
            //
            // Everything is RWF today, so this is a defect that has not yet
            // had the chance to be visible — which is the only reason it is
            // cheap to fix now.
            const totals = await pool.query(
                `SELECT currency,
                        COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCESSFUL'), 0) AS paid_out,
                        COALESCE(SUM(amount) FILTER (WHERE status IN ('QUEUED','SENDING')), 0) AS on_the_way
                   FROM driver_payouts WHERE driver_username = $1
                  GROUP BY currency`,
                [username]
            );

            // The screen wants one figure when there is honestly one to give.
            // A driver with a single currency should not be made to read a
            // breakdown; a driver with two must not be shown a sum that means
            // nothing.
            const currencies = totals.rows.map((r) => r.currency);
            const single = currencies.length === 1 ? currencies[0] : null;
            const sum = (field) => totals.rows.reduce((acc, r) => acc + Number(r[field]), 0);

            return ok(res, {
                // Bare sums, kept for the single-currency case the app
                // renders today. Meaningless if byCurrency has more than one
                // row, which is why currency is returned beside them.
                paidOut: single === null && totals.rows.length > 1 ? null : sum('paid_out'),
                onTheWay: single === null && totals.rows.length > 1 ? null : sum('on_the_way'),
                currency: single,
                byCurrency: totals.rows.map((r) => ({
                    currency: r.currency,
                    paidOut: Number(r.paid_out),
                    onTheWay: Number(r.on_the_way),
                })),
                payouts: rows.map((r) => ({ ...r, amount: Number(r.amount) })),
            });
        } catch (error) {
            logError(req, 'Earnings read failed', error);
            return fail(res, { status: 500, code: 'EARNINGS_FAILED', message: 'Could not load your earnings.' });
        }
    },
};
