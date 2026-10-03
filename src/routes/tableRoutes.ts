import { Router } from 'express';
import { tableController } from '../controllers/tableController.js';
import { authenticateStaff, requireRoles } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

const router = Router();

// Public endpoints
router.get('/public', tableController.getPublicTables);
router.get('/resolve/:token', tableController.resolveQrToken);
router.get('/qr/:token/download', tableController.downloadQrImage);

// Staff endpoints
router.get('/', authenticateStaff, tableController.getAllTables);
router.get('/:id/live', tableController.getTableLiveDetails);
router.post(
  '/',
  authenticateStaff,
  requireRoles(ROLES.OWNER, ROLES.MANAGER),
  tableController.createTable
);
router.patch(
  '/:id',
  authenticateStaff,
  requireRoles(ROLES.OWNER, ROLES.MANAGER),
  tableController.updateTable
);
router.patch(
  '/:id/status',
  authenticateStaff,
  requireRoles(ROLES.OWNER, ROLES.MANAGER, ROLES.WAITER),
  tableController.updateStatus
);
router.patch(
  '/:id/deactivate',
  authenticateStaff,
  requireRoles(ROLES.OWNER, ROLES.MANAGER),
  tableController.toggleActive
);
router.post(
  '/:id/regenerate-qr',
  authenticateStaff,
  requireRoles(ROLES.OWNER, ROLES.MANAGER),
  tableController.regenerateQr
);
router.patch(
  '/:id/toggle-qr',
  authenticateStaff,
  requireRoles(ROLES.OWNER, ROLES.MANAGER),
  tableController.toggleQrActive
);
router.post('/reset-all-available', tableController.resetAllTables);

export default router;
