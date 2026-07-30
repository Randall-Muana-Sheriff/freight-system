import { Router } from 'express';
import { AdminController } from '../controllers/adminController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/users', authMiddleware(['admin', 'dispatcher']), AdminController.getUsers);
router.post('/users', authMiddleware(['admin']), AdminController.createUser);
router.patch('/users/:id/role', authMiddleware(['admin']), AdminController.updateUserRole);
router.get('/vehicles', authMiddleware(['admin', 'dispatcher']), AdminController.getVehicles);
// Static route must come before /vehicles/:id-style routes, so it can't
// ever be swallowed as a param — there isn't one of those today, but this
// stays future-proof if one is added later.
router.get('/vehicles/mine', authMiddleware(['admin', 'dispatcher', 'driver']), AdminController.getMyVehicle);
router.post('/vehicles', authMiddleware(['admin', 'dispatcher']), AdminController.createVehicle);
router.patch('/vehicles/:id/assign', authMiddleware(['admin', 'dispatcher']), AdminController.assignVehicle);
router.delete('/vehicles/:id', authMiddleware(['admin', 'dispatcher']), AdminController.deleteVehicle);
router.get('/vehicle-types', authMiddleware(['admin', 'dispatcher']), AdminController.getVehicleTypes);
router.post('/vehicle-types', authMiddleware(['admin', 'dispatcher']), AdminController.createVehicleType);
router.patch('/vehicle-types/:id', authMiddleware(['admin', 'dispatcher']), AdminController.updateVehicleType);
router.delete('/vehicle-types/:id', authMiddleware(['admin', 'dispatcher']), AdminController.deleteVehicleType);
router.get('/audit-logs', authMiddleware(['admin']), AdminController.getAuditLogs);

export default router;
