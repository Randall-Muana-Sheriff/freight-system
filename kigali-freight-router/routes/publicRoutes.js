// Routes for the customer-facing site. The only unauthenticated write
// surface in the app, so the rate limits here are the primary defence
// rather than a backstop behind a login.
import express from 'express';
import { PublicOrderController } from '../controllers/publicOrderController.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

// Deliberately far tighter than the authenticated orderWriteLimit (200 per
// 15 min): a real customer places one order and occasionally a second, so
// anything past a handful an hour from one address is abuse, and every
// order here also costs an SMS.
const publicOrderLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, keyPrefix: 'public-order' });

// Looser, because tracking is the thing a waiting customer refreshes — but
// still bounded, since this is the one endpoint worth brute-forcing for
// codes. 39 bits of token against 120 tries an hour is not a race anyone
// wins.
const publicTrackLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, keyPrefix: 'public-track' });

const publicContactLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, keyPrefix: 'public-contact' });

router.get('/cargo-types', publicTrackLimit, PublicOrderController.getCargoTypes);
// Read-only pricing. Shares the tracking limiter rather than the far
// stricter order limiter: quoting is something a visitor does repeatedly
// while adjusting weight or vehicle, and it writes nothing.
router.get('/quote', publicTrackLimit, PublicOrderController.getQuote);
router.post('/orders', publicOrderLimit, PublicOrderController.createOrder);
router.get('/track/:token', publicTrackLimit, PublicOrderController.trackOrder);
router.post('/contact', publicContactLimit, PublicOrderController.submitContact);

export default router;
