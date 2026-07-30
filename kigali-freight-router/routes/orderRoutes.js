import { Router } from 'express';
import multer from 'multer';
import { OrderController } from '../controllers/orderController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

// Delivery confirmation photos are held in memory only long enough to
// stream to R2 - never written to local disk, and capped at 8MB (a phone
// camera photo comfortably fits; this just guards against abuse).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// Manifest & Tracking Routes
router.post('/', authMiddleware(['admin', 'dispatcher']), OrderController.createOrder);
router.get('/active', authMiddleware(['admin', 'dispatcher']), OrderController.getActiveOrders);
router.get('/driver/assignments', authMiddleware(['admin', 'driver', 'dispatcher']), OrderController.getDriverAssignments);
router.get('/driver/completed', authMiddleware(['admin', 'driver', 'dispatcher']), OrderController.getMyCompletedDeliveries);
router.get('/pooling', authMiddleware(['admin', 'dispatcher']), OrderController.getBatchedOrders);
router.get('/deliveries/recent', authMiddleware(['admin', 'dispatcher']), OrderController.getRecentDeliveries);
router.get('/in-flight', authMiddleware(['admin', 'dispatcher']), OrderController.getInFlightOrders);

// NOTE: /:id must come after the more specific static routes above
// (/active, /driver/assignments, /pooling), or Express would match
// those literal segments as an :id param instead.
router.get('/:id', authMiddleware(['admin', 'dispatcher', 'driver']), OrderController.getOrderById);

// Dispatch Routing & Driver Assignment Trigger
router.post('/assign', authMiddleware(['admin', 'dispatcher']), OrderController.assignOrderBundle);
router.patch('/:id/reassign', authMiddleware(['admin', 'dispatcher']), OrderController.reassignOrder);

// Delivery Lifecycle Milestone Route
router.patch('/:id/status', authMiddleware(['admin', 'driver', 'dispatcher']), OrderController.updateOrderStatus);
router.post(
    '/:id/confirm-delivery',
    authMiddleware(['admin', 'driver', 'dispatcher']),
    upload.single('photo'),
    OrderController.confirmDelivery
);

// Historical tracking route
router.get('/:id/history', authMiddleware(['admin', 'dispatcher']), OrderController.getOrderHistory);

// Smart Spatial Matching View
router.get('/:id/nearest-drivers', authMiddleware(['admin', 'dispatcher']), OrderController.getNearestDrivers);

export default router;