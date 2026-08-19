// Telling the customer what is happening to their consignment.
//
// Until now they got exactly one message — the tracking code, at booking —
// and then silence until they thought to go and look the code up. Every
// milestone after that was visible to dispatch and invisible to the person
// waiting for the goods.
//
// Lives in a service rather than at the call sites because an order's
// status changes in two completely separate places: a dispatcher (or the
// driver's own screen) hitting PATCH /api/orders/:id/status, and a driver
// completing a stop on a multi-stop run. Wording and rules duplicated
// across the two would drift, and the failure would be silent and uneven —
// customers on single jobs getting texts while customers on runs got
// nothing, which is worse than nobody getting them.
import pool from '../config/db.js';
import { sendSms } from './smsService.js';
// The rule and the wording live in utils/ so they can be tested without a
// database — see the note at the top of that file.
import { shouldNotify, noticeFor } from '../utils/customerNotices.js';

// Fire-and-forget by design: never awaited at a call site, and it swallows
// its own errors. A delivery has happened whether or not the gateway is
// reachable, and failing to text somebody must never roll back the status
// change that the driver is standing there waiting to see confirmed.
//
// Must be called after the surrounding transaction commits — an SMS round
// trip inside an open transaction holds row locks for the length of a
// third party's network call.
export function notifyCustomerOfStatus({ orderId, previousStatus, newStatus }) {
    if (!shouldNotify(previousStatus, newStatus)) return;

    (async () => {
        const result = await pool.query(
            `SELECT customer_phone, tracking_token FROM orders WHERE id = $1`,
            [orderId]
        );
        const order = result.rows[0];
        // Dispatcher-entered orders often have no customer contact at all —
        // the office took the job over the phone and knows who to ring.
        if (!order?.customer_phone) return;

        await sendSms(order.customer_phone, noticeFor(newStatus, order.tracking_token));
    })().catch((error) => {
        console.error(`❌ Customer status SMS failed for order ${orderId}:`, error.message);
    });
}
