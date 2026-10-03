import { Router } from 'express';
import { restaurantController } from '../controllers/restaurantController.js';
import { authenticateStaff, requireRoles } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

const router = Router();

// Get restaurant profile (public for guest views & staff)
router.get('/', restaurantController.getProfile);

// Update restaurant profile (Owner only)
router.patch(
  '/',
  authenticateStaff,
  requireRoles(ROLES.OWNER),
  restaurantController.updateProfile
);

export default router;
