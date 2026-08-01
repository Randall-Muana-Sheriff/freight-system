import { Router } from 'express';
import { HubController } from '../controllers/hubController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();
const writeLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, keyPrefix: 'hub-write' });

router.get('/', authMiddleware(['admin', 'dispatcher']), HubController.getHubs);
router.post('/', authMiddleware(['admin', 'dispatcher']), writeLimit, HubController.createHub);
router.patch('/:id', authMiddleware(['admin', 'dispatcher']), writeLimit, HubController.updateHub);
router.delete('/:id', authMiddleware(['admin', 'dispatcher']), writeLimit, HubController.deleteHub);

export default router;
