import { Router, Response } from 'express';
import { reviewQueueService } from '../services/review-queue.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

/**
 * GET /api/review-queue
 * Get review queue with optional filters
 * Requires admin authentication (enforced by middleware in api.routes.ts)
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const filters = {
            status: req.query.status as string,
            priority: req.query.priority as string,
            userId: req.query.userId as string,
            limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
            offset: req.query.offset ? parseInt(req.query.offset as string) : 0
        };

        console.log('Review queue accessed by admin:', { 
            adminId: req.user?.id,
            filters 
        });

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
 * Uses authenticated user's ID as adminId (not from request body)
 */
router.post('/:id/approve', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        
        // Use authenticated user's ID instead of trusting request body
        const adminId = req.user?.id;

        if (!adminId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        console.log('Review item approved:', { 
            itemId: id, 
            adminId, 
            hasNotes: !!notes 
        });

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
 * Uses authenticated user's ID as adminId (not from request body)
 */
router.post('/:id/reject', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        
        // Use authenticated user's ID instead of trusting request body
        const adminId = req.user?.id;

        if (!adminId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        if (!notes) {
            return res.status(400).json({ error: 'Notes are required for rejection' });
        }

        console.log('Review item rejected:', { 
            itemId: id, 
            adminId, 
            hasNotes: true 
        });

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
 * Uses authenticated user's ID as adminId (not from request body)
 */
router.post('/bulk-approve', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { ids } = req.body;
        
        // Use authenticated user's ID instead of trusting request body
        const adminId = req.user?.id;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids array is required' });
        }

        if (!adminId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        console.log('Bulk approve requested:', { 
            adminId, 
            itemCount: ids.length 
        });

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
 * Uses authenticated user's ID as adminId (not from request body)
 */
router.post('/bulk-reject', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { ids, notes } = req.body;
        
        // Use authenticated user's ID instead of trusting request body
        const adminId = req.user?.id;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids array is required' });
        }

        if (!adminId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        if (!notes) {
            return res.status(400).json({ error: 'Notes are required for rejection' });
        }

        console.log('Bulk reject requested:', { 
            adminId, 
            itemCount: ids.length 
        });

        const result = await reviewQueueService.bulkReject(ids, adminId, notes);
        res.json({ success: true, count: result.length, items: result });
    } catch (error: any) {
        console.error('Error bulk rejecting:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
