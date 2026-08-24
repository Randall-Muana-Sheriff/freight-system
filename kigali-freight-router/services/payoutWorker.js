// Sending the driver their money, a few minutes after the customer paid.
//
// Separate from the collection on purpose. A transfer is irreversible, costs
// a fee, and can fail for reasons that have nothing to do with the job — a
// float that has run dry, a driver's wallet at its limit. Keeping it out of
// the collection path means none of that can make a successful payment look
// unsuccessful to the customer or the driver.
//
// The driver sees the earning the moment they are paid, because the
// driver_payouts row exists from that moment. This worker only moves the
// money it already promised.
import pool from '../config/db.js';
import { io } from '../server.js';
import { appendAuditLog } from './auditLogService.js';
import { isMomoConfigured, newReference, transfer, getTransferStatus } from './momoClient.js';
import { toDispatchAndDriver } from './realtime.js';

const TICK_MS = Number(process.env.DRIVER_PAYOUT_TICK_MS || 60_000);
// After this many failed attempts a payout stops retrying and waits for a
// human. A transfer that has failed five times is not going to succeed on
// the sixth, and quietly retrying for ever hides a float problem.
const MAX_ATTEMPTS = 5;

let timer = null;
let running = false;

/**
 * Did a previous attempt actually land?
 *
 * A transfer that MTN accepted and whose response we never saw looks
 * identical to one that never left. Asking about the old reference is the
 * only way to tell them apart, and getting it wrong pays a driver twice.
 *
 * A 404 from MTN means it never knew that reference, so nothing was sent and
 * the attempt is safe to make again under a new one. Anything else
 * unreadable is treated as "cannot tell", and not knowing is a reason to
 * wait rather than to send money.
 */
async function alreadyLanded(payout) {
    if (payout.attempts <= 1) return null;
    try {
        const verdict = await getTransferStatus(payout.reference);
        if (verdict.status === 'SUCCESSFUL') return verdict.financialTransactionId || 'unknown';
        return null;
    } catch (error) {
        if (error.status === 404) return null;
        throw error;
    }
}

export async function processDuePayouts() {
    if (!isMomoConfigured('disbursement')) return { skipped: 'not configured' };

    // Claimed with a single UPDATE ... RETURNING so two workers, or two
    // instances, cannot pick up the same payout and pay a driver twice.
    const { rows } = await pool.query(
        `UPDATE driver_payouts SET status = 'SENDING', attempts = attempts + 1, updated_at = NOW()
          WHERE id IN (
              SELECT id FROM driver_payouts
               WHERE status = 'QUEUED' AND release_at <= NOW() AND attempts < $1
               ORDER BY release_at ASC LIMIT 20 FOR UPDATE SKIP LOCKED
          )
          RETURNING *`,
        [MAX_ATTEMPTS]
    );

    let sent = 0;
    for (const payout of rows) {
        try {
            // A FRESH reference for every attempt.
            //
            // MTN treats X-Reference-Id as an idempotency key: replaying one
            // returns 409, which is not retryable, so a payout that failed
            // once could never succeed — five attempts, five 409s, and a
            // driver who can never be paid by the worker.
            //
            // The previous reference is not discarded. It is checked first,
            // because the dangerous case is the mirror one: a transfer MTN
            // accepted whose response we lost to a timeout. Reusing it would
            // 409; abandoning it blind would pay the driver twice.
            const priorLanded = await alreadyLanded(payout);
            if (priorLanded) {
                await pool.query(
                    `UPDATE driver_payouts SET status = 'SUCCESSFUL', provider_transaction_id = $2,
                            failure_reason = NULL, updated_at = NOW() WHERE id = $1`,
                    [payout.id, priorLanded]
                );
                sent += 1;
                continue;
            }

            const attemptReference = newReference();
            await pool.query('UPDATE driver_payouts SET reference = $2 WHERE id = $1',
                [payout.id, attemptReference]);

            await transfer({
                reference: attemptReference,
                msisdn: payout.payee_msisdn,
                amount: Number(payout.amount),
                currency: payout.currency,
                externalId: `PAYOUT-${payout.id}`,
                payeeNote: `Inzira job #${payout.order_id ?? payout.id}`,
            });
            // 202 means accepted, not arrived. The status is confirmed on a
            // later tick rather than assumed here.
            await pool.query(
                `UPDATE driver_payouts SET sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
                [payout.id]
            );
            sent += 1;
        } catch (error) {
            const exhausted = payout.attempts >= MAX_ATTEMPTS;
            await pool.query(
                `UPDATE driver_payouts SET status = $2, failure_reason = $3, updated_at = NOW() WHERE id = $1`,
                [payout.id, exhausted ? 'FAILED' : 'QUEUED', error.message.slice(0, 300)]
            );
            if (exhausted) {
                await appendAuditLog({
                    actionType: 'DRIVER_PAYOUT_FAILED',
                    description: `Payout #${payout.id} to ${payout.driver_username} for ${payout.amount} ${payout.currency} failed ${MAX_ATTEMPTS} times: ${error.message.slice(0, 120)}`,
                    username: 'System',
                });
            }
        }
    }

    await confirmSentPayouts();
    return { claimed: rows.length, sent };
}

// A transfer MTN accepted is not a transfer that landed. This asks.
async function confirmSentPayouts() {
    const { rows } = await pool.query(
        `SELECT id, reference, driver_username, amount, currency, order_id
           FROM driver_payouts WHERE status = 'SENDING' AND sent_at IS NOT NULL
          ORDER BY sent_at ASC LIMIT 20`
    );
    for (const payout of rows) {
        let verdict;
        try {
            verdict = await getTransferStatus(payout.reference);
        } catch {
            continue; // still in flight as far as we can tell; ask again next tick
        }
        if (verdict.status === 'PENDING') continue;

        const succeeded = verdict.status === 'SUCCESSFUL';
        await pool.query(
            `UPDATE driver_payouts
                SET status = $2, provider_transaction_id = $3, failure_reason = $4, updated_at = NOW()
              WHERE id = $1 AND status = 'SENDING'`,
            [payout.id, succeeded ? 'SUCCESSFUL' : 'QUEUED',
             verdict.financialTransactionId, succeeded ? null : (verdict.reason || verdict.status)]
        );
        if (succeeded) {
            try {
                toDispatchAndDriver(payout.driver_username, 'payout:sent', {
                    driver: payout.driver_username,
                    orderId: payout.order_id,
                    amount: Number(payout.amount),
                    currency: payout.currency,
                });
            } catch { /* the row is the record */ }
        }
    }
}

export function startPayoutWorker() {
    if (timer) return;
    timer = setInterval(async () => {
        if (running) return;
        running = true;
        try {
            await processDuePayouts();
        } catch (error) {
            console.error('❌ Payout worker tick failed:', error.message);
        } finally {
            running = false;
        }
    }, TICK_MS);
    if (timer.unref) timer.unref();
}

export function stopPayoutWorker() {
    if (timer) clearInterval(timer);
    timer = null;
}
