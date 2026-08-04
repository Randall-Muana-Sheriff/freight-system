import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { appConfig } from '../config/appConfig.js';
import { ok, fail, errorMessage } from '../utils/httpResponse.js';
import { normalizePhone, generateOtpCode } from '../utils/phone.js';
import { sendSms } from '../services/smsService.js';
import { issueRefreshToken } from '../services/refreshTokenService.js';
import { appendAuditLog } from '../services/auditLogService.js';

// Mirrors authController.js's access-token TTL/shape exactly — a driver
// session issued through this new phone/PIN flow must be indistinguishable
// from one issued through the old username/password login as far as every
// other route (authMiddleware, orders, telemetry) is concerned.
const ACCESS_TOKEN_TTL = '15m';
const OTP_TTL_MINUTES = 5;
const OTP_SESSION_TTL = '10m';
const OTP_MAX_ATTEMPTS = 5;

function hashCode(code) {
    return crypto.createHash('sha256').update(code).digest('hex');
}

function signAccessToken(user) {
    return jwt.sign({ username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

// A short-lived, purpose-scoped token that carries a verified phone number
// (and, once the invite step passes, an inviteVerified flag) between the
// otp/invite/pin-set steps of one onboarding attempt — without it, each
// step would have to re-prove phone ownership from scratch. It is never
// accepted by the general-purpose authMiddleware (different purpose claim,
// no role) and never grants access to anything beyond these five routes.
function signOtpSessionToken(claims) {
    return jwt.sign({ ...claims, purpose: 'driver_otp_session' }, process.env.JWT_SECRET, { expiresIn: OTP_SESSION_TTL });
}

function verifyOtpSessionToken(token) {
    if (typeof token !== 'string' || !token) return null;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.purpose !== 'driver_otp_session' || typeof decoded.phone !== 'string') return null;
        return decoded;
    } catch {
        return null;
    }
}

async function issueFinalTokens(user) {
    const token = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user.username);
    return { token, refreshToken, role: user.role };
}

export const DriverAuthController = {
    // POST /api/auth/driver/otp/request - starts both the new-driver
    // onboarding flow and the returning-driver login flow (they share this
    // same first step). Only phones a dispatcher has already invited exist
    // in the drivers table at all, so an unrecognized number fails here
    // with the same "contact dispatch" message the app's footer copy shows
    // — this isn't self-serve onboarding, so stating that plainly is fine.
    requestOtp: async (req, res) => {
        const phone = normalizePhone(req.body?.phoneNumber);
        if (!phone) {
            return fail(res, { status: 400, code: 'DRIVER_AUTH_INVALID_PHONE', message: 'Enter a valid Rwandan mobile number.' });
        }

        try {
            const userResult = await pool.query(`SELECT id FROM users WHERE phone_number = $1 AND role = 'driver'`, [phone]);
            if (userResult.rows.length === 0) {
                return fail(res, {
                    status: 404,
                    code: 'DRIVER_AUTH_PHONE_NOT_REGISTERED',
                    message: 'Your number must be registered with dispatch.',
                });
            }

            const code = generateOtpCode();
            const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
            await pool.query(
                `INSERT INTO otp_codes (phone_number, code_hash, expires_at) VALUES ($1, $2, $3)`,
                [phone, hashCode(code), expiresAt]
            );

            await sendSms(phone, `Your Inzira verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`);

            return ok(res, { accepted: true });
        } catch (error) {
            return fail(res, { status: 500, code: 'DRIVER_AUTH_OTP_REQUEST_FAILED', message: errorMessage(error, 'Could not send verification code.') });
        }
    },

    // POST /api/auth/driver/otp/verify
    verifyOtp: async (req, res) => {
        const phone = normalizePhone(req.body?.phoneNumber);
        const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
        if (!phone || !/^\d{6}$/.test(code)) {
            return fail(res, { status: 400, code: 'DRIVER_AUTH_INVALID_PAYLOAD', message: 'A phone number and 6-digit code are required.' });
        }

        try {
            // Looks up the latest code regardless of consumed_at (unlike
            // before) so a resubmit of an already-used code can be told
            // that specifically, instead of "expired" — which was
            // technically false and sent a driver looking for a new code
            // when re-entering the original one correctly would work fine.
            const otpResult = await pool.query(
                `SELECT id, code_hash, expires_at, attempts, consumed_at FROM otp_codes
                 WHERE phone_number = $1
                 ORDER BY created_at DESC LIMIT 1`,
                [phone]
            );
            const otpRow = otpResult.rows[0];
            if (!otpRow) {
                return fail(res, { status: 401, code: 'DRIVER_AUTH_OTP_EXPIRED', message: 'That code has expired. Request a new one.' });
            }
            if (otpRow.consumed_at) {
                return fail(res, { status: 401, code: 'DRIVER_AUTH_OTP_ALREADY_USED', message: 'That code has already been used. Request a new one.' });
            }
            if (new Date(otpRow.expires_at) < new Date() || otpRow.attempts >= OTP_MAX_ATTEMPTS) {
                return fail(res, { status: 401, code: 'DRIVER_AUTH_OTP_EXPIRED', message: 'That code has expired. Request a new one.' });
            }

            if (hashCode(code) !== otpRow.code_hash) {
                await pool.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [otpRow.id]);
                return fail(res, { status: 401, code: 'DRIVER_AUTH_OTP_INVALID', message: 'That code is incorrect.' });
            }

            await pool.query(`UPDATE otp_codes SET consumed_at = NOW() WHERE id = $1`, [otpRow.id]);

            const userResult = await pool.query(
                `SELECT onboarding_completed_at, pin_hash FROM users WHERE phone_number = $1 AND role = 'driver'`,
                [phone]
            );
            const user = userResult.rows[0];
            if (!user) {
                return fail(res, { status: 404, code: 'DRIVER_AUTH_PHONE_NOT_REGISTERED', message: 'Your number must be registered with dispatch.' });
            }

            const returning = !!user.onboarding_completed_at;
            const needsPinReset = returning && !user.pin_hash;

            return ok(res, { returning, needsPinReset, otpSessionToken: signOtpSessionToken({ phone }) });
        } catch (error) {
            return fail(res, { status: 500, code: 'DRIVER_AUTH_OTP_VERIFY_FAILED', message: errorMessage(error, 'Could not verify code.') });
        }
    },

    // POST /api/auth/driver/invite/verify - new-driver path only.
    verifyInvite: async (req, res) => {
        const session = verifyOtpSessionToken(req.body?.otpSessionToken);
        const inviteCode = typeof req.body?.inviteCode === 'string' ? req.body.inviteCode.trim().toUpperCase() : '';
        if (!session || !inviteCode) {
            return fail(res, { status: 401, code: 'DRIVER_AUTH_SESSION_INVALID', message: 'Your session expired. Start again.' });
        }

        try {
            const userResult = await pool.query(
                `SELECT id, staff_id AS "staffId", full_name AS "fullName" FROM users WHERE phone_number = $1 AND role = 'driver'`,
                [session.phone]
            );
            const user = userResult.rows[0];
            if (!user) {
                return fail(res, { status: 404, code: 'DRIVER_AUTH_PHONE_NOT_REGISTERED', message: 'Your number must be registered with dispatch.' });
            }

            const inviteResult = await pool.query(
                `SELECT id, invite_code_hash FROM driver_invites
                 WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()
                 ORDER BY created_at DESC LIMIT 1`,
                [user.id]
            );
            const invite = inviteResult.rows[0];
            if (!invite || hashCode(inviteCode) !== invite.invite_code_hash) {
                return fail(res, { status: 401, code: 'DRIVER_AUTH_INVITE_INVALID', message: 'That code is incorrect or has expired.' });
            }

            await pool.query(`UPDATE driver_invites SET used_at = NOW() WHERE id = $1`, [invite.id]);

            const vehicleResult = await pool.query(
                `SELECT plate_number AS "plateNumber", vehicle_type AS "vehicleType",
                        max_weight_kg AS "maxWeightKg", max_range_km AS "maxRangeKm"
                 FROM fleet_vehicles WHERE current_driver_id = $1 LIMIT 1`,
                [user.id]
            );

            return ok(res, {
                otpSessionToken: signOtpSessionToken({ phone: session.phone, inviteVerified: true }),
                staffId: user.staffId,
                fullName: user.fullName,
                role: 'Freight Driver',
                fleet: 'Inzira Central',
                vehicle: vehicleResult.rows[0] || null,
            });
        } catch (error) {
            return fail(res, { status: 500, code: 'DRIVER_AUTH_INVITE_VERIFY_FAILED', message: errorMessage(error, 'Could not verify invite code.') });
        }
    },

    // POST /api/auth/driver/pin/set - the app only calls this once, after
    // it has already had the driver type the PIN twice and compared the two
    // entries itself (see the driver app's AuthFlow — pin-set/pin-confirm is
    // a client-side-only comparison, matching the Figma spec's state model).
    setPin: async (req, res) => {
        const session = verifyOtpSessionToken(req.body?.otpSessionToken);
        const pin = typeof req.body?.pin === 'string' ? req.body.pin : '';
        // Kept as two checks, not one — conflating "session expired" (a real,
        // reachable case if a driver is slow getting through invite/reveal/
        // PIN setup within the token's 10-minute window) with "PIN wasn't 4
        // digits" (shouldn't happen given the client's PinPad, but if it
        // ever did it'd be a client bug) used to return the same message for
        // both, which told an expired-session driver to do something
        // (re-enter a 4-digit PIN) that could never fix their actual problem.
        if (!session) {
            return fail(res, { status: 401, code: 'DRIVER_AUTH_SESSION_INVALID', message: 'Your session expired. Start again.' });
        }
        if (!/^\d{4}$/.test(pin)) {
            return fail(res, { status: 400, code: 'DRIVER_AUTH_INVALID_PIN', message: 'A 4-digit PIN is required.' });
        }

        try {
            const userResult = await pool.query(
                `SELECT id, username, role, full_name AS "fullName", onboarding_completed_at, pin_hash FROM users WHERE phone_number = $1 AND role = 'driver'`,
                [session.phone]
            );
            const user = userResult.rows[0];
            if (!user) {
                return fail(res, { status: 404, code: 'DRIVER_AUTH_PHONE_NOT_REGISTERED', message: 'Your number must be registered with dispatch.' });
            }

            const alreadyOnboarded = !!user.onboarding_completed_at;
            const needsPinReset = alreadyOnboarded && !user.pin_hash;
            // inviteVerified is baked into the session token and stays true
            // for its whole 10-minute life, so without the !alreadyOnboarded
            // check here the same token could be replayed to silently
            // overwrite a driver's just-set PIN with no new proof of phone
            // ownership. Once onboarding is complete, the invite-verified
            // branch is spent — only a fresh dispatcher-triggered reset
            // (needsPinReset, which itself closes the instant pin_hash is
            // set again below) can open this back up.
            const canSetViaInvite = session.inviteVerified && !alreadyOnboarded;
            if (!canSetViaInvite && !needsPinReset) {
                return fail(res, { status: 403, code: 'DRIVER_AUTH_INVITE_REQUIRED', message: 'Verify your invite code first.' });
            }

            const pinHash = await bcrypt.hash(pin, appConfig.bcryptCost);
            await pool.query(
                `UPDATE users
                 SET pin_hash = $1, pin_set_at = NOW(), onboarding_completed_at = COALESCE(onboarding_completed_at, NOW())
                 WHERE id = $2`,
                [pinHash, user.id]
            );

            await appendAuditLog({
                actionType: alreadyOnboarded ? 'DRIVER_PIN_RESET_COMPLETED' : 'DRIVER_ONBOARDING_COMPLETED',
                description: `${user.fullName ? `${user.fullName} (${user.username})` : user.username} ${alreadyOnboarded ? 'set a new PIN after a dispatcher reset' : 'completed onboarding'}`,
            });

            return ok(res, await issueFinalTokens(user));
        } catch (error) {
            return fail(res, { status: 500, code: 'DRIVER_AUTH_PIN_SET_FAILED', message: errorMessage(error, 'Could not save your PIN.') });
        }
    },

    // POST /api/auth/driver/pin/login - returning-driver path.
    loginPin: async (req, res) => {
        const session = verifyOtpSessionToken(req.body?.otpSessionToken);
        const pin = typeof req.body?.pin === 'string' ? req.body.pin : '';
        if (!session) {
            return fail(res, { status: 401, code: 'DRIVER_AUTH_SESSION_INVALID', message: 'Your session expired. Start again.' });
        }
        if (!/^\d{4}$/.test(pin)) {
            return fail(res, { status: 400, code: 'DRIVER_AUTH_INVALID_PIN', message: 'A 4-digit PIN is required.' });
        }

        try {
            const userResult = await pool.query(
                `SELECT id, username, role, pin_hash FROM users WHERE phone_number = $1 AND role = 'driver'`,
                [session.phone]
            );
            const user = userResult.rows[0];
            // Deliberately the same generic error whether the phone doesn't
            // exist or the PIN just doesn't match — a wrong PIN should never
            // reveal account existence any more than a wrong password does
            // in authController.login.
            if (!user || !user.pin_hash || !(await bcrypt.compare(pin, user.pin_hash))) {
                return fail(res, { status: 401, code: 'DRIVER_AUTH_PIN_LOGIN_FAILED', message: 'Incorrect PIN.' });
            }

            return ok(res, await issueFinalTokens(user));
        } catch (error) {
            return fail(res, { status: 500, code: 'DRIVER_AUTH_PIN_LOGIN_ERROR', message: errorMessage(error, 'Could not sign you in.') });
        }
    },
};
