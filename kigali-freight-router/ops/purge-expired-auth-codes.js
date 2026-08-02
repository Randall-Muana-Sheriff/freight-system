// Deletes rows from otp_codes and driver_invites once they're no longer
// useful for anything. Without this, both tables just grow forever: every
// login attempt writes a row that's only ever read once, and old rows
// carry real phone numbers with no retention limit. Run daily via
// ops/systemd/kigali-purge-auth-codes.timer, matching the existing
// kigali-backup.timer pattern.
import pool from '../config/db.js';

async function purgeExpiredOtpCodes() {
    // Only expires_at — not "OR consumed_at IS NOT NULL". The verify
    // endpoint deliberately looks up a phone's latest row (consumed or
    // not) to tell a driver "that code was already used" instead of the
    // more confusing "that code has expired" (see driverAuthController.js
    // otp/verify) — purging a just-consumed row immediately would silently
    // downgrade that error message for the rest of its natural 5-minute
    // window. Waiting for the real expiry costs nothing and keeps that
    // distinction intact for as long as it's ever actually useful.
    const result = await pool.query(
        `DELETE FROM otp_codes WHERE expires_at < NOW() RETURNING id;`
    );
    return result.rowCount;
}

async function purgeExpiredDriverInvites() {
    const result = await pool.query(
        `DELETE FROM driver_invites WHERE expires_at < NOW() OR used_at IS NOT NULL RETURNING id;`
    );
    return result.rowCount;
}

const [otpCodesRemoved, driverInvitesRemoved] = await Promise.all([
    purgeExpiredOtpCodes(),
    purgeExpiredDriverInvites(),
]);

console.log(JSON.stringify({ otpCodesRemoved, driverInvitesRemoved }));
await pool.end();
