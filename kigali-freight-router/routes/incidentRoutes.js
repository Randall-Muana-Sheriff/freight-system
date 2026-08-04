import { Router } from 'express';
import multer from 'multer';
import { IncidentController } from '../controllers/incidentController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { withKioskAccess } from '../middleware/kioskAuthMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Same shape as driverDocumentRoutes.js's upload config — memory-only,
// cheap declared-mimetype pre-filter, authoritative check is
// assertRealFileType in r2Client.js.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (['image/jpeg', 'image/png'].includes(file.mimetype)) return cb(null, true);
        cb(new Error('Only JPEG or PNG photos are accepted.'));
    },
});

const createLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    keyPrefix: 'incident-create',
    keyFn: (req) => req.user?.username || req.ip,
});
const statusWriteLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, keyPrefix: 'incident-status' });

router.get('/', withKioskAccess(['admin', 'dispatcher', 'kiosk']), IncidentController.getIncidents);
router.get('/mine', authMiddleware(['admin', 'driver', 'dispatcher']), IncidentController.getMyIncidents);
router.post('/', authMiddleware(['admin', 'driver', 'dispatcher']), createLimit, upload.single('photo'), IncidentController.createIncident);
router.patch('/:id/status', authMiddleware(['admin', 'dispatcher']), statusWriteLimit, IncidentController.updateIncidentStatus);

export default router;
