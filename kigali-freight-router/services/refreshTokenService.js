import { randomBytes, createHash } from 'crypto';
import pool from '../config/db.js';

const REFRESH_TOKEN_TTL_DAYS = 30;

function hashToken(rawToken) {
    return createHash('sha256').update(rawToken).digest('hex');
}

// Issues a new refresh token for a user, storing only its hash.
export async function issueRefreshToken(username) {
    const rawToken = randomBytes(40).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await pool.query(
        `INSERT INTO refresh_tokens (username, token_hash, expires_at) VALUES ($1, $2, $3);`,
        [username, tokenHash, expiresAt]
    );

    return rawToken;
}

// Validates a raw refresh token. Returns the associated username if valid,
// or null if it's missing, expired, revoked, or unrecognized.
export async function validateRefreshToken(rawToken) {
    if (!rawToken) return null;
    const tokenHash = hashToken(rawToken);

    const result = await pool.query(
        `SELECT username FROM refresh_tokens
         WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW();`,
        [tokenHash]
    );

    return result.rows[0]?.username ?? null;
}

// Revokes a single refresh token (used on refresh - rotate out the old one
// - and on explicit logout).
export async function revokeRefreshToken(rawToken) {
    if (!rawToken) return;
    const tokenHash = hashToken(rawToken);
    await pool.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1;`, [tokenHash]);
}

// Revokes every refresh token for a user - useful for a future "sign out
// everywhere" feature, not currently wired to an endpoint.
export async function revokeAllRefreshTokensForUser(username) {
    await pool.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE username = $1 AND revoked_at IS NULL;`,
        [username]
    );
}
