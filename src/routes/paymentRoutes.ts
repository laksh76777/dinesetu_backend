import { Router } from 'express';
import { paymentController } from '../controllers/paymentController.js';
import { User } from '../models/User.js';

const router = Router();

// RBAC: Kitchen staff is strictly forbidden from accessing payment records or billing
const forbidKitchenRole = async (req: any, res: any, next: any) => {
  try {
    let role = req.headers['x-demo-role'] || req.user?.role;
    if (!role && req.headers.authorization?.startsWith('Bearer ')) {
      const token = req.headers.authorization.split(' ')[1];
      if (token.startsWith('demo-')) {
        role = token.replace('demo-', '').toUpperCase();
      } else if (token.includes('@')) {
        const u = await User.findOne({ email: token.toLowerCase() });
        if (u) role = u.role;
      } else if (token.match(/^[0-9a-fA-F]{24}$/)) {
        const u = await User.findById(token);
        if (u) role = u.role;
      }
    }

    if (role === 'KITCHEN') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Kitchen staff is strictly not authorized to access payments or billing.',
      });
    }
    next();
  } catch (err) {
    next(err);
  }
};

router.use(forbidKitchenRole);

// Phase 12: Bill calculations & multi-mode split breakdown (Full, Own items, Equal, Custom)
router.get('/bill/:sessionId', paymentController.getBillSummary);

// Phase 13: DineFlow Pay Simulated Endpoints
router.post('/demo/create', paymentController.createDemoPayment);
router.post('/demo/confirm', paymentController.confirmDemoPayment);

// Billing & Invoices Records (Owner & Manager)
router.get('/invoices', paymentController.getAllInvoices);

// Phase 13: Get payment by ID
router.get('/:id', paymentController.getPaymentById);

// Phase 12: Official PDF Tax Invoice
router.get('/invoice/:sessionId', paymentController.downloadInvoicePdf);

// Backwards-compatible legacy route
router.post('/simulate', paymentController.simulatePayment);

export const paymentRoutes = router;
