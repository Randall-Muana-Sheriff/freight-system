import crypto from 'crypto';
import bcrypt from 'bcrypt';
import pool from '../config/db.js';
import { appConfig } from '../config/appConfig.js';
import { appendAuditLog, describeDriver, describeDriverById } from '../services/auditLogService.js';
import { ok, fail, errorMessage } from '../utils/httpResponse.js';
import { normalizePhone, generateInviteCode } from '../utils/phone.js';
import { sendSms } from '../services/smsService.js';
import { revokeAllRefreshTokensForUser } from '../services/refreshTokenService.js';
import { REQUIRED_DOCUMENT_TYPES } from '../services/driverVerificationService.js';
import { SAFETY_CHECKLIST_ITEMS } from './safetyChecklistController.js';
import { createKioskDevice, listKioskDevices, revokeKioskDevice } from '../services/kioskAuthService.js';

const INVITE_CODE_TTL_HOURS = 48;

function hashCode(code) {
    return crypto.createHash('sha256').update(code).digest('hex');
}

// Staff accounts (dispatcher/admin) are only ever created here, by an
// existing admin. 'driver' is deliberately excluded — drivers are onboarded
// via POST /api/admin/drivers/invite instead.
const STAFF_ROLES = ['admin', 'dispatcher'];

export const AdminController = {
    // `verified`/`hasVehicle` are only meaningful for role='driver' rows
    // (null for staff accounts) — computed here with the exact same
    // "all 5 required documents approved" definition isDriverVerified
    // uses for actual assignment enforcement, so the dispatcher's driver
    // picker (which filters on these) can never drift out of sync with
    // what the backend will actually allow.
    getUsers: async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT u.id, u.username, u.role, u.status,
                        u.phone_number AS "phoneNumber", u.staff_id AS "staffId", u.full_name AS "fullName",
                        CASE WHEN u.role = 'driver' THEN COALESCE(dv.approved_count, 0) = $1 ELSE NULL END AS verified,
                        CASE WHEN u.role = 'driver' THEN EXISTS (
                            SELECT 1 FROM fleet_vehicles fv WHERE fv.current_driver_id = u.id
                        ) ELSE NULL END AS "hasVehicle",
                        -- Today's pre-departure checks. Until now the only
                        -- reader of driver_safety_checklists was the driver
                        -- who wrote it, so a dispatcher had no way to know
                        -- whether anyone had checked their tyres — the
                        -- checklist recorded an answer nobody could see.
                        -- Deliberately not a gate: a missed tick should
                        -- start a conversation, not strand a driver
                        -- mid-shift.
                        CASE WHEN u.role = 'driver'
                             THEN COALESCE(sc.done_count, 0) ELSE NULL END AS "safetyChecksDone",
                        CASE WHEN u.role = 'driver'
                             THEN $3::int ELSE NULL END AS "safetyChecksTotal",
                        CASE WHEN u.role = 'driver'
                             THEN sc.updated_at ELSE NULL END AS "safetyChecksAt"
                 FROM users u
                 LEFT JOIN (
                     SELECT username, COUNT(*)::int AS approved_count
                     FROM driver_documents
                     WHERE document_type = ANY($2::text[]) AND status = 'approved'
                     GROUP BY username
                 ) dv ON dv.username = u.username
                 LEFT JOIN (
                     -- Only today's row: yesterday's checks say nothing
                     -- about the vehicle going out this morning.
                     SELECT driver_username, updated_at,
                            (SELECT COUNT(*) FROM jsonb_each(items) AS kv
                              WHERE kv.value = 'true'::jsonb)::int AS done_count
                     FROM driver_safety_checklists
                     WHERE checklist_date = CURRENT_DATE
                 ) sc ON sc.driver_username = u.username
                 ORDER BY u.id DESC;`,
                [REQUIRED_DOCUMENT_TYPES.length, REQUIRED_DOCUMENT_TYPES, SAFETY_CHECKLIST_ITEMS.length]
            );
            return ok(res, result.rows);
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'ADMIN_USERS_FETCH_FAILED',
                message: errorMessage(error, 'Failed to fetch users.'),
            });
        }
    },


    // POST /api/admin/users - creates a dispatcher or admin account directly
    // (the admin sets the initial password). This is the only way to create
    // a non-driver account; there is no self-signup for staff roles.
    createUser: async (req, res) => {
        const { username, password, role } = req.body || {};

        if (typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 50) {
            return fail(res, {
                status: 400,
                code: 'ADMIN_USER_INVALID_USERNAME',
                message: 'Username must be 3 to 50 characters long.',
            });
        }

        if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
            return fail(res, {
                status: 400,
                code: 'ADMIN_USER_INVALID_PASSWORD',
                message: 'Password must be at least 8 characters long.',
            });
        }

        if (!STAFF_ROLES.includes(String(role).toLowerCase())) {
            return fail(res, {
                status: 400,
                code: 'ADMIN_USER_INVALID_ROLE',
                message: `Role must be one of: ${STAFF_ROLES.join(', ')}.`,
            });
        }

        try {
            const passwordHash = await bcrypt.hash(password, appConfig.bcryptCost);
            const assignedRole = String(role).toLowerCase();
            const result = await pool.query(
                `INSERT INTO users (username, password_hash, role)
                 VALUES ($1, $2, $3)
                 RETURNING id, username, role`,
                [username.trim(), passwordHash, assignedRole]
            );
            const newUser = result.rows[0];

            await appendAuditLog({
                actionType: 'USER_CREATED',
                description: `Created ${newUser.role} account for ${newUser.username}`,
                username: req.user?.username || 'System',
            });

            return ok(res, { user: newUser }, { status: 201 });
        } catch (error) {
            if (error.code === '23505') {
                return fail(res, {
                    status: 400,
                    code: 'ADMIN_USER_USERNAME_TAKEN',
                    message: 'Username is already taken.',
                });
            }
            return fail(res, {
                status: 500,
                code: 'ADMIN_USER_CREATE_FAILED',
                message: errorMessage(error, 'Failed to create user.'),
            });
        }
    },

    // POST /api/admin/drivers/invite - the dispatcher-facing replacement for
    // driver self-signup: dispatch already knows who this driver is, so the
    // account is created directly (pre-approved) with a generated staff ID
    // and a 6-character invite code the driver redeems once from their
    // phone (POST /api/auth/driver/invite/verify). The new driver's
    // `username` is deliberately set to their phone number — every existing
    // FK/JWT that already keys off users.username (orders.assigned_to,
    // driver_locations.driver_name, etc.) keeps working with zero changes.
    inviteDriver: async (req, res) => {
        const { phoneNumber, fullName, vehicleId } = req.body || {};

        const phone = normalizePhone(phoneNumber);
        if (!phone) {
            return fail(res, { status: 400, code: 'ADMIN_INVITE_INVALID_PHONE', message: 'Enter a valid Rwandan mobile number.' });
        }
        if (typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 255) {
            return fail(res, { status: 400, code: 'ADMIN_INVITE_INVALID_NAME', message: 'Full name must be 2 to 255 characters long.' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // A driver who was invited but never actually finished
            // onboarding (their 48h invite code expired before they used
            // it, most commonly) previously had no way to be re-invited —
            // running this endpoint again would hit the phone_number
            // unique constraint and look like "already registered" even
            // though they never actually got in. Reuse that dangling row
            // and issue a fresh invite instead. A driver who HAS completed
            // onboarding is a real, active account, so that case still
            // correctly fails below via the same unique constraint.
            const existingResult = await client.query(
                `SELECT id FROM users WHERE phone_number = $1 AND role = 'driver' AND onboarding_completed_at IS NULL`,
                [phone]
            );
            const existing = existingResult.rows[0];

            let newDriver;
            if (existing) {
                const updatedResult = await client.query(
                    `UPDATE users SET full_name = $1 WHERE id = $2 RETURNING id, username, staff_id AS "staffId"`,
                    [fullName.trim(), existing.id]
                );
                newDriver = updatedResult.rows[0];
            } else {
                const staffIdResult = await client.query(`SELECT 'KF-' || nextval('staff_id_seq') AS "staffId"`);
                const staffId = staffIdResult.rows[0].staffId;

                const userResult = await client.query(
                    `INSERT INTO users (username, phone_number, full_name, staff_id, role, status)
                     VALUES ($1, $1, $2, $3, 'driver', 'approved')
                     RETURNING id, username, staff_id AS "staffId"`,
                    [phone, fullName.trim(), staffId]
                );
                newDriver = userResult.rows[0];
            }

            if (vehicleId !== undefined && vehicleId !== null && vehicleId !== '') {
                const vehicleResult = await client.query(
                    `UPDATE fleet_vehicles SET current_driver_id = $1 WHERE id = $2 AND current_driver_id IS NULL RETURNING id`,
                    [newDriver.id, vehicleId]
                );
                if (vehicleResult.rowCount === 0) {
                    await client.query('ROLLBACK');
                    return fail(res, { status: 409, code: 'ADMIN_INVITE_VEHICLE_UNAVAILABLE', message: 'That vehicle is no longer unassigned.' });
                }
            }

            // Invalidate any still-outstanding invite for this driver
            // before issuing a new one, so only the latest code ever works
            // rather than leaving an old valid code lying around too.
            await client.query(`UPDATE driver_invites SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`, [newDriver.id]);

            const inviteCode = generateInviteCode();
            const expiresAt = new Date(Date.now() + INVITE_CODE_TTL_HOURS * 60 * 60 * 1000);
            await client.query(
                `INSERT INTO driver_invites (user_id, invite_code_hash, expires_at) VALUES ($1, $2, $3)`,
                [newDriver.id, hashCode(inviteCode), expiresAt]
            );

            await client.query('COMMIT');

            const smsResult = await sendSms(
                phone,
                `Welcome to Inzira. Your driver invite code is ${inviteCode}. It expires in ${INVITE_CODE_TTL_HOURS} hours.`
            );

            await appendAuditLog({
                actionType: 'DRIVER_INVITED',
                description: `Invited driver ${fullName.trim()} (${newDriver.staffId}) at ${phone}`,
                username: req.user?.username || 'System',
            });

            return ok(res, {
                driverId: newDriver.id,
                staffId: newDriver.staffId,
                phoneNumber: phone,
                inviteCode,
                smsSent: smsResult.sent,
            }, { status: 201 });
        } catch (error) {
            await client.query('ROLLBACK');
            if (error.code === '23505') {
                return fail(res, { status: 400, code: 'ADMIN_INVITE_PHONE_TAKEN', message: 'A driver is already registered with that phone number.' });
            }
            return fail(res, { status: 500, code: 'ADMIN_INVITE_FAILED', message: errorMessage(error, 'Failed to invite driver.') });
        } finally {
            client.release();
        }
    },

    // POST /api/admin/users/:id/reset-driver-pin - the backend half of the
    // app's "Forgot your PIN? Contact dispatch" copy. Clears pin_hash only —
    // onboarding_completed_at stays set, so the driver's next otp/verify
    // still reports them as "returning" and routes straight back to PIN
    // setup, not through the invite-code step again.
    resetDriverPin: async (req, res) => {
        const { id } = req.params;
        try {
            const result = await pool.query(
                `UPDATE users SET pin_hash = NULL, pin_set_at = NULL
                 WHERE id = $1 AND role = 'driver'
                 RETURNING id, username`,
                [id]
            );
            if (result.rows.length === 0) {
                return fail(res, { status: 404, code: 'ADMIN_DRIVER_NOT_FOUND', message: 'Driver not found.' });
            }

            await appendAuditLog({
                actionType: 'DRIVER_PIN_RESET',
                description: `Reset PIN for ${await describeDriver(result.rows[0].username)}`,
                username: req.user?.username || 'System',
            });

            return ok(res, { message: 'PIN reset. The driver will be asked to set a new one at their next sign-in.' });
        } catch (error) {
            return fail(res, { status: 500, code: 'ADMIN_DRIVER_PIN_RESET_FAILED', message: errorMessage(error, 'Failed to reset PIN.') });
        }
    },

    // POST /admin/users/:id/revoke-sessions - forces any user (driver,
    // dispatcher, or admin) out of every device they're currently signed
    // into, by revoking all of their refresh tokens. Previously this
    // capability (revokeAllRefreshTokensForUser) only ran when a user
    // changed their OWN password — there was no way for an admin to react
    // to someone ELSE's compromised device (a stolen phone, a dispatcher
    // leaving the company) without waiting for that person to do it
    // themselves. The user's current access token, if any, still expires
    // on its own shortly after (short-lived by design) — this closes the
    // longer-lived refresh-token window immediately instead.
    revokeUserSessions: async (req, res) => {
        const { id } = req.params;
        try {
            const userResult = await pool.query('SELECT id, username FROM users WHERE id = $1', [id]);
            if (userResult.rows.length === 0) {
                return fail(res, { status: 404, code: 'ADMIN_USER_NOT_FOUND', message: 'User not found.' });
            }
            const { username } = userResult.rows[0];
            await revokeAllRefreshTokensForUser(username);

            await appendAuditLog({
                actionType: 'USER_SESSIONS_REVOKED',
                description: `Revoked all active sessions for ${username}`,
                username: req.user?.username || 'System',
            });

            return ok(res, { message: `All active sessions revoked for ${username}.` });
        } catch (error) {
            return fail(res, { status: 500, code: 'ADMIN_REVOKE_SESSIONS_FAILED', message: errorMessage(error, 'Failed to revoke sessions.') });
        }
    },

    // Role governance is scoped to staff (dispatcher/admin) accounts only —
    // a driver's role is never touched here in either direction. Drivers
    // are governed through account approval (users.status) and document
    // verification instead, both of which have their own dedicated review
    // flows; folding them into generic role-editing here would let a role
    // change silently bypass those.
    // PATCH /api/users/:id/status — disable or restore an account.
    //
    // The answer to "this person left" that deleting a row would get
    // wrong: orders, status logs, incidents and delivery confirmations all
    // reference the username, and that history has to stay attributable
    // long after the person is gone.
    updateUserStatus: async (req, res) => {
        const { id } = req.params;
        const { status } = req.body || {};

        if (status !== 'suspended' && status !== 'approved') {
            return fail(res, {
                status: 400,
                code: 'ADMIN_USER_STATUS_INVALID',
                message: "Status must be 'suspended' or 'approved'.",
            });
        }

        try {
            const target = await pool.query('SELECT id, username, role, status FROM users WHERE id = $1', [id]);
            if (target.rows.length === 0) {
                return fail(res, { status: 404, code: 'ADMIN_USER_NOT_FOUND', message: 'That account no longer exists.' });
            }
            const user = target.rows[0];

            // Two ways an admin could lock the business out of its own
            // system, both cheap to prevent and expensive to recover from.
            if (status === 'suspended') {
                if (user.username === req.user?.username) {
                    return fail(res, {
                        status: 400,
                        code: 'ADMIN_USER_SELF_SUSPEND',
                        message: 'You cannot suspend your own account.',
                    });
                }
                if (user.role === 'admin') {
                    const others = await pool.query(
                        `SELECT COUNT(*)::int AS n FROM users
                          WHERE role = 'admin' AND status = 'approved' AND id <> $1`,
                        [id]
                    );
                    if (others.rows[0].n === 0) {
                        return fail(res, {
                            status: 400,
                            code: 'ADMIN_USER_LAST_ADMIN',
                            message: 'This is the only active admin — promote another before suspending this one.',
                        });
                    }
                }
            }

            await pool.query('UPDATE users SET status = $1 WHERE id = $2', [status, id]);

            // Suspension has to bite immediately. Without this, an existing
            // refresh token would keep minting access tokens for a person
            // who was just removed — the login gate alone only stops the
            // next sign-in, not the session already in their pocket.
            if (status === 'suspended') {
                await revokeAllRefreshTokensForUser(user.username);
            }

            await appendAuditLog({
                actionType: status === 'suspended' ? 'USER_SUSPENDED' : 'USER_REINSTATED',
                description: `${user.username} (${user.role}) was ${status === 'suspended' ? 'suspended' : 'reinstated'}`,
                username: req.user?.username || 'System',
            });

            return ok(res, { id: user.id, username: user.username, status });
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'ADMIN_USER_STATUS_FAILED',
                message: errorMessage(error, 'Could not change that account.'),
            });
        }
    },

    updateUserRole: async (req, res) => {
        const { id } = req.params;
        const { role } = req.body;

        if (!role) {
            return fail(res, {
                status: 400,
                code: 'ADMIN_ROLE_REQUIRED',
                message: 'Role is required.',
            });
        }

        if (!STAFF_ROLES.includes(String(role).toLowerCase())) {
            return fail(res, {
                status: 400,
                code: 'ADMIN_ROLE_INVALID',
                message: `Role must be one of: ${STAFF_ROLES.join(', ')}.`,
            });
        }

        try {
            const currentResult = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
            if (currentResult.rows.length === 0) {
                return fail(res, { status: 404, code: 'ADMIN_USER_NOT_FOUND', message: 'User not found.' });
            }
            if (currentResult.rows[0].role === 'driver') {
                return fail(res, {
                    status: 400,
                    code: 'ADMIN_ROLE_DRIVER_NOT_GOVERNED',
                    message: 'Driver roles are managed through account approval and document verification, not role governance.',
                });
            }

            const result = await pool.query(
                'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, role',
                [String(role).toLowerCase(), id]
            );

            if (result.rowCount === 0) {
                return fail(res, {
                    status: 404,
                    code: 'ADMIN_USER_NOT_FOUND',
                    message: 'User not found.',
                });
            }

            await appendAuditLog({
                actionType: 'USER_ROLE_UPDATED',
                description: `Updated role for ${result.rows[0].username} to ${result.rows[0].role}`,
                username: req.user?.username || 'System',
            });

            return ok(res, { user: result.rows[0] });
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'ADMIN_ROLE_UPDATE_FAILED',
                message: errorMessage(error, 'Failed to update user role.'),
            });
        }
    },

    getVehicles: async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT
                    id,
                    plate_number AS "plateNumber",
                    vehicle_type AS "vehicleType",
                    current_driver_id AS "currentDriverId",
                    status,
                    max_weight_kg AS "maxWeightKg",
                    max_range_km AS "maxRangeKm"
                 FROM fleet_vehicles
                 ORDER BY id DESC`
            );
            return ok(res, result.rows);
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'ADMIN_VEHICLES_FETCH_FAILED',
                message: errorMessage(error, 'Failed to fetch vehicles.'),
            });
        }
    },

    // GET /api/vehicles/mine - a driver's own assigned vehicle (plate,
    // type, capacity). fleet_vehicles.current_driver_id is a FK to
    // users.id, but the JWT only carries username/role, so this joins
    // through users to resolve it.
    getMyVehicle: async (req, res) => {
        try {
            const username = req.user?.username;
            const result = await pool.query(
                `SELECT
                    fv.id,
                    fv.plate_number AS "plateNumber",
                    fv.vehicle_type AS "vehicleType",
                    fv.status,
                    fv.max_weight_kg AS "maxWeightKg",
                    fv.max_range_km AS "maxRangeKm"
                 FROM fleet_vehicles fv
                 JOIN users u ON u.id = fv.current_driver_id
                 WHERE u.username = $1
                 LIMIT 1;`,
                [username]
            );
            return ok(res, result.rows[0] || null);
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'VEHICLE_MINE_FETCH_FAILED',
                message: errorMessage(error, 'Failed to read your assigned vehicle.'),
            });
        }
    },

    createVehicle: async (req, res) => {
        const { name, type, maxWeight, maxRangeKm } = req.body;
        if (!name || !type) {
            return fail(res, {
                status: 400,
                code: 'ADMIN_VEHICLE_INVALID_PAYLOAD',
                message: 'Vehicle name and type are required.',
            });
        }

        // Both optional: a vehicle without a recorded weight limit is
        // allowed (assignment just skips the capacity check for it) rather
        // than blocking registration on data dispatchers may not have yet.
        const parsedMaxWeight = maxWeight === undefined || maxWeight === null || maxWeight === '' ? null : parseFloat(maxWeight);
        const parsedMaxRange = maxRangeKm === undefined || maxRangeKm === null || maxRangeKm === '' ? null : parseFloat(maxRangeKm);
        if (parsedMaxWeight !== null && (!Number.isFinite(parsedMaxWeight) || parsedMaxWeight <= 0)) {
            return fail(res, { status: 400, code: 'ADMIN_VEHICLE_INVALID_WEIGHT', message: 'Max weight must be a positive number.' });
        }
        if (parsedMaxRange !== null && (!Number.isFinite(parsedMaxRange) || parsedMaxRange <= 0)) {
            return fail(res, { status: 400, code: 'ADMIN_VEHICLE_INVALID_RANGE', message: 'Max range must be a positive number.' });
        }

        try {
            const result = await pool.query(
                `INSERT INTO fleet_vehicles (plate_number, vehicle_type, max_weight_kg, max_range_km)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, plate_number AS "plateNumber", vehicle_type AS "vehicleType", current_driver_id AS "currentDriverId", status,
                           max_weight_kg AS "maxWeightKg", max_range_km AS "maxRangeKm"`,
                [name, type, parsedMaxWeight, parsedMaxRange]
            );

            await appendAuditLog({
                actionType: 'VEHICLE_REGISTERED',
                description: `Registered vehicle ${name}`,
                username: req.user?.username || 'System',
            });

            return ok(res, { vehicle: result.rows[0] }, { status: 201 });
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'ADMIN_VEHICLE_CREATE_FAILED',
                message: errorMessage(error, 'Failed to create vehicle.'),
            });
        }
    },

    // PATCH /api/vehicles/:id/assign - pass a driverId to assign, or omit
    // it (null/undefined/'') to unassign — there was previously no way to
    // clear an assignment at all, which meant deleteVehicle's "must be
    // unassigned first" guardrail was a dead end without a direct DB edit.
    assignVehicle: async (req, res) => {
        const { id } = req.params;
        const { driverId } = req.body;
        const normalizedDriverId = driverId === undefined || driverId === null || driverId === '' ? null : driverId;

        try {
            const result = await pool.query(
                `UPDATE fleet_vehicles
                 SET current_driver_id = $1
                 WHERE id = $2
                 RETURNING id, plate_number AS "plateNumber", vehicle_type AS "vehicleType", current_driver_id AS "currentDriverId", status`,
                [normalizedDriverId, id]
            );

            if (result.rowCount === 0) {
                return fail(res, {
                    status: 404,
                    code: 'ADMIN_VEHICLE_NOT_FOUND',
                    message: 'Vehicle not found.',
                });
            }

            await appendAuditLog({
                actionType: normalizedDriverId ? 'VEHICLE_ASSIGNED' : 'VEHICLE_UNASSIGNED',
                description: normalizedDriverId
                    ? `Assigned ${await describeDriverById(normalizedDriverId)} to vehicle ${result.rows[0].plateNumber}`
                    : `Unassigned vehicle ${result.rows[0].plateNumber}`,
                username: req.user?.username || 'System',
            });

            return ok(res, { vehicle: result.rows[0] });
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'ADMIN_VEHICLE_ASSIGN_FAILED',
                message: errorMessage(error, 'Failed to assign vehicle.'),
            });
        }
    },

    // DELETE /api/vehicles/:id - refuses to delete a vehicle that's still
    // handed to a driver or still carrying active cargo, rather than
    // silently orphaning that driver's capacity tracking or an in-flight
    // order's vehicle_id (which the FK would otherwise just null out).
    deleteVehicle: async (req, res) => {
        const { id } = req.params;
        try {
            const vehicleResult = await pool.query(
                `SELECT id, plate_number, current_driver_id FROM fleet_vehicles WHERE id = $1;`,
                [id]
            );
            if (vehicleResult.rows.length === 0) {
                return fail(res, { status: 404, code: 'ADMIN_VEHICLE_NOT_FOUND', message: 'Vehicle not found.' });
            }
            const vehicle = vehicleResult.rows[0];

            if (vehicle.current_driver_id !== null) {
                return fail(res, {
                    status: 409,
                    code: 'ADMIN_VEHICLE_STILL_ASSIGNED',
                    message: 'Unassign this vehicle from its driver before deleting it.',
                });
            }

            const activeOrdersResult = await pool.query(
                `SELECT COUNT(*)::int AS count FROM orders WHERE vehicle_id = $1 AND status NOT IN ('DELIVERED', 'CANCELLED');`,
                [id]
            );
            if (activeOrdersResult.rows[0].count > 0) {
                return fail(res, {
                    status: 409,
                    code: 'ADMIN_VEHICLE_HAS_ACTIVE_ORDERS',
                    message: 'This vehicle still has active orders assigned to it.',
                });
            }

            await pool.query('DELETE FROM fleet_vehicles WHERE id = $1;', [id]);

            await appendAuditLog({
                actionType: 'VEHICLE_DELETED',
                description: `Deleted vehicle ${vehicle.plate_number}`,
                username: req.user?.username || 'System',
            });

            return ok(res, { message: 'Vehicle deleted.' });
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'ADMIN_VEHICLE_DELETE_FAILED',
                message: errorMessage(error, 'Failed to delete vehicle.'),
            });
        }
    },

    // GET /api/vehicle-types - the fleet registration form's "type" list,
    // previously a hardcoded 3-option dropdown with no way to add a
    // category without editing frontend source.
    getVehicleTypes: async (req, res) => {
        try {
            const result = await pool.query('SELECT id, name FROM vehicle_types ORDER BY name;');
            return ok(res, result.rows);
        } catch (error) {
            return fail(res, { status: 500, code: 'VEHICLE_TYPES_FETCH_FAILED', message: errorMessage(error, 'Failed to read vehicle types.') });
        }
    },

    createVehicleType: async (req, res) => {
        const { name } = req.body || {};
        if (typeof name !== 'string' || !name.trim()) {
            return fail(res, { status: 400, code: 'VEHICLE_TYPE_INVALID', message: 'A type name is required.' });
        }
        try {
            const result = await pool.query(
                'INSERT INTO vehicle_types (name) VALUES ($1) RETURNING id, name;',
                [name.trim()]
            );
            return ok(res, result.rows[0], { status: 201 });
        } catch (error) {
            if (error.code === '23505') {
                return fail(res, { status: 400, code: 'VEHICLE_TYPE_DUPLICATE', message: 'That vehicle type already exists.' });
            }
            return fail(res, { status: 500, code: 'VEHICLE_TYPE_CREATE_FAILED', message: errorMessage(error, 'Failed to create vehicle type.') });
        }
    },

    updateVehicleType: async (req, res) => {
        const { id } = req.params;
        const { name } = req.body || {};
        if (typeof name !== 'string' || !name.trim()) {
            return fail(res, { status: 400, code: 'VEHICLE_TYPE_INVALID', message: 'A type name is required.' });
        }
        try {
            const result = await pool.query(
                'UPDATE vehicle_types SET name = $1 WHERE id = $2 RETURNING id, name;',
                [name.trim(), id]
            );
            if (result.rows.length === 0) {
                return fail(res, { status: 404, code: 'VEHICLE_TYPE_NOT_FOUND', message: 'Vehicle type not found.' });
            }
            return ok(res, result.rows[0]);
        } catch (error) {
            if (error.code === '23505') {
                return fail(res, { status: 400, code: 'VEHICLE_TYPE_DUPLICATE', message: 'That vehicle type already exists.' });
            }
            return fail(res, { status: 500, code: 'VEHICLE_TYPE_UPDATE_FAILED', message: errorMessage(error, 'Failed to update vehicle type.') });
        }
    },

    // GET /api/settings/dispatch-contact - the admin-facing read of the same
    // value systemRoutes.js's public /dispatch-contact endpoint exposes to
    // the driver app, so an admin can see what's actually configured.
    getDispatchContact: async (req, res) => {
        try {
            const result = await pool.query('SELECT dispatch_phone_number FROM system_settings WHERE id = 1');
            return ok(res, { phoneNumber: result.rows[0]?.dispatch_phone_number || null });
        } catch (error) {
            return fail(res, { status: 500, code: 'DISPATCH_CONTACT_FETCH_FAILED', message: errorMessage(error, 'Failed to load dispatch contact.') });
        }
    },

    updateDispatchContact: async (req, res) => {
        const { phoneNumber } = req.body || {};
        // An empty/omitted number clears it (drivers just see the plain,
        // non-tappable text again) rather than being rejected outright.
        if (phoneNumber === '' || phoneNumber == null) {
            try {
                await pool.query('UPDATE system_settings SET dispatch_phone_number = NULL WHERE id = 1');
                return ok(res, { phoneNumber: null });
            } catch (error) {
                return fail(res, { status: 500, code: 'DISPATCH_CONTACT_UPDATE_FAILED', message: errorMessage(error, 'Failed to update dispatch contact.') });
            }
        }
        const normalized = normalizePhone(phoneNumber);
        if (!normalized) {
            return fail(res, { status: 400, code: 'DISPATCH_CONTACT_INVALID', message: 'Enter a valid Rwandan mobile number.' });
        }
        try {
            await pool.query('UPDATE system_settings SET dispatch_phone_number = $1 WHERE id = 1', [normalized]);
            return ok(res, { phoneNumber: normalized });
        } catch (error) {
            return fail(res, { status: 500, code: 'DISPATCH_CONTACT_UPDATE_FAILED', message: errorMessage(error, 'Failed to update dispatch contact.') });
        }
    },

    // DELETE /api/vehicle-types/:id - safe to remove freely: this is a
    // plain reference list, not a foreign key, so retiring a type here
    // never touches vehicles already registered with it (they keep their
    // stored text as-is) — it just stops showing up for new registrations.
    deleteVehicleType: async (req, res) => {
        const { id } = req.params;
        try {
            const result = await pool.query('DELETE FROM vehicle_types WHERE id = $1 RETURNING id;', [id]);
            if (result.rows.length === 0) {
                return fail(res, { status: 404, code: 'VEHICLE_TYPE_NOT_FOUND', message: 'Vehicle type not found.' });
            }
            return ok(res, { message: 'Vehicle type deleted.' });
        } catch (error) {
            return fail(res, { status: 500, code: 'VEHICLE_TYPE_DELETE_FAILED', message: errorMessage(error, 'Failed to delete vehicle type.') });
        }
    },

    // Was a hard-coded LIMIT 100 with no way to see anything older — fine
    // for a brand-new deployment, but a live fleet generates well over 100
    // audit entries within the first weeks, at which point earlier history
    // became permanently unreachable through this endpoint. Now paginated
    // via ?limit=&offset=, still capped (200 max) so a caller can't force
    // an unbounded scan of the table.
    getAuditLogs: async (req, res) => {
        const requestedLimit = parseInt(req.query?.limit, 10);
        const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 200) : 100;
        const requestedOffset = parseInt(req.query?.offset, 10);
        const offset = Number.isFinite(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;

        try {
            const result = await pool.query(
                `SELECT id, action_type AS "actionType", description, username, created_at AS "timestamp"
                 FROM system_audit_logs
                 ORDER BY created_at DESC
                 LIMIT $1 OFFSET $2`,
                [limit, offset]
            );
            return ok(res, result.rows);
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'ADMIN_AUDIT_FETCH_FAILED',
                message: errorMessage(error, 'Failed to fetch audit logs.'),
            });
        }
    },

    // GET /api/stats - system-wide counts for the admin statistics page.
    // Every piece here is a cheap aggregate against tables that already
    // exist — nothing new is tracked just to power this.
    getStats: async (req, res) => {
        try {
            const [accountsResult, vehiclesResult, ordersResult, deliveredThisWeekResult, incidentsResult, avgDeliveryResult] = await Promise.all([
                pool.query(`SELECT role, COUNT(*)::int AS count FROM users GROUP BY role`),
                pool.query(`SELECT COUNT(*)::int AS count FROM fleet_vehicles`),
                pool.query(`SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status`),
                pool.query(
                    `SELECT COUNT(*)::int AS count
                     FROM delivery_confirmations
                     WHERE confirmed_at >= NOW() - INTERVAL '7 days'`
                ),
                pool.query(
                    `SELECT COUNT(*)::int AS count
                     FROM geofence_alerts
                     WHERE event_type = 'MANUAL_INCIDENT' AND status = 'OPEN'`
                ),
                pool.query(
                    `SELECT AVG(EXTRACT(EPOCH FROM (dc.confirmed_at - o.created_at)) / 3600) AS avg_hours
                     FROM orders o
                     JOIN delivery_confirmations dc ON dc.order_id = o.id
                     WHERE o.status = 'DELIVERED'`
                ),
            ]);

            const accountsByRole = Object.fromEntries(accountsResult.rows.map((row) => [row.role, row.count]));
            const ordersByStatus = Object.fromEntries(ordersResult.rows.map((row) => [row.status, row.count]));
            const avgHours = avgDeliveryResult.rows[0]?.avg_hours;

            return ok(res, {
                accounts: {
                    driver: accountsByRole.driver || 0,
                    dispatcher: accountsByRole.dispatcher || 0,
                    admin: accountsByRole.admin || 0,
                },
                vehicles: vehiclesResult.rows[0]?.count || 0,
                ordersByStatus,
                deliveredThisWeek: deliveredThisWeekResult.rows[0]?.count || 0,
                openIncidents: incidentsResult.rows[0]?.count || 0,
                avgDeliveryHours: avgHours != null ? Number(avgHours) : null,
            });
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'ADMIN_STATS_FETCH_FAILED',
                message: errorMessage(error, 'Failed to fetch statistics.'),
            });
        }
    },

    // POST /api/admin/kiosk-devices - provisions a wall-display device
    // (control room, dispatch desk, warehouse). The raw token is only ever
    // returned here, once — same one-time-reveal pattern as inviteDriver's
    // invite code — the dashboard's job is to show it to whoever's setting
    // up the physical screen so they can paste it into that device's browser.
    createKioskDevice: async (req, res) => {
        const { label } = req.body || {};
        if (typeof label !== 'string' || label.trim().length < 2 || label.trim().length > 100) {
            return fail(res, { status: 400, code: 'ADMIN_KIOSK_INVALID_LABEL', message: 'Label must be 2 to 100 characters long.' });
        }

        try {
            const { device, token } = await createKioskDevice(label.trim());

            await appendAuditLog({
                actionType: 'KIOSK_DEVICE_CREATED',
                description: `Provisioned kiosk device "${device.label}"`,
                username: req.user?.username || 'System',
            });

            return ok(res, { id: device.id, label: device.label, createdAt: device.createdAt, token }, { status: 201 });
        } catch (error) {
            return fail(res, { status: 500, code: 'ADMIN_KIOSK_CREATE_FAILED', message: errorMessage(error, 'Failed to provision kiosk device.') });
        }
    },

    // GET /api/kiosk-devices/me - a device's own self-lookup, kiosk-role
    // only. verifyKioskToken already fetched the label as part of the same
    // query that checks revocation (see kioskAuthMiddleware), so this is
    // just handing back what's already on req.user — no extra DB hit.
    getMyKioskDevice: async (req, res) => {
        return ok(res, { label: req.user?.label || null });
    },

    // GET /api/admin/kiosk-devices - never returns the token itself (only
    // its hash is stored anyway) — just enough for an admin to see what's
    // out there and revoke anything that's lost or decommissioned.
    listKioskDevices: async (req, res) => {
        try {
            const devices = await listKioskDevices();
            return ok(res, devices);
        } catch (error) {
            return fail(res, { status: 500, code: 'ADMIN_KIOSK_LIST_FAILED', message: errorMessage(error, 'Failed to fetch kiosk devices.') });
        }
    },

    // DELETE /api/admin/kiosk-devices/:id - cuts the device off immediately
    // for any new REST call (an already-open socket connection may linger
    // until its next reconnect, an accepted tradeoff for a wall display).
    revokeKioskDevice: async (req, res) => {
        const { id } = req.params;
        try {
            const revoked = await revokeKioskDevice(id);
            if (!revoked) {
                return fail(res, { status: 404, code: 'ADMIN_KIOSK_NOT_FOUND', message: 'Kiosk device not found or already revoked.' });
            }

            await appendAuditLog({
                actionType: 'KIOSK_DEVICE_REVOKED',
                description: `Revoked kiosk device #${id}`,
                username: req.user?.username || 'System',
            });

            return ok(res, { revoked: true });
        } catch (error) {
            return fail(res, { status: 500, code: 'ADMIN_KIOSK_REVOKE_FAILED', message: errorMessage(error, 'Failed to revoke kiosk device.') });
        }
    },
};
