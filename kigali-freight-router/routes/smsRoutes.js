import express, { Router } from 'express';
import { SmsWebhookController } from '../controllers/smsWebhookController.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Africa's Talking posts delivery reports as application/x-www-form-
// urlencoded, not JSON — scoped to just this route rather than added
// globally, since nothing else in this API accepts that content type.
const formBody = express.urlencoded({ extended: true });

// No auth (this is an external webhook, not one of our own clients) —
// protected instead by the shared-secret query param checked in the
// controller, plus a generous but real rate limit so a misbehaving or
// malicious caller can't use this as a free log-spam vector.
const deliveryReportLimit = rateLimit({ windowMs: 60 * 1000, max: 60, keyPrefix: 'sms-delivery-report' });

router.post('/delivery-report', deliveryReportLimit, formBody, SmsWebhookController.deliveryReport);

export default router;
