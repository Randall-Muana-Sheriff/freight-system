import bcrypt from 'bcrypt';
import pool from '../config/db.js';
import { appendAuditLog } from '../services/auditLogService.js';
import { ok, fail, errorMessage } from '../utils/httpResponse.js';
import { ALLOWED_ROLES } from '../utils/roles.js';

// Staff accounts (dispatcher/admin) are only ever created here, by an
// existing admin. 'driver' is deliberately excluded — drivers self-signup
// from the mobile app via POST /api/auth/signup.
const STAFF_ROLES = ['admin', 'dispatcher'];

export const AdminController = {
    getUsers: async (req, res) => {
        try {
            const result = await pool.query('SELECT id, username, role FROM users ORDER BY id DESC');
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
            const passwordHash = await bcrypt.hash(password, 10);
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

        if (!ALLOWED_ROLES.includes(String(role).toLowerCase())) {
            return fail(res, {
                status: 400,
                code: 'ADMIN_ROLE_INVALID',
                message: `Role must be one of: ${ALLOWED_ROLES.join(', ')}.`,
            });
        }

        try {
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
                    ? `Assigned driver ${normalizedDriverId} to vehicle ${result.rows[0].plateNumber}`
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

    getAuditLogs: async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT id, action_type AS "actionType", description, username, created_at AS "timestamp"
                 FROM system_audit_logs
                 ORDER BY created_at DESC
                 LIMIT 100`
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
};
