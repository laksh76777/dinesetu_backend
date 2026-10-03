import { Router } from 'express';
import { menuController } from '../controllers/menuController.js';
import { tableIntelligenceController } from '../controllers/tableIntelligenceController.js';
import { authenticateStaff, requireRoles } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

const router = Router();

// Help Me Choose (Guided Discovery)
router.post('/help-me-choose', tableIntelligenceController.helpMeChoose);

// Categories
router.get('/categories', menuController.getCategories);
router.post(
  '/categories',
  authenticateStaff,
  requireRoles(ROLES.OWNER, ROLES.MANAGER),
  menuController.createCategory
);
router.patch(
  '/categories/:id',
  authenticateStaff,
  requireRoles(ROLES.OWNER, ROLES.MANAGER),
  menuController.updateCategory
);
router.delete(
  '/categories/:id',
  authenticateStaff,
  requireRoles(ROLES.OWNER, ROLES.MANAGER),
  menuController.deleteCategory
);

// Menu Items
router.get('/items', menuController.getMenuItems);
router.get('/items/:id', menuController.getMenuItemById);
router.post(
  '/items',
  authenticateStaff,
  requireRoles(ROLES.OWNER, ROLES.MANAGER),
  menuController.createMenuItem
);
router.patch(
  '/items/:id',
  authenticateStaff,
  requireRoles(ROLES.OWNER, ROLES.MANAGER, ROLES.KITCHEN),
  menuController.updateMenuItem
);
router.patch(
  '/items/:id/availability',
  authenticateStaff,
  requireRoles(ROLES.OWNER, ROLES.MANAGER, ROLES.KITCHEN),
  menuController.toggleAvailability
);
router.delete(
  '/items/:id',
  authenticateStaff,
  requireRoles(ROLES.OWNER, ROLES.MANAGER),
  menuController.deleteMenuItem
);

export default router;
