// routes/tripRoutes.js — multi-stop runs.
import express from 'express';
import { TripController } from '../controllers/tripController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

const DISPATCH_ROLES = ['admin', 'dispatcher'];

// A driver works through a run one stop at a time, and each stop takes at
// least a drive to reach — so this is far above any real pace while still
// bounding a stuck client retrying in a loop. Keyed per-driver like the
// other driver-authenticated limiters.
const stopWriteLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    keyPrefix: 'trip-stop',
    keyFn: (req) => req.user?.username || req.ip,
});

// Declared before '/:id' so "mine" is never swallowed as a trip id.
router.get('/mine', authMiddleware(['driver']), TripController.getMyTrip);

router.get('/', authMiddleware(DISPATCH_ROLES), TripController.listTrips);
router.post('/', authMiddleware(DISPATCH_ROLES), TripController.createTrip);
router.get('/:id', authMiddleware([...DISPATCH_ROLES, 'driver']), TripController.getTrip);
router.patch('/:id', authMiddleware(DISPATCH_ROLES), TripController.updateTrip);
router.post('/:id/optimise', authMiddleware(DISPATCH_ROLES), TripController.optimiseTrip);
router.patch('/:id/sequence', authMiddleware(DISPATCH_ROLES), TripController.reorderTrip);

// Drivers and dispatch both: a dispatcher closing out a stop by phone for a
// driver whose battery died is ordinary practice, and the audit log records
// who actually did it.
router.patch('/stops/:stopId', authMiddleware([...DISPATCH_ROLES, 'driver']), stopWriteLimit, TripController.updateStop);

export default router;
