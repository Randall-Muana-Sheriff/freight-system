import { Router } from 'express';
import { IncidentController } from '../controllers/incidentController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();
const createLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    keyPrefix: 'incident-create',
    keyFn: (req) => req.user?.username || req.ip,
});
const statusWriteLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, keyPrefix: 'incident-status' });

router.get('/', authMiddleware(['admin', 'dispatcher']), IncidentController.getIncidents);
router.get('/mine', authMiddleware(['admin', 'driver', 'dispatcher']), IncidentController.getMyIncidents);
router.post('/', authMiddleware(['admin', 'driver', 'dispatcher']), createLimit, IncidentController.createIncident);
router.patch('/:id/status', authMiddleware(['admin', 'dispatcher']), statusWriteLimit, IncidentController.updateIncidentStatus);

export default router;
