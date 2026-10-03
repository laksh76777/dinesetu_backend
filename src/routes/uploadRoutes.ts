import { Router } from 'express';
import { uploadController, uploadMiddleware } from '../controllers/uploadController.js';
import { authenticateStaff, requireRoles } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

const router = Router();

// Image upload: Owner & Manager only
router.post(
  '/image',
  authenticateStaff,
  requireRoles(ROLES.OWNER, ROLES.MANAGER),
  uploadMiddleware.single('image'),
  uploadController.uploadImage
);

export default router;
