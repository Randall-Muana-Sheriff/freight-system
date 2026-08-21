// routes/safetyChecklistRoutes.js
import express from 'express';
import { SafetyChecklistController } from '../controllers/safetyChecklistController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

// A driver ticks 5 checklist items once per shift, so this is generous
// headroom for real use (including un-ticking and re-ticking) while still
// bounding a runaway client — the only write endpoint in the app that was
// previously unlimited. Keyed per-driver, matching the other
// driver-authenticated limiters rather than per-IP.
const checklistWriteLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    keyPrefix: 'safety-checklist',
    keyFn: (req) => req.user?.username || req.ip,
});

router.get('/today', authMiddleware(['driver']), SafetyChecklistController.getTodayChecklist);
router.get('/vehicle-defects', authMiddleware(['driver']), SafetyChecklistController.getOpenVehicleDefects);
router.patch('/today', authMiddleware(['driver']), checklistWriteLimit, SafetyChecklistController.updateChecklistItem);

export default router;
