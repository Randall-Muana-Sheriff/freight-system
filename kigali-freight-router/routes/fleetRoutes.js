// routes/fleetRoutes.js
import express from 'express';
import { FleetController } from '../controllers/fleetController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { withKioskAccess } from '../middleware/kioskAuthMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

// The driver app pings every ~15s during an active shift (~60/15min under
// normal use) — this cap is roughly double that to comfortably allow
// catch-up bursts after a network gap, while still bounding a runaway
// client from hammering the endpoint. Keyed per-driver, not per-IP,
// since many drivers share carrier NAT.
const telemetryLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 150,
    keyPrefix: 'telemetry',
    keyFn: (req) => req.user?.username || req.ip,
});

// Driver self-report: a driver's own device posts its current position here.
router.post('/telemetry', authMiddleware(['driver']), telemetryLimit, FleetController.reportTelemetry);

// Ensure FleetController.getLiveFleetStatus is fully defined here
router.get('/telemetry-sheet', withKioskAccess(['admin', 'dispatcher', 'kiosk']), FleetController.getLiveFleetStatus);

//Historical Breadcrumbs Route
router.get('/history/:driverName', authMiddleware(['admin', 'dispatcher']), FleetController.getDriverBreadcrumbs);

//Fleet Performance Report Route
router.get('/analytics/performance', authMiddleware(['admin', 'dispatcher']), FleetController.getFleetPerformanceReport);

export default router;
