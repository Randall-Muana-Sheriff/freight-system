import { Router } from 'express';
import { GeofenceController } from '../controllers/geofenceController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

const OPERATIONAL_ROLES = ['admin', 'dispatcher'];
const writeLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, keyPrefix: 'geofence-write' });

router.get('/', authMiddleware(OPERATIONAL_ROLES), GeofenceController.getGeofences);
router.post('/', authMiddleware(OPERATIONAL_ROLES), writeLimit, GeofenceController.createGeofence);
router.delete('/:id', authMiddleware(OPERATIONAL_ROLES), writeLimit, GeofenceController.deleteGeofence);

export default router;
