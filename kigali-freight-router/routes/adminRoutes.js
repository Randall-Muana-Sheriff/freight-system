import { Router } from 'express';
import { AdminController } from '../controllers/adminController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { withKioskAccess } from '../middleware/kioskAuthMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Every mutating admin/dispatcher action shares one moderate limiter —
// these are authenticated, low-frequency-by-nature actions (registering a
// vehicle, editing a role), so this exists to blunt a compromised
// dispatcher session or a buggy client retry-loop, not to constrain
// normal usage.
const adminWriteLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, keyPrefix: 'admin-write' });

// inviteDriver triggers a real, billed SMS send (services/smsService.js).
// Keyed by the calling admin/dispatcher's own username rather than IP —
// the risk here is a compromised or careless credential looping the call
// against one victim number or running up SMS costs, not many attackers
// sharing an IP.
const inviteLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyPrefix: 'driver-invite',
    keyFn: (req) => req.user?.username || req.ip,
});

router.get('/users', withKioskAccess(['admin', 'dispatcher', 'kiosk']), AdminController.getUsers);
router.post('/users', authMiddleware(['admin']), adminWriteLimit, AdminController.createUser);
router.patch('/users/:id/role', authMiddleware(['admin']), adminWriteLimit, AdminController.updateUserRole);
router.post('/drivers/invite', authMiddleware(['admin', 'dispatcher']), inviteLimit, AdminController.inviteDriver);
router.post('/users/:id/reset-driver-pin', authMiddleware(['admin']), adminWriteLimit, AdminController.resetDriverPin);
router.post('/users/:id/revoke-sessions', authMiddleware(['admin']), adminWriteLimit, AdminController.revokeUserSessions);
router.get('/vehicles', authMiddleware(['admin', 'dispatcher']), AdminController.getVehicles);
// Static route must come before /vehicles/:id-style routes, so it can't
// ever be swallowed as a param — there isn't one of those today, but this
// stays future-proof if one is added later.
router.get('/vehicles/mine', authMiddleware(['admin', 'dispatcher', 'driver']), AdminController.getMyVehicle);
router.post('/vehicles', authMiddleware(['admin', 'dispatcher']), adminWriteLimit, AdminController.createVehicle);
router.patch('/vehicles/:id/assign', authMiddleware(['admin', 'dispatcher']), adminWriteLimit, AdminController.assignVehicle);
router.delete('/vehicles/:id', authMiddleware(['admin', 'dispatcher']), adminWriteLimit, AdminController.deleteVehicle);
router.get('/vehicle-types', authMiddleware(['admin', 'dispatcher']), AdminController.getVehicleTypes);
router.post('/vehicle-types', authMiddleware(['admin', 'dispatcher']), adminWriteLimit, AdminController.createVehicleType);
router.patch('/vehicle-types/:id', authMiddleware(['admin', 'dispatcher']), adminWriteLimit, AdminController.updateVehicleType);
router.delete('/vehicle-types/:id', authMiddleware(['admin', 'dispatcher']), adminWriteLimit, AdminController.deleteVehicleType);
router.get('/audit-logs', authMiddleware(['admin']), AdminController.getAuditLogs);
router.get('/stats', authMiddleware(['admin']), AdminController.getStats);

// Kiosk wall displays are physical hardware, not staff accounts — only an
// admin provisions or decommissions one, never a dispatcher.
router.post('/kiosk-devices', authMiddleware(['admin']), adminWriteLimit, AdminController.createKioskDevice);
router.get('/kiosk-devices', authMiddleware(['admin']), AdminController.listKioskDevices);
// A device's own self-lookup (its label, for on-screen display) — kiosk
// role only, deliberately separate from the admin list/create/revoke
// routes above. Must come before /kiosk-devices/:id so 'me' is never
// swallowed as an :id param.
router.get('/kiosk-devices/me', withKioskAccess(['kiosk']), AdminController.getMyKioskDevice);
router.delete('/kiosk-devices/:id', authMiddleware(['admin']), adminWriteLimit, AdminController.revokeKioskDevice);

export default router;
