// routes/routeRoutes.js
import { Router } from 'express';
import { RouteController } from '../controllers/routeController.js';
// Note: Keep your authMiddleware matching how you register your other routes
import { authMiddleware } from '../middleware/authMiddleware.js'; // Adjust path if needed
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

const OPERATIONAL_ROLES = ['admin', 'dispatcher'];
// optimizeRoute calls out to a shared public OSRM demo server once per
// stop in the route — a tighter limit than the other write routes here,
// since this isn't just a DB write, it's an outbound network call to a
// third party we don't control the capacity of.
const optimizeLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, keyPrefix: 'route-optimize' });
const writeLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, keyPrefix: 'route-write' });

// Register all endpoints mapped to the /api/routes prefix in server.js
router.get('/', authMiddleware(OPERATIONAL_ROLES), RouteController.getRoutes);
router.post('/optimize', authMiddleware(OPERATIONAL_ROLES), optimizeLimit, RouteController.optimizeRoute);
router.post('/save', authMiddleware(OPERATIONAL_ROLES), writeLimit, RouteController.saveRouteHistory);
router.post('/commit', authMiddleware(OPERATIONAL_ROLES), writeLimit, RouteController.commitRoute);

export default router;
