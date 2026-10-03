import { Router } from 'express';
import { diningMomentController } from '../controllers/diningMomentController.js';
import { authenticateStaff, requireRoles } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

const router = Router();

// Public: customer gets active moments
router.get('/active', diningMomentController.getActiveMoments);

// Staff: list, create, update, delete
router.get('/', authenticateStaff, requireRoles(ROLES.OWNER, ROLES.MANAGER), diningMomentController.getAllMoments);
router.post('/', authenticateStaff, requireRoles(ROLES.OWNER, ROLES.MANAGER), diningMomentController.createMoment);
router.patch('/:id', authenticateStaff, requireRoles(ROLES.OWNER, ROLES.MANAGER), diningMomentController.updateMoment);
router.delete('/:id', authenticateStaff, requireRoles(ROLES.OWNER, ROLES.MANAGER), diningMomentController.deleteMoment);

export default router;
