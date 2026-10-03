import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { authenticateStaff } from '../middleware/auth.js';

const router = Router();

router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/initialize-owner', authController.initializeOwner);
router.get('/me', authenticateStaff, authController.getCurrentUser);

export default router;
