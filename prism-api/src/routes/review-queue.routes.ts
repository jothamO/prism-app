import { Router, Request, Response } from 'express';
import { reviewQueueService } from '../services/review-queue.service';

const router = Router();

/**
 * GET /api/review-queue
 * Get review queue with optional filters
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const filters = {
            status: req.query.status as string,
            priority: req.query.priority as string,
            userId: req.query.userId as string,
            limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
            offset: req.query.offset ? parseInt(req.query.offset as string) : 0
        };

        const queue = await reviewQueueService.getQueue(filters);
        res.json(queue);
    } catch (error: any) {
        console.error('Error fetching review queue:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/review-queue/:id/approve
 * Approve a single review item
 */
router.post('/:id/approve', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { adminId, notes } = req.body;

        if (!adminId) {
            return res.status(400).json({ error: 'adminId is required' });
        }

        const result = await reviewQueueService.approve(id, adminId, notes);
        res.json(result);
    } catch (error: any) {
        console.error('Error approving review item:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/review-queue/:id/reject
 * Reject a single review item
 */
router.post('/:id/reject', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { adminId, notes } = req.body;

        if (!adminId || !notes) {
            return res.status(400).json({ error: 'adminId and notes are required' });
        }

        const result = await reviewQueueService.reject(id, adminId, notes);
        res.json(result);
    } catch (error: any) {
        console.error('Error rejecting review item:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/review-queue/bulk-approve
 * Bulk approve multiple items
 */
router.post('/bulk-approve', async (req: Request, res: Response) => {
    try {
        const { ids, adminId } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids array is required' });
        }

        if (!adminId) {
            return res.status(400).json({ error: 'adminId is required' });
        }

        const result = await reviewQueueService.bulkApprove(ids, adminId);
        res.json({ success: true, count: result.length, items: result });
    } catch (error: any) {
        console.error('Error bulk approving:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/review-queue/bulk-reject
 * Bulk reject multiple items
 */
router.post('/bulk-reject', async (req: Request, res: Response) => {
    try {
        const { ids, adminId, notes } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids array is required' });
        }

        if (!adminId || !notes) {
            return res.status(400).json({ error: 'adminId and notes are required' });
        }

        const result = await reviewQueueService.bulkReject(ids, adminId, notes);
        res.json({ success: true, count: result.length, items: result });
    } catch (error: any) {
        console.error('Error bulk rejecting:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
