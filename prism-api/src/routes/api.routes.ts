import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller';
import { authController } from '../controllers/auth.controller';
import reviewQueueRoutes from './review-queue.routes';
import notificationRoutes from './notification.routes';
import { antiAvoidanceService } from '../services/anti-avoidance.service';
import { authMiddleware, adminMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

// ==========================================
// Public routes (no authentication required)
// ==========================================

// Webhook endpoints (use their own signature verification)
router.post('/webhook/whatsapp', (req, res) => webhookController.handleWhatsApp(req, res));
router.post('/webhook/mono', (req, res) => webhookController.handleMonoWebhook(req, res));

// Authentication routes (must be public)
router.post('/auth/login', (req, res) => authController.login(req, res));
router.post('/auth/logout', (req, res) => authController.logout(req, res));
router.post('/auth/refresh', (req, res) => authController.refresh(req, res));
router.get('/auth/verify', (req, res) => authController.verify(req, res));

// Notification routes (uses agent key authentication)
router.use('/notifications', notificationRoutes);

// ==========================================
// Protected routes (require authentication)
// ==========================================

// Apply authentication middleware to all routes below
router.use(authMiddleware);

// Apply admin middleware to admin-only routes
router.use('/review-queue', adminMiddleware, reviewQueueRoutes);

// Anti-avoidance routes (require admin access)
router.post('/anti-avoidance/check', adminMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    console.log('Anti-avoidance check requested by:', { userId: req.user?.id });
    const result = await antiAvoidanceService.checkTransaction(req.body);
    res.json(result);
  } catch (error) {
    console.error('Anti-avoidance check error:', error);
    res.status(500).json({ error: 'Failed to check transaction' });
  }
});

router.post('/anti-avoidance/batch', adminMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    console.log('Anti-avoidance batch check requested by:', { userId: req.user?.id });
    const result = await antiAvoidanceService.checkBatch(req.body.transactions);
    res.json(result);
  } catch (error) {
    console.error('Anti-avoidance batch check error:', error);
    res.status(500).json({ error: 'Failed to check transactions' });
  }
});

export default router;
