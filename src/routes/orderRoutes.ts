import { Router } from 'express';
import { orderController } from '../controllers/orderController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// Customer public endpoints (authenticated by table session)
router.post('/', orderController.placeOrder);
router.get('/session/:sessionId', orderController.getSessionOrders);

// Kitchen & Waiter endpoints
router.get('/active', authenticate, authorize(['OWNER', 'MANAGER', 'KITCHEN', 'WAITER']), orderController.getActiveKitchenOrders);
router.patch('/:orderId/status', authenticate, authorize(['OWNER', 'MANAGER', 'KITCHEN', 'WAITER']), orderController.updateOrderStatus);
router.patch('/:orderId/item/:itemId/status', authenticate, authorize(['OWNER', 'MANAGER', 'KITCHEN']), orderController.updateOrderItemStatus);
router.patch('/:orderId/serve', authenticate, authorize(['OWNER', 'MANAGER', 'WAITER']), orderController.serveOrder);

export const orderRoutes = router;
