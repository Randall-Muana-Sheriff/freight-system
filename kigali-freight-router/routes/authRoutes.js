import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { validateLoginPayload } from '../middleware/validateAuthPayload.js';

const router = Router();

const authRateLimit = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 40,
	keyPrefix: 'auth',
});

// A 6-digit TOTP code is only a million possibilities — tighter than the
// general auth limiter, and keyed per-account (or per login attempt, for
// the pre-login verify step where there's no authenticated user yet)
// rather than just per-IP, since a small number of admin/dispatcher
// accounts is exactly the narrow, valuable target this matters for.
const mfaRateLimit = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 8,
	keyPrefix: 'mfa',
	keyFn: (req) => req.user?.username || req.body?.mfaSessionToken || req.ip,
});

router.post('/login', authRateLimit, validateLoginPayload, AuthController.login);
router.post('/refresh', authRateLimit, AuthController.refresh);
router.get('/me', authMiddleware(), AuthController.me);
// No authMiddleware here on purpose — logout revokes by refresh-token
// value (see authController.js), so it must keep working even with an
// already-expired access token. Still rate-limited like its siblings as
// cheap defense-in-depth.
router.post('/logout', authRateLimit, AuthController.logout);
router.patch('/password', authRateLimit, authMiddleware(), AuthController.changePassword);

// Opt-in TOTP MFA — self-service on your own account (enroll/confirm/
// disable), plus the second login step for an account that already has
// it enabled.
router.post('/mfa/verify-login', mfaRateLimit, AuthController.verifyMfaLogin);
router.post('/mfa/enroll', authRateLimit, authMiddleware(), AuthController.enrollMfa);
router.post('/mfa/confirm', mfaRateLimit, authMiddleware(), AuthController.confirmMfa);
router.post('/mfa/disable', authRateLimit, authMiddleware(), AuthController.disableMfa);

export default router;