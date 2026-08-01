import { Router } from 'express';
import { GeocodeController } from '../controllers/geocodeController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Generous relative to the 1 req/sec Nominatim already enforces internally
// (see geocodeController's own throttle) — this just stops a runaway
// frontend loop (e.g. a broken debounce) from hammering the endpoint.
const geocodeRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyPrefix: 'geocode',
});

router.get('/search', authMiddleware(['admin', 'dispatcher']), geocodeRateLimit, GeocodeController.search);

export default router;
