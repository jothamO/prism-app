import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller';
import { authController } from '../controllers/auth.controller';
import reviewQueueRoutes from './review-queue.routes';
import { antiAvoidanceService } from '../services/anti-avoidance.service';

const router = Router();

router.post('/webhook/whatsapp', (req, res) => webhookController.handleWhatsApp(req, res));
router.post('/webhook/mono', (req, res) => webhookController.handleMonoWebhook(req, res));
router.post('/auth/login', (req, res) => authController.login(req, res));
router.use('/review-queue', reviewQueueRoutes);

// Anti-avoidance routes
router.post('/anti-avoidance/check', async (req, res) => {
  try {
    const result = await antiAvoidanceService.checkTransaction(req.body);
    res.json(result);
  } catch (error) {
    console.error('Anti-avoidance check error:', error);
    res.status(500).json({ error: 'Failed to check transaction' });
  }
});

router.post('/anti-avoidance/batch', async (req, res) => {
  try {
    const result = await antiAvoidanceService.checkBatch(req.body.transactions);
    res.json(result);
  } catch (error) {
    console.error('Anti-avoidance batch check error:', error);
    res.status(500).json({ error: 'Failed to check transactions' });
  }
});

export default router;
