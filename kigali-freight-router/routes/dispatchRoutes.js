import { Router } from 'express';
import { DispatchController } from '../controllers/dispatchController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/matrix', authMiddleware(['admin', 'dispatcher']), DispatchController.getMatrix);

export default router;
