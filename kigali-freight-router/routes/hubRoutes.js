import { Router } from 'express';
import { HubController } from '../controllers/hubController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', authMiddleware(['admin', 'dispatcher']), HubController.getHubs);
router.post('/', authMiddleware(['admin', 'dispatcher']), HubController.createHub);
router.patch('/:id', authMiddleware(['admin', 'dispatcher']), HubController.updateHub);
router.delete('/:id', authMiddleware(['admin', 'dispatcher']), HubController.deleteHub);

export default router;
