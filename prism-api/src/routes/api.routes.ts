import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller';
import { authController } from '../controllers/auth.controller';
import reviewQueueRoutes from './review-queue.routes';

const router = Router();

router.post('/webhook/whatsapp', (req, res) => webhookController.handleWhatsApp(req, res));
router.post('/webhook/mono', (req, res) => webhookController.handleMonoWebhook(req, res));
router.post('/auth/login', (req, res) => authController.login(req, res));
router.use('/review-queue', reviewQueueRoutes);

export default router;
