// routes/stopRoutes.js
import { Router } from 'express';
import { StopController } from '../controllers/stopController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

const OPERATIONAL_ROLES = ['admin', 'dispatcher'];
const writeLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, keyPrefix: 'stop-write' });

router.get('/', authMiddleware(OPERATIONAL_ROLES), StopController.getStops);
router.post('/', authMiddleware(OPERATIONAL_ROLES), writeLimit, StopController.createStop);
router.delete('/:id', authMiddleware(OPERATIONAL_ROLES), writeLimit, StopController.deleteStop);

export default router;
