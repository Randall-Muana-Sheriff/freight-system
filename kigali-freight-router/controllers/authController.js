import pool from '../config/db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { appConfig } from '../config/appConfig.js';
import { ok, fail, errorMessage } from '../utils/httpResponse.js';
import {
    issueRefreshToken,
    validateRefreshToken,
    revokeRefreshToken,
    revokeAllRefreshTokensForUser,
} from '../services/refreshTokenService.js';

// Access tokens are short-lived on purpose - if one leaks, the exposure
// window is small. Sessions stay alive across that expiry via the
// refresh token instead, so nobody gets logged out mid-shift.
const ACCESS_TOKEN_TTL = '15m';

function signAccessToken(user) {
    return jwt.sign({ username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export const AuthController = {
    // Verify user and issue a JWT token pair
    login: async (req, res) => {
        const { username, password } = req.body;
        if (!username) {
            return fail(res, {
                status: 400,
                code: 'AUTH_INVALID_PAYLOAD',
                message: 'Username is required',
            });
        }
        try {
            const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
            if (result.rows.length === 0) {
                return fail(res, {
                    status: 401,
                    code: 'AUTH_INVALID_CREDENTIALS',
                    message: 'Invalid username or password',
                });
            }

            const user = result.rows[0];
            const isMatch = await bcrypt.compare(password || '', user.password_hash);
            if (!isMatch) {
                return fail(res, {
                    status: 401,
                    code: 'AUTH_INVALID_CREDENTIALS',
                    message: 'Invalid username or password',
                });
            }

            // Checked after the password so a wrong password never leaks
            // whether a pending/rejected account even exists.
            if (user.status === 'pending') {
                return fail(res, {
                    status: 403,
                    code: 'AUTH_ACCOUNT_PENDING',
                    message: 'Your account is awaiting admin approval.',
                });
            }
            if (user.status === 'rejected') {
                return fail(res, {
                    status: 403,
                    code: 'AUTH_ACCOUNT_REJECTED',
                    message: 'Your account request was not approved. Contact your dispatcher.',
                });
            }

            const token = signAccessToken(user);
            const refreshToken = await issueRefreshToken(user.username);

            return ok(res, { token, refreshToken, role: user.role });
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'AUTH_LOGIN_FAILED',
                message: errorMessage(error, 'Login failed.'),
            });
        }
    },

    // POST /api/auth/refresh - exchanges a valid refresh token for a new
    // access token. Rotates the refresh token too (old one revoked, new
    // one issued) so a stolen-but-unused refresh token has a shrinking
    // window of usefulness rather than being valid for its full 30 days
    // regardless of legitimate use.
    refresh: async (req, res) => {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return fail(res, { status: 400, code: 'AUTH_REFRESH_TOKEN_REQUIRED', message: 'refreshToken is required.' });
        }

        try {
            const username = await validateRefreshToken(refreshToken);
            if (!username) {
                return fail(res, { status: 401, code: 'AUTH_REFRESH_TOKEN_INVALID', message: 'Refresh token is invalid, expired, or revoked.' });
            }

            const userResult = await pool.query('SELECT username, role FROM users WHERE username = $1', [username]);
            if (userResult.rows.length === 0) {
                return fail(res, { status: 401, code: 'AUTH_REFRESH_USER_NOT_FOUND', message: 'Account no longer exists.' });
            }
            const user = userResult.rows[0];

            await revokeRefreshToken(refreshToken);
            const newAccessToken = signAccessToken(user);
            const newRefreshToken = await issueRefreshToken(user.username);

            return ok(res, { token: newAccessToken, refreshToken: newRefreshToken, role: user.role });
        } catch (error) {
            return fail(res, { status: 500, code: 'AUTH_REFRESH_FAILED', message: errorMessage(error, 'Could not refresh session.') });
        }
    },

    // PATCH /api/auth/password - any authenticated user changes their own
    // password. Requires the current password (not just a valid session) so
    // a hijacked-but-still-logged-in session can't lock the real owner out.
    changePassword: async (req, res) => {
        const { currentPassword, newPassword } = req.body || {};
        const username = req.user?.username;

        if (typeof currentPassword !== 'string' || !currentPassword) {
            return fail(res, {
                status: 400,
                code: 'AUTH_CURRENT_PASSWORD_REQUIRED',
                message: 'Current password is required.',
            });
        }

        if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
            return fail(res, {
                status: 400,
                code: 'AUTH_INVALID_PASSWORD',
                message: 'New password must be 8 to 128 characters long.',
            });
        }

        try {
            const result = await pool.query('SELECT password_hash FROM users WHERE username = $1', [username]);
            if (result.rows.length === 0) {
                return fail(res, { status: 401, code: 'AUTH_ACCOUNT_NOT_FOUND', message: 'Account no longer exists.' });
            }

            const isMatch = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
            if (!isMatch) {
                return fail(res, {
                    status: 401,
                    code: 'AUTH_CURRENT_PASSWORD_INVALID',
                    message: 'Current password is incorrect.',
                });
            }

            const newHash = await bcrypt.hash(newPassword, appConfig.bcryptCost);
            await pool.query('UPDATE users SET password_hash = $1 WHERE username = $2', [newHash, username]);

            // Force every other session/device to re-authenticate with the
            // new password rather than staying signed in on the old one.
            await revokeAllRefreshTokensForUser(username);

            return ok(res, { message: 'Password updated successfully.' });
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'AUTH_PASSWORD_CHANGE_FAILED',
                message: errorMessage(error, 'Failed to update password.'),
            });
        }
    },

    // GET /api/auth/me - the calling account's own profile. Added for the
    // driver app's Profile screen: once a driver's `username` is their
    // phone number (see the phone/OTP/PIN auth flow), showing the raw
    // username as their "name" would be meaningless — this is where the
    // real full name and staff ID actually come from.
    me: async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT username, role, phone_number AS "phoneNumber", staff_id AS "staffId", full_name AS "fullName"
                 FROM users WHERE username = $1`,
                [req.user.username]
            );
            if (result.rows.length === 0) {
                return fail(res, { status: 404, code: 'AUTH_ACCOUNT_NOT_FOUND', message: 'Account no longer exists.' });
            }
            return ok(res, result.rows[0]);
        } catch (error) {
            return fail(res, { status: 500, code: 'AUTH_ME_FAILED', message: errorMessage(error, 'Failed to load your account.') });
        }
    },

    // POST /api/auth/logout - revokes the refresh token so it can't be used
    // again even if it leaked. The access token itself can't be revoked
    // (JWTs are stateless by design) but it expires in 15 minutes anyway.
    logout: async (req, res) => {
        const { refreshToken } = req.body;
        try {
            await revokeRefreshToken(refreshToken);
            return ok(res, { message: 'Logged out.' });
        } catch (error) {
            return fail(res, { status: 500, code: 'AUTH_LOGOUT_FAILED', message: errorMessage(error, 'Logout failed.') });
        }
    },
};
