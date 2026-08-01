import pool from '../config/db.js';

// A driver's `username` is their phone number (see the invite flow), so any
// audit description that interpolates it raw reads as a phone number, not a
// name, to the admin reading the log. Both helpers resolve to "Full Name
// (phone)" when a name is on file, falling back to just the raw identifier
// for accounts without one (or on lookup failure) — never throws, since a
// display-string lookup should never be why an audit write fails.
export async function describeDriver(username) {
    if (!username) return username;
    try {
        const result = await pool.query(`SELECT full_name AS "fullName" FROM users WHERE username = $1`, [username]);
        const fullName = result.rows[0]?.fullName;
        return fullName ? `${fullName} (${username})` : username;
    } catch {
        return username;
    }
}

export async function describeDriverById(id) {
    if (!id) return `Driver #${id}`;
    try {
        const result = await pool.query(`SELECT username, full_name AS "fullName" FROM users WHERE id = $1`, [id]);
        const row = result.rows[0];
        if (!row) return `Driver #${id}`;
        return row.fullName ? `${row.fullName} (${row.username})` : row.username;
    } catch {
        return `Driver #${id}`;
    }
}

export async function appendAuditLog({ actionType, description, username = 'System' }) {
    try {
        await pool.query(
            `INSERT INTO system_audit_logs (action_type, description, username)
             VALUES ($1, $2, $3)`,
            [actionType, description, username]
        );
    } catch (error) {
        console.error('❌ Audit log write failed (run migrations):', error.message);
    }
}
