// Enforces a retention limit on driver_location_history.
//
// Nothing deleted from this table before now. It gains a row per GPS ping
// per driver on shift and never lost one: a single test phone produced
// 2,716 rows in seven hours, and production sat at 5,421 rows / 1.4 MB from
// that one phone alone. Ten real drivers is roughly 93,000 rows and 24 MB a
// day, which fills the host's remaining 16 GB in under two years; fifty
// drivers does it in about five months. The nightly dump grew from 157 KB
// to 264 KB in a single day and every one of those is copied off-site, so
// the cost is paid fourteen times over in local retention plus once more in
// object storage, daily.
//
// The stronger reason is not disk. The privacy policy tells drivers their
// location history "is kept only as long as it is useful for coordinating
// and reviewing work", which describes a lifecycle that did not exist —
// nothing expired, so in practice the answer was "forever". Rwanda's Law
// No. 058/2021 requires personal data be kept no longer than necessary, and
// a driver's movements are personal data. This makes the sentence true.
//
// Run daily via ops/systemd/kigali-purge-location-history.timer.
import pool from '../config/db.js';

// 90 days by default. Long enough to reconstruct a disputed delivery or
// investigate an incident weeks after the fact, which is the use the policy
// actually names; short enough to bound the table. Override with
// LOCATION_HISTORY_RETENTION_DAYS, but change the privacy policy to match if
// you do — the two are a pair, and the policy is the promise.
const retentionDays = Number.parseInt(process.env.LOCATION_HISTORY_RETENTION_DAYS || '90', 10);

if (!Number.isFinite(retentionDays) || retentionDays < 1) {
    console.error(`LOCATION_HISTORY_RETENTION_DAYS must be a positive integer (got "${process.env.LOCATION_HISTORY_RETENTION_DAYS}").`);
    process.exit(1);
}

// Deleted in bounded batches rather than one statement. An unqualified
// DELETE over months of accumulated rows holds locks and bloats WAL for as
// long as it runs, on the same database that is serving live telemetry
// writes; this keeps each transaction short enough that a driver's ping
// never waits behind the cleanup.
const BATCH = 10000;
let removed = 0;
for (;;) {
    const { rowCount } = await pool.query(
        `DELETE FROM driver_location_history
          WHERE id IN (
              SELECT id FROM driver_location_history
               WHERE recorded_at < NOW() - ($1 || ' days')::interval
               LIMIT $2
          )`,
        [retentionDays, BATCH]
    );
    removed += rowCount;
    if (rowCount < BATCH) break;
}

const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM driver_location_history');

console.log(JSON.stringify({ retentionDays, removed, remaining: rows[0].n }));
await pool.end();
