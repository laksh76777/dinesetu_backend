import { Router } from 'express';
import { userController } from '../controllers/userController.js';
import { authenticateStaff, requireRoles } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

const router = Router();

// Staff listing: Owner and Manager
router.get(
  '/',
  authenticateStaff,
  requireRoles(ROLES.OWNER, ROLES.MANAGER),
  userController.getAllUsers
);

// Staff creation: Owner only
router.post(
  '/',
  authenticateStaff,
  requireRoles(ROLES.OWNER),
  userController.createStaffMember
);

// Toggle active/inactive: Owner only
router.patch(
  '/:id/active',
  authenticateStaff,
  requireRoles(ROLES.OWNER),
  userController.toggleUserActive
);

// Delete staff: Owner only
router.delete(
  '/:id',
  authenticateStaff,
  requireRoles(ROLES.OWNER),
  userController.deleteUser
);

export default router;
