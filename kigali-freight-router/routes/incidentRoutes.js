import { Router } from 'express';
import { IncidentController } from '../controllers/incidentController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', authMiddleware(['admin', 'dispatcher']), IncidentController.getIncidents);
router.post('/', authMiddleware(['admin', 'driver', 'dispatcher']), IncidentController.createIncident);
router.patch('/:id/status', authMiddleware(['admin', 'dispatcher']), IncidentController.updateIncidentStatus);

export default router;
