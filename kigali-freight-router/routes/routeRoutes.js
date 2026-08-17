// routes/routeRoutes.js
import { Router } from 'express';
import { RouteController } from '../controllers/routeController.js';
// Note: Keep your authMiddleware matching how you register your other routes
import { authMiddleware } from '../middleware/authMiddleware.js'; // Adjust path if needed
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

const OPERATIONAL_ROLES = ['admin', 'dispatcher'];
const writeLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, keyPrefix: 'route-write' });

// Register all endpoints mapped to the /api/routes prefix in server.js
router.get('/', authMiddleware(OPERATIONAL_ROLES), RouteController.getRoutes);
router.post('/save', authMiddleware(OPERATIONAL_ROLES), writeLimit, RouteController.saveRouteHistory);

export default router;
