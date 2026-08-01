import { Router } from 'express';
import { DriverAuthController } from '../controllers/driverAuthController.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { normalizePhone } from '../utils/phone.js';

const router = Router();

// Keyed by phone number, not IP — OTP spam and PIN/invite brute-forcing are
// per-victim attacks (many IPs could target one driver's number), so an
// IP-based limit alone wouldn't protect the actual target. Must normalize
// first: keying on the raw string let "0788123456", "788123456", and
// "+250788123456" each rack up their own separate quota for the same real
// number, tripling the effective limit. Falls back to the raw input when it
// doesn't parse as a valid number so a garbage payload still gets *a*
// bucket (and 400s downstream in the controller) instead of skipping the
// limiter's key namespace entirely.
const byPhone = (req) => normalizePhone(req.body?.phoneNumber) || req.body?.phoneNumber;
const bySessionPhone = (req) => req.body?.otpSessionToken; // pre-verify, so we can only key by the opaque token itself

const otpRequestLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 3, keyPrefix: 'driver-otp-request', keyFn: byPhone });
const otpVerifyLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 8, keyPrefix: 'driver-otp-verify', keyFn: byPhone });
const inviteVerifyLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 8, keyPrefix: 'driver-invite-verify', keyFn: bySessionPhone });
const pinSetLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 8, keyPrefix: 'driver-pin-set', keyFn: bySessionPhone });
const pinLoginLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 8, keyPrefix: 'driver-pin-login', keyFn: bySessionPhone });

router.post('/otp/request', otpRequestLimit, DriverAuthController.requestOtp);
router.post('/otp/verify', otpVerifyLimit, DriverAuthController.verifyOtp);
router.post('/invite/verify', inviteVerifyLimit, DriverAuthController.verifyInvite);
router.post('/pin/set', pinSetLimit, DriverAuthController.setPin);
router.post('/pin/login', pinLoginLimit, DriverAuthController.loginPin);

export default router;
