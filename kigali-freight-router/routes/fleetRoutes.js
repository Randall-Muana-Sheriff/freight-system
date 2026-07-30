// routes/fleetRoutes.js
import express from 'express';
import { FleetController } from '../controllers/fleetController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Driver self-report: a driver's own device posts its current position here.
router.post('/telemetry', authMiddleware(['driver']), FleetController.reportTelemetry);

// Ensure FleetController.getLiveFleetStatus is fully defined here
router.get('/telemetry-sheet', authMiddleware(['admin', 'dispatcher']), FleetController.getLiveFleetStatus);

//Historical Breadcrumbs Route
router.get('/history/:driverName', authMiddleware(['admin', 'dispatcher']), FleetController.getDriverBreadcrumbs);

//Fleet Performance Report Route
router.get('/analytics/performance', authMiddleware(['admin', 'dispatcher']), FleetController.getFleetPerformanceReport);

export default router;