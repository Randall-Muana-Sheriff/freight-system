import { Router } from 'express';
import { ExceptionController } from '../controllers/exceptionController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

// Dispatch and admin. This is a roll-up of everything wrong across the whole
// operation -- other drivers' paperwork, other jobs' faults -- so it is not a
// driver's view of anything, and a driver token must not open it.
router.get('/', authMiddleware(['admin', 'dispatcher']), ExceptionController.getExceptions);

export default router;
