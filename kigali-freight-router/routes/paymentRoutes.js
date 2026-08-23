import { Router } from 'express';
import { PaymentController } from '../controllers/paymentController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// A driver asking for money, so it is limited per account rather than per IP
// — a whole depot shares one connection.
const requestLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, keyPrefix: 'payment-request' });
// Open to the internet because MTN cannot authenticate to us. Limited hard:
// the endpoint does nothing but trigger a lookup, and a flood of forged
// calls should cost MTN's real ones nothing.
const callbackLimit = rateLimit({ windowMs: 60 * 1000, max: 120, keyPrefix: 'momo-callback' });

const staffOrDriver = authMiddleware(['admin', 'dispatcher', 'driver']);

router.get('/can-charge', staffOrDriver, PaymentController.canCharge);
router.post('/orders/:orderId/request', staffOrDriver, requestLimit, PaymentController.request);
router.get('/orders/:orderId', staffOrDriver, PaymentController.status);
router.get('/driver/earnings', authMiddleware(['driver']), PaymentController.earnings);

// No auth: this is MTN calling us. Safe because the handler reads nothing
// from the body — it treats the call as "ask MTN about this reference" and
// gets the truth from MTN's own status endpoint.
router.post('/momo/callback/:reference', callbackLimit, PaymentController.callback);
router.put('/momo/callback/:reference', callbackLimit, PaymentController.callback);

router.post('/sweep', authMiddleware(['admin']), PaymentController.sweep);

export default router;
