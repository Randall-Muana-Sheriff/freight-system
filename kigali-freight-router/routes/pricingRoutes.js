import { Router } from 'express';
import { PricingController } from '../controllers/pricingController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

// Admin only, both ways. A rate card is what every customer is charged and
// every driver is paid, so it sits with the accounts that can already create
// staff rather than with everyone who can move an order along.
router.get('/rates', authMiddleware(['admin']), PricingController.getRates);
router.post('/rates', authMiddleware(['admin']), PricingController.createRate);

export default router;
