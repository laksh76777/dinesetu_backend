import { Router } from 'express';
import { analyticsController } from '../controllers/analyticsController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// Phase 14: Public client telemetry event tracking
router.post('/track', analyticsController.trackEvent);

// Executive analytics with date filter support (Owner & Manager)
router.get('/dashboard', authenticate, authorize(['OWNER', 'MANAGER']), analyticsController.getDashboardAnalytics);

// Gemini AI Operations Advisor
router.post('/ai-advisor', authenticate, authorize(['OWNER', 'MANAGER']), analyticsController.getAiOperationsAdvice);

export const analyticsRoutes = router;
