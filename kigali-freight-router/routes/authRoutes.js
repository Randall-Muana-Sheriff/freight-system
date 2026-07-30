import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { validateLoginPayload, validateSignupPayload } from '../middleware/validateAuthPayload.js';

const router = Router();

const authRateLimit = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 10,
	keyPrefix: 'auth',
});

router.post('/signup', authRateLimit, validateSignupPayload, AuthController.register);
router.post('/login', authRateLimit, validateLoginPayload, AuthController.login);
router.post('/refresh', authRateLimit, AuthController.refresh);
router.post('/logout', AuthController.logout);
router.patch('/password', authRateLimit, authMiddleware(), AuthController.changePassword);

export default router;