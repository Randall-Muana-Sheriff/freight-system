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
// One phone number whose verification code is fixed instead of texted.
//
// App Review runs on a fresh install from California with no Rwandan SIM.
// Sign-in here is phone -> SMS code -> PIN, and the PIN screen cannot be
// reached without passing the code step, so a reviewer gets stuck on the
// second screen no matter what credentials they are given. That is a
// guideline 2.1 rejection, and demo credentials in the review notes do not
// address it, because the credentials were never the obstacle — the text
// message was.
//
// Deliberately not a bypass. The code is still generated, still stored
// hashed, still expires on the same clock, still rate-limited, and the
// number must still belong to a registered driver who then still has to
// enter the right PIN. The only differences for this one number are that
// the code is a known constant rather than random, and no SMS is sent.
// Every other number is untouched.
//
// Inert unless both variables are set, so the default — including every
// existing deployment — behaves exactly as before. Keep it enabled after
// launch: each update is reviewed too, and the reviewer hits this same
// wall every time.
const REVIEW_DEMO_PHONE = normalizePhone(process.env.APP_REVIEW_DEMO_PHONE || '');
const REVIEW_DEMO_OTP = String(process.env.APP_REVIEW_DEMO_OTP || '').trim();
const REVIEW_DEMO_ENABLED = Boolean(REVIEW_DEMO_PHONE) && /^\d{6}$/.test(REVIEW_DEMO_OTP);

if (process.env.APP_REVIEW_DEMO_PHONE && !REVIEW_DEMO_ENABLED) {
    // Silence here would mean a reviewer waiting for a text that is never
    // coming, and nobody finding out until the rejection arrives.
    console.warn(
        '⚠️  APP_REVIEW_DEMO_PHONE is set but the review sign-in is NOT active — ' +
        'APP_REVIEW_DEMO_OTP must also be set to exactly six digits, and the phone must be a valid number.'
    );
}

function isReviewDemoPhone(phone) {
    return REVIEW_DEMO_ENABLED && phone === REVIEW_DEMO_PHONE;
}

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
            return fail(res, { status: 400, code: 'DRIVER_AUTH_INVALID_PHONE', message: 'Enter a valid mobile number we can text — 07… or +250…, or the full international number.' });
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

            // Same row, same hashing, same expiry for both paths — only the
            // value differs, and only for the review number.
            const forReview = isReviewDemoPhone(phone);
            const code = forReview ? REVIEW_DEMO_OTP : generateOtpCode();
            const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
            await pool.query(
                `INSERT INTO otp_codes (phone_number, code_hash, expires_at) VALUES ($1, $2, $3)`,
                [phone, hashCode(code), expiresAt]
            );

            // Whether the text actually went. sendSms never throws -- it
            // returns { sent: false } when Africa's Talking is unconfigured,
            // out of credit, or rejects the recipient. This used to be
            // discarded, and the endpoint answered "accepted" either way, so
            // a driver was told a code was on its way and then waited for a
            // message that was never sent. Nobody found out: not the driver,
            // not dispatch, not the logs anyone reads.
            //
            // The code is still issued and still valid -- it can be read out
            // over the phone by a dispatcher -- so this is not a failure.
            // It is a fact the caller has to know in order to say something
            // true on screen. adminController's inviteDriver already returns
            // smsSent for exactly this reason.
            let smsSent = false;
            if (forReview) {
                // No SMS: the number belongs to App Review, not to a driver
                // holding a handset, and texting a real code to it would
                // both cost money and leak the constant over SMS.
                console.log('ℹ️  Review sign-in code issued (no SMS sent).');
                smsSent = true;
            } else {
                const result = await sendSms(phone, `Your Inzira verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`);
                smsSent = result.sent;
                if (!smsSent) {
                    console.warn(`⚠️  OTP issued for ${phone} but no SMS was sent (${result.reason || 'sms unavailable'}).`);
                }
            }

            return ok(res, { accepted: true, smsSent });
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
                const updateResult = await pool.query(
                    `UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts`,
                    [otpRow.id]
                );
                // Fires exactly once per code, right as it gets locked out (the
                // guard above already short-circuits any further guesses against
                // it as "expired"). A delivery failure here should never affect
                // the verify response, which is why this isn't awaited.
                if (updateResult.rows[0].attempts >= OTP_MAX_ATTEMPTS) {
                    sendSms(phone, 'Multiple incorrect codes were entered on your Inzira account. If this wasn\'t you, contact dispatch.').catch(() => {});
                }
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
                // status included deliberately: this path had no account
                // check at all, so a suspended driver could still sign in
                // with their PIN — the one case suspension exists for.
                `SELECT id, username, role, pin_hash, status FROM users WHERE phone_number = $1 AND role = 'driver'`,
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

            // Checked only once the PIN is proven, for the same reason as
            // the comment above: answering "suspended" to an unauthenticated
            // guess would confirm the account exists to anyone working
            // through phone numbers. A driver who knows their own PIN has
            // already proven who they are and deserves the real reason.
            if (user.status === 'suspended') {
                return fail(res, {
                    status: 403,
                    code: 'DRIVER_AUTH_ACCOUNT_SUSPENDED',
                    message: 'This account has been suspended. Contact dispatch.',
                });
            }

            return ok(res, await issueFinalTokens(user));
        } catch (error) {
            return fail(res, { status: 500, code: 'DRIVER_AUTH_PIN_LOGIN_ERROR', message: errorMessage(error, 'Could not sign you in.') });
        }
    },
};
