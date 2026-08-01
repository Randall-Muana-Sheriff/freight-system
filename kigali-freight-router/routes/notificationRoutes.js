import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();
const registerLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    keyPrefix: 'push-token-register',
    keyFn: (req) => req.user?.username || req.ip,
});

// Any authenticated role may register a device token for itself — in
// practice this is the driver mobile app, but there's no operational harm
// in a dispatcher/admin web session registering one too.
router.post('/register-token', authMiddleware(), registerLimit, NotificationController.registerToken);

export default router;
