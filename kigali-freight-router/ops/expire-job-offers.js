#!/usr/bin/env node
// Puts lapsed offers back on the board.
//
// An offer is a job parked on one driver's phone. If they never answer -- out
// of signal, phone flat, gone home -- the customer's freight sits there until
// somebody notices, which on a busy board is exactly nobody. This returns
// anything past its expiry to PENDING so dispatch can hand it to someone else.
//
// Deliberately a sweep rather than a timer in the API process: expiry has to
// keep happening across restarts and across more than one instance, and the
// database is the only thing that knows the real time an offer ran out.
import pool from '../config/db.js';

async function main() {
    const { rows } = await pool.query(
        `UPDATE orders
            SET status = 'PENDING', assigned_to = NULL, offer_expires_at = NULL, updated_at = NOW()
          WHERE status = 'OFFERED' AND offer_expires_at IS NOT NULL AND offer_expires_at <= NOW()
          RETURNING id, assigned_to`
    );

    for (const row of rows) {
        await pool.query(
            `INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by)
             VALUES ($1, 'OFFERED', 'PENDING', 'offer-expiry')`,
            [row.id]
        );
    }

    if (rows.length > 0) {
        console.warn(`\u23f0 ${rows.length} unanswered offer(s) returned to the board: ${rows.map((r) => `#${r.id}`).join(', ')}`);
    }
    await pool.end();
}

main().catch((err) => {
    console.error('Offer expiry sweep failed:', err.message);
    process.exit(1);
});
