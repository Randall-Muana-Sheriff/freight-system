// Pushes driver telemetry at the socket layer and measures what the server
// actually got through.
//
//   LOAD_TEST_TOKEN=<a DRIVER jwt> METRICS_TOKEN=<token> node ops/load-test.js
//   LOAD_TEST_COUNT=5000 node ops/load-test.js
//
// The previous version of this file reported a throughput number that was
// not a measurement. It emitted N fire-and-forget socket events, slept a
// fixed 1000ms, and divided N by the elapsed second — so "throughput" was
// always simply N, whatever the server did. Worse, it instructed the
// operator to authenticate with a dispatcher/admin token, and server.js
// drops telemetry from any non-driver socket at its first guard. Every
// event was discarded. A 7,500-ping run wrote zero rows and still printed a
// throughput of 4,906/s.
//
// So this now insists on the two things that make the number mean
// something: the events must be admissible, and the server must be observed
// to have counted them.
import { setTimeout as delay } from 'timers/promises';
import { io as socketClient } from 'socket.io-client';
import { appConfig } from '../config/appConfig.js';
import pool from '../config/db.js';

const baseUrl = process.env.API_BASE || `http://localhost:${appConfig.port}`;
const token = process.env.LOAD_TEST_TOKEN;
const simulatorSecret = process.env.LOAD_TEST_SIMULATOR_SECRET;
const telemetryCount = Number.parseInt(process.env.LOAD_TEST_COUNT || '100', 10);
const driverNamePrefix = process.env.LOAD_TEST_DRIVER_PREFIX || 'loadtest';
const settleMs = Number.parseInt(process.env.LOAD_TEST_SETTLE_MS || '30000', 10);

if (!token && !simulatorSecret) {
    console.error(
        'Need either LOAD_TEST_TOKEN (a DRIVER access token — an admin or\n' +
        'dispatcher token is silently dropped by the telemetry handler) or\n' +
        'LOAD_TEST_SIMULATOR_SECRET matching the server\'s SIMULATOR_SHARED_SECRET.'
    );
    process.exit(1);
}

// Counts what actually landed, by looking at the rows.
//
// The obvious probe — kigali_socket_events_by_name_total — is the wrong one,
// and wrong in a way that would have recreated the original bug in new
// clothes. server.js calls observeSocketEvent() at the top of the handler,
// *before* the guard that drops telemetry from non-driver sockets, so the
// counter rises for discarded events too. Pointing this at metrics reported
// 300 processed and 0 dropped for an admin token whose events all went in
// the bin. The database is the only place that knows the difference.
const EVENT = 'driver:telemetry-push';

// driver_location_history, not driver_locations. The latter carries a UNIQUE
// on driver_name and upserts, so a thousand pings from one driver leave one
// row and would read as 999 drops. History is append-only and is what the
// per-ping volume actually lands in.
//
// It also has a foreign key to users(username), which is worth knowing
// before anyone tries to load-test with invented driver names: synthetic
// identities cannot be written at all. Real driver accounts are the only
// way to exercise this path.
const runStartedAt = new Date();
async function processedCount() {
    const { rows } = await pool.query(
        'SELECT COUNT(*)::int AS n FROM driver_location_history WHERE recorded_at >= $1',
        [runStartedAt]
    );
    return rows[0].n;
}

const socket = socketClient(baseUrl, {
    auth: simulatorSecret
        ? { username: `sim_driver_${process.pid}`, simulatorSecret }
        : { token: `Bearer ${token}` },
    transports: ['websocket'],
});

await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket connection timed out.')), 10000);
    socket.on('connect', () => { clearTimeout(timeout); resolve(); });
    socket.on('connect_error', (err) => { clearTimeout(timeout); reject(err); });
});

const before = await processedCount();

const startedAt = Date.now();
for (let index = 0; index < telemetryCount; index += 1) {
    socket.emit(EVENT, {
        driverName: `${driverNamePrefix}-${index}`,
        lat: -1.95 + index * 0.0001,
        lng: 30.08 + index * 0.0001,
    });
}
const emitMs = Date.now() - startedAt;

// Wait for the server's counter to catch up rather than for a fixed sleep,
// so the elapsed time reflects the server draining the queue instead of an
// arbitrary constant. Stops early once it stops moving: if events are being
// dropped the counter plateaus below target, and that plateau is the
// finding, not something to keep waiting on.
let processed = 0;
let stableFor = 0;
let last = -1;
const deadline = Date.now() + settleMs;
while (Date.now() < deadline) {
    await delay(250);
    processed = (await processedCount()) - before;
    if (processed >= telemetryCount) break;
    stableFor = processed === last ? stableFor + 250 : 0;
    last = processed;
    if (stableFor >= 3000) break;
}
const elapsedMs = Date.now() - startedAt;
const dropped = telemetryCount - processed;

console.log(JSON.stringify({
    baseUrl,
    identity: simulatorSecret ? 'simulator' : 'driver-token',
    telemetryCount,
    emitMs,
    elapsedMs,
    processed,
    dropped,
    throughputPerSecond: Number((processed / (elapsedMs / 1000)).toFixed(2)),
}, null, 2));

socket.disconnect();
await pool.end();

if (dropped > 0) {
    console.error(`\n❌ ${dropped} of ${telemetryCount} events never reached the handler.`);
    process.exit(1);
}
