import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// Kiosk devices are unattended wall displays, not people — there is no
// human to re-authenticate periodically, so the JWT itself has no
// expiry. Revocation is handled entirely by the kiosk_devices row instead
// (see verifyKioskToken), which is what lets a lost or decommissioned
// display be cut off without rotating JWT_SECRET and logging out every
// dispatcher and driver session in the process.
export async function createKioskDevice(label) {
    // token_hash has to be the hash of the actual bearer token this device
    // will present on every request — and that token embeds deviceId, so
    // it can't be signed until the row (and its id) already exists. Insert
    // first with a placeholder, sign once the id is known, then store the
    // real hash.
    const insertResult = await pool.query(
        `INSERT INTO kiosk_devices (label, token_hash) VALUES ($1, '') RETURNING id, label, created_at AS "createdAt"`,
        [label]
    );
    const device = insertResult.rows[0];

    const token = jwt.sign({ role: 'kiosk', deviceId: device.id }, process.env.JWT_SECRET);
    await pool.query(`UPDATE kiosk_devices SET token_hash = $1 WHERE id = $2`, [hashToken(token), device.id]);

    return { device, token };
}

export async function listKioskDevices() {
    const result = await pool.query(
        `SELECT id, label, created_at AS "createdAt", revoked_at AS "revokedAt", last_seen_at AS "lastSeenAt"
         FROM kiosk_devices ORDER BY id DESC`
    );
    return result.rows;
}

export async function revokeKioskDevice(id) {
    const result = await pool.query(
        `UPDATE kiosk_devices SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL RETURNING id`,
        [id]
    );
    return result.rowCount > 0;
}

// Unlike the stateless JWTs used everywhere else, a kiosk token needs a DB
// hit to check revocation — acceptable given this only ever runs for a
// handful of unattended devices' REST calls, not a high-QPS path. That
// same DB hit doubles as a heartbeat: every successful verification bumps
// last_seen_at, which is what lets an admin actually tell an unattended
// display is still alive (see listKioskDevices) rather than just hoping.
export async function verifyKioskToken(token) {
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return null;
    }
    if (decoded.role !== 'kiosk' || !decoded.deviceId) return null;

    const result = await pool.query(
        `UPDATE kiosk_devices SET last_seen_at = NOW()
         WHERE id = $1 AND token_hash = $2 AND revoked_at IS NULL
         RETURNING id, label`,
        [decoded.deviceId, hashToken(token)]
    );
    if (result.rowCount === 0) return null;

    return { role: 'kiosk', deviceId: decoded.deviceId, label: result.rows[0].label };
}
