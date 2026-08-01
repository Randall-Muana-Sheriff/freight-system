import { Router } from 'express';
import { DispatchController } from '../controllers/dispatchController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Calls out to a shared public OSRM demo server per active vehicle — same
// reasoning as routeRoutes.js's optimizeLimit.
const matrixLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyPrefix: 'dispatch-matrix' });

router.post('/matrix', authMiddleware(['admin', 'dispatcher']), matrixLimit, DispatchController.getMatrix);

export default router;
