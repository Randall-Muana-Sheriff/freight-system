import { Router } from 'express';
import multer from 'multer';
import { DriverDocumentController } from '../controllers/driverDocumentController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Held in memory only long enough to stream to R2, same as delivery
// confirmation photos. 8MB comfortably fits a phone photo or a scanned PDF.
// fileFilter is a cheap first-pass check on declared mimetype; the
// authoritative byte-level check is assertRealFileType in r2Client.js.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype)) return cb(null, true);
        cb(new Error('Only JPEG, PNG, or PDF documents are accepted.'));
    },
});

const uploadLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    keyPrefix: 'document-upload',
    keyFn: (req) => req.user?.username || req.ip,
});
const reviewWriteLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, keyPrefix: 'document-review' });

router.get('/mine', authMiddleware(['driver']), DriverDocumentController.getMyDocuments);
router.post('/', authMiddleware(['driver']), uploadLimit, upload.single('document'), DriverDocumentController.uploadDocument);
router.get('/', authMiddleware(['admin', 'dispatcher']), DriverDocumentController.getAllDocuments);
router.patch('/:id/status', authMiddleware(['admin']), reviewWriteLimit, DriverDocumentController.updateDocumentStatus);

export default router;
