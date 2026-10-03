import { Router } from 'express';
import { aiController } from '../controllers/aiController.js';
import { authenticateStaff, requireRoles } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

const router = Router();

// Strict RBAC: AI Operations Assistant & Menu Description are restricted to Owner and Manager
// Customers, Kitchen, and Waiters CANNOT access AI endpoints
router.post(
  '/operations-advisor',
  authenticateStaff,
  requireRoles(ROLES.OWNER, ROLES.MANAGER),
  aiController.getOperationsAdvice
);

router.post(
  '/menu-description',
  authenticateStaff,
  requireRoles(ROLES.OWNER, ROLES.MANAGER),
  aiController.generateMenuDescription
);

export default router;
