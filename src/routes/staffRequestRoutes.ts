import { Router } from 'express';
import { staffRequestController } from '../controllers/staffRequestController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// Customer creates request
router.post('/', staffRequestController.createRequest);

// Waiter / Staff management endpoints
router.get('/active', authenticate, authorize(['OWNER', 'MANAGER', 'WAITER']), staffRequestController.getActiveRequests);
router.patch('/:id/status', authenticate, authorize(['OWNER', 'MANAGER', 'WAITER']), staffRequestController.updateRequestStatus);
router.patch('/:id/acknowledge', authenticate, authorize(['OWNER', 'MANAGER', 'WAITER']), staffRequestController.acknowledgeRequest);
router.patch('/:id/resolve', authenticate, authorize(['OWNER', 'MANAGER', 'WAITER']), staffRequestController.resolveRequest);

export const staffRequestRoutes = router;
