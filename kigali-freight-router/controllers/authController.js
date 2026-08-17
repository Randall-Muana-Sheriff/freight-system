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
import {
    TotpNotConfiguredError,
    generateTotpSecret,
    buildOtpauthUri,
    generateQrCodeDataUrl,
    verifyTotpCode,
    encryptSecret,
    decryptSecret,
    generateRecoveryCodes,
    consumeRecoveryCode,
} from '../services/totpService.js';

// Access tokens are short-lived on purpose - if one leaks, the exposure
// window is small. Sessions stay alive across that expiry via the
// refresh token instead, so nobody gets logged out mid-shift.
const ACCESS_TOKEN_TTL = '15m';
const MFA_SESSION_TTL = '5m';

// A bcrypt hash of a fixed, made-up value — never a real password, never
// matched against anything. Its only job is to give a nonexistent
// username somewhere to spend the same bcrypt.compare() time a real
// username would, so a login attempt takes the same wall-clock time
// either way. Without this, returning immediately for "no such user" but
// only after a bcrypt compare for "wrong password" turns the identical
// error message into a timing side-channel that reveals which usernames
// actually exist.
const TIMING_DECOY_HASH = '$2b$10$SyXgYaVUEJlpfQMIaTLAv.4GTDo/8z5RvWi76aK/KyY0wJkdlzBM2';

function signAccessToken(user) {
    return jwt.sign({ username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

async function issueSessionTokens(user) {
    const token = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user.username);
    return { token, refreshToken, role: user.role };
}

// A short-lived, purpose-scoped token bridging login's password step and
// mfa/verify-login's code step — mirrors driverAuthController.js's own
// otp-session-token pattern exactly. Never accepted by the
// general-purpose authMiddleware (different purpose claim, no role) and
// grants nothing beyond POST /api/auth/mfa/verify-login.
function signMfaSessionToken(username) {
    return jwt.sign({ username, purpose: 'mfa_pending' }, process.env.JWT_SECRET, { expiresIn: MFA_SESSION_TTL });
}

function verifyMfaSessionToken(token) {
    if (typeof token !== 'string' || !token) return null;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.purpose !== 'mfa_pending' || typeof decoded.username !== 'string') return null;
        return decoded;
    } catch {
        return null;
    }
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
            const user = result.rows[0];

            // Always run a real bcrypt.compare, win or lose, against either
            // the real hash or the decoy — see TIMING_DECOY_HASH above.
            const isMatch = await bcrypt.compare(password || '', user ? user.password_hash : TIMING_DECOY_HASH);
            if (!user || !isMatch) {
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
            if (user.status === 'suspended') {
                return fail(res, {
                    status: 403,
                    code: 'AUTH_ACCOUNT_SUSPENDED',
                    message: 'This account has been suspended. Contact an administrator.',
                });
            }
            if (user.status === 'rejected') {
                return fail(res, {
                    status: 403,
                    code: 'AUTH_ACCOUNT_REJECTED',
                    message: 'Your account request was not approved. Contact your dispatcher.',
                });
            }

            // MFA is opt-in per account (totp_enabled_at is only set once
            // someone has actually enrolled — see confirmMfa below), so
            // this branch changes nothing for every account that hasn't
            // turned it on.
            if (user.totp_enabled_at) {
                return ok(res, { mfaRequired: true, mfaSessionToken: signMfaSessionToken(user.username) });
            }

            return ok(res, await issueSessionTokens(user));
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'AUTH_LOGIN_FAILED',
                message: errorMessage(error, 'Login failed.'),
            });
        }
    },

    // POST /api/auth/mfa/verify-login - the second step of login for an
    // account with MFA enabled. Accepts either a live 6-digit TOTP code
    // or one of the ten single-use recovery codes issued at enrollment.
    verifyMfaLogin: async (req, res) => {
        const { mfaSessionToken, code, recoveryCode } = req.body || {};
        const session = verifyMfaSessionToken(mfaSessionToken);
        if (!session) {
            return fail(res, { status: 401, code: 'AUTH_MFA_SESSION_INVALID', message: 'Session expired — please log in again.' });
        }

        try {
            const result = await pool.query(
                'SELECT username, role, totp_secret, totp_recovery_code_hashes FROM users WHERE username = $1',
                [session.username]
            );
            const user = result.rows[0];
            if (!user || !user.totp_secret) {
                return fail(res, { status: 401, code: 'AUTH_MFA_NOT_ENABLED', message: 'MFA is no longer enabled on this account.' });
            }

            if (recoveryCode) {
                const remainingHashes = consumeRecoveryCode(user.totp_recovery_code_hashes, recoveryCode);
                if (!remainingHashes) {
                    return fail(res, { status: 401, code: 'AUTH_MFA_RECOVERY_CODE_INVALID', message: 'That recovery code is invalid or already used.' });
                }
                await pool.query('UPDATE users SET totp_recovery_code_hashes = $1 WHERE username = $2', [remainingHashes, user.username]);
                return ok(res, await issueSessionTokens(user));
            }

            const isValid = await verifyTotpCode(decryptSecret(user.totp_secret), code);
            if (!isValid) {
                return fail(res, { status: 401, code: 'AUTH_MFA_CODE_INVALID', message: 'Incorrect code.' });
            }

            return ok(res, await issueSessionTokens(user));
        } catch (error) {
            return fail(res, { status: 500, code: 'AUTH_MFA_VERIFY_FAILED', message: errorMessage(error, 'Could not verify MFA code.') });
        }
    },

    // POST /api/auth/mfa/enroll - generates a new secret and QR code.
    // Nothing is "enabled" yet — see confirmMfa, which requires proving
    // the code actually works before it counts.
    enrollMfa: async (req, res) => {
        try {
            const secret = generateTotpSecret();
            await pool.query('UPDATE users SET totp_pending_secret = $1 WHERE username = $2', [encryptSecret(secret), req.user.username]);
            const uri = buildOtpauthUri(secret, req.user.username);
            const qrCodeDataUrl = await generateQrCodeDataUrl(uri);
            return ok(res, { qrCodeDataUrl, manualEntrySecret: secret });
        } catch (error) {
            if (error instanceof TotpNotConfiguredError) {
                return fail(res, { status: 503, code: 'AUTH_MFA_NOT_CONFIGURED', message: error.message });
            }
            return fail(res, { status: 500, code: 'AUTH_MFA_ENROLL_FAILED', message: errorMessage(error, 'Could not start MFA enrollment.') });
        }
    },

    // POST /api/auth/mfa/confirm - proves the enrolled authenticator app
    // actually works before MFA is truly turned on, and issues the
    // one-time recovery codes.
    confirmMfa: async (req, res) => {
        const { code } = req.body || {};
        try {
            const result = await pool.query('SELECT totp_pending_secret FROM users WHERE username = $1', [req.user.username]);
            const pendingSecret = result.rows[0]?.totp_pending_secret;
            if (!pendingSecret) {
                return fail(res, { status: 400, code: 'AUTH_MFA_NO_PENDING_ENROLLMENT', message: 'Start enrollment first.' });
            }

            const isValid = await verifyTotpCode(decryptSecret(pendingSecret), code);
            if (!isValid) {
                return fail(res, { status: 401, code: 'AUTH_MFA_CODE_INVALID', message: 'Incorrect code.' });
            }

            const { codes, hashes } = generateRecoveryCodes();
            await pool.query(
                `UPDATE users SET totp_secret = $1, totp_pending_secret = NULL, totp_enabled_at = NOW(), totp_recovery_code_hashes = $2 WHERE username = $3`,
                [pendingSecret, hashes, req.user.username]
            );

            return ok(res, { recoveryCodes: codes });
        } catch (error) {
            return fail(res, { status: 500, code: 'AUTH_MFA_CONFIRM_FAILED', message: errorMessage(error, 'Could not confirm MFA enrollment.') });
        }
    },

    // POST /api/auth/mfa/disable - requires the current password so an
    // already-open (possibly hijacked) session can't silently turn MFA
    // off on its own.
    disableMfa: async (req, res) => {
        const { password } = req.body || {};
        try {
            const result = await pool.query('SELECT password_hash FROM users WHERE username = $1', [req.user.username]);
            const user = result.rows[0];
            if (!user) {
                return fail(res, { status: 401, code: 'AUTH_ACCOUNT_NOT_FOUND', message: 'Account no longer exists.' });
            }

            const isMatch = await bcrypt.compare(password || '', user.password_hash);
            if (!isMatch) {
                return fail(res, { status: 401, code: 'AUTH_CURRENT_PASSWORD_INVALID', message: 'Current password is incorrect.' });
            }

            await pool.query(
                `UPDATE users SET totp_secret = NULL, totp_pending_secret = NULL, totp_enabled_at = NULL, totp_recovery_code_hashes = NULL WHERE username = $1`,
                [req.user.username]
            );
            return ok(res, { message: 'MFA disabled.' });
        } catch (error) {
            return fail(res, { status: 500, code: 'AUTH_MFA_DISABLE_FAILED', message: errorMessage(error, 'Could not disable MFA.') });
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
                `SELECT username, role, phone_number AS "phoneNumber", staff_id AS "staffId", full_name AS "fullName",
                        (totp_enabled_at IS NOT NULL) AS "mfaEnabled"
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
