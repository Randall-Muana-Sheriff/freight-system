import { Router } from 'express';
import { PlaceHintController } from '../controllers/placeHintController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Same audience as the geocoder it sits on top of.
router.get('/', authMiddleware(['admin', 'dispatcher']), PlaceHintController.lookup);

// Warming spends an external service's throttle, so it is limited harder than
// a read -- a warm loop left running would be this application misbehaving on
// somebody else's free tier.
router.post('/warm', authMiddleware(['admin', 'dispatcher']),
    rateLimit({ windowMs: 10 * 60 * 1000, max: 4, keyPrefix: 'place-hint-warm' }),
    PlaceHintController.warm);

export default router;
