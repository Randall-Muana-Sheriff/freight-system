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

router.post('/login', authRateLimit, validateLoginPayload, AuthController.login);
router.post('/refresh', authRateLimit, AuthController.refresh);
router.get('/me', authMiddleware(), AuthController.me);
// No authMiddleware here on purpose — logout revokes by refresh-token
// value (see authController.js), so it must keep working even with an
// already-expired access token. Still rate-limited like its siblings as
// cheap defense-in-depth.
router.post('/logout', authRateLimit, AuthController.logout);
router.patch('/password', authRateLimit, authMiddleware(), AuthController.changePassword);

export default router;