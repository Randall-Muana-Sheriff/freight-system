import { Router } from 'express';
import multer from 'multer';
import { OrderController } from '../controllers/orderController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { withKioskAccess } from '../middleware/kioskAuthMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Delivery confirmation photos are held in memory only long enough to
// stream to R2 - never written to local disk, and capped at 8MB (a phone
// camera photo comfortably fits; this just guards against abuse). The
// fileFilter is a cheap first-pass rejection on the declared mimetype;
// the authoritative check is the byte-level signature check in
// config/r2Client.js (assertRealFileType), since a client can lie about
// Content-Type — this filter just avoids wasting an upload attempt on an
// obviously-wrong file before that check even runs.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (['image/jpeg', 'image/png'].includes(file.mimetype)) return cb(null, true);
        cb(new Error('Only JPEG or PNG photos are accepted.'));
    },
});

// Order creation and status changes are authenticated dispatcher/driver
// actions, not public — this exists to blunt a runaway client retry loop
// or a compromised session rather than to constrain normal dispatch pace.
const orderWriteLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, keyPrefix: 'order-write' });
// Photo uploads are heavier (network + storage cost) than a plain status
// PATCH, so they get their own, tighter limit, keyed per-driver rather
// than per-IP since drivers are typically on carrier NAT/shared IPs.
const uploadLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    keyPrefix: 'order-upload',
    keyFn: (req) => req.user?.username || req.ip,
});

// Manifest & Tracking Routes
router.post('/', authMiddleware(['admin', 'dispatcher']), orderWriteLimit, OrderController.createOrder);
router.get('/active', withKioskAccess(['admin', 'dispatcher', 'kiosk']), OrderController.getActiveOrders);
router.get('/driver/assignments', authMiddleware(['admin', 'driver', 'dispatcher']), OrderController.getDriverAssignments);
router.get('/driver/completed', authMiddleware(['admin', 'driver', 'dispatcher']), OrderController.getMyCompletedDeliveries);
router.get('/pooling', authMiddleware(['admin', 'dispatcher']), OrderController.getBatchedOrders);
router.get('/deliveries/recent', withKioskAccess(['admin', 'dispatcher', 'kiosk']), OrderController.getRecentDeliveries);
router.get('/in-flight', withKioskAccess(['admin', 'dispatcher', 'kiosk']), OrderController.getInFlightOrders);

// NOTE: /:id must come after the more specific static routes above
// (/active, /driver/assignments, /pooling), or Express would match
// those literal segments as an :id param instead.
router.get('/:id', authMiddleware(['admin', 'dispatcher', 'driver']), OrderController.getOrderById);

// Dispatch Routing & Driver Assignment Trigger
router.post('/assign', authMiddleware(['admin', 'dispatcher']), orderWriteLimit, OrderController.assignOrderBundle);
// The partner path, alongside /assign rather than instead of it: a fleet
// driver is given work, an independent one is asked.
router.post('/offer', authMiddleware(['admin', 'dispatcher']), orderWriteLimit, OrderController.offerOrders);
// Answering an offer is the driver's alone -- that is the entire point of
// there being an offer rather than an assignment.
router.post('/:id/accept', authMiddleware(['driver']), orderWriteLimit, OrderController.acceptOffer);
router.post('/:id/decline', authMiddleware(['driver']), orderWriteLimit, OrderController.declineOffer);
router.patch('/:id/reassign', authMiddleware(['admin', 'dispatcher']), orderWriteLimit, OrderController.reassignOrder);
// Pins a customer-placed order to real coordinates. Dispatch-only: it is a
// judgement call about what a customer's free-text address actually means.
router.patch('/:id/priority', authMiddleware(['admin', 'dispatcher']), orderWriteLimit, OrderController.updateOrderPriority);
router.patch('/:id/place', authMiddleware(['admin', 'dispatcher']), orderWriteLimit, OrderController.placeOrder);

// Delivery Lifecycle Milestone Route
router.patch('/:id/status', authMiddleware(['admin', 'driver', 'dispatcher']), orderWriteLimit, OrderController.updateOrderStatus);
router.post(
    '/:id/confirm-delivery',
    authMiddleware(['admin', 'driver', 'dispatcher']),
    uploadLimit,
    upload.single('photo'),
    OrderController.confirmDelivery
);

// Historical tracking route
router.get('/:id/history', authMiddleware(['admin', 'dispatcher']), OrderController.getOrderHistory);

// Smart Spatial Matching View
router.get('/:id/nearest-drivers', authMiddleware(['admin', 'dispatcher']), OrderController.getNearestDrivers);
// Same audience as nearest-drivers, and the same kind of question: who or what
// could fill a gap this job leaves.
router.get('/:id/return-loads', authMiddleware(['admin', 'dispatcher']), OrderController.getReturnLoads);

export default router;