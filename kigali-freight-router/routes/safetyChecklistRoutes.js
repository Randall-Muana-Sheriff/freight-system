// routes/safetyChecklistRoutes.js
import express from 'express';
import { SafetyChecklistController } from '../controllers/safetyChecklistController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/today', authMiddleware(['driver']), SafetyChecklistController.getTodayChecklist);
router.patch('/today', authMiddleware(['driver']), SafetyChecklistController.updateChecklistItem);

export default router;
