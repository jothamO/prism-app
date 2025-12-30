import { supabase } from '../config/database';

export class ReviewQueueService {
    /**
     * Calculate priority score for an invoice
     * Score = (amount_score * 0.4) + (confidence_score * 0.4) + (age_score * 0.2)
     */
    calculatePriority(invoice: any, createdAt: Date): { score: number; priority: string } {
        // Amount score (0-0.4): normalized by ₦2M max
        const amountScore = Math.min(invoice.total / 2000000, 1) * 0.4;

        // Confidence score (0-0.4): inverted (low confidence = high priority)
        const confidenceScore = (1 - (invoice.confidence_score || 1)) * 0.4;

        // Age score (0-0.2): days old / 7 days max
        const ageInDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        const ageScore = Math.min(ageInDays / 7, 1) * 0.2;

        const score = Math.min(1, Math.max(0, amountScore + confidenceScore + ageScore));

        const priority = score > 0.7 ? 'high' : score > 0.4 ? 'medium' : 'low';

        return { score, priority };
    }

    /**
     * Get review queue with filtering and sorting
     */
    async getQueue(filters: {
        status?: string;
        priority?: string;
        userId?: string;
        limit?: number;
        offset?: number;
    } = {}) {
        let query = supabase
            .from('review_queue')
            .select(`
                *,
                invoice:invoices(*),
                user:users(id, business_name, whatsapp_number)
            `)
            .order('priority_score', { ascending: false })
            .order('created_at', { ascending: false });

        if (filters.status) {
            query = query.eq('status', filters.status);
        }

        if (filters.priority) {
            query = query.eq('priority', filters.priority);
        }

        if (filters.userId) {
            query = query.eq('user_id', filters.userId);
        }

        if (filters.limit) {
            query = query.limit(filters.limit);
        }

        if (filters.offset) {
            query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data;
    }

    /**
     * Approve a single review item
     */
    async approve(id: string, adminId: string, notes?: string) {
        const { data, error } = await supabase
            .from('review_queue')
            .update({
                status: 'approved',
                resolved_at: new Date().toISOString(),
                assigned_to: adminId,
                notes
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Update invoice status
        if (data.invoice_id) {
            await supabase
                .from('invoices')
                .update({ needs_review: false, user_confirmed: true })
                .eq('id', data.invoice_id);
        }

        return data;
    }

    /**
     * Reject a single review item
     */
    async reject(id: string, adminId: string, notes: string) {
        const { data, error } = await supabase
            .from('review_queue')
            .update({
                status: 'rejected',
                resolved_at: new Date().toISOString(),
                assigned_to: adminId,
                notes
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Mark invoice for deletion or correction
        if (data.invoice_id) {
            await supabase
                .from('invoices')
                .update({ status: 'rejected' })
                .eq('id', data.invoice_id);
        }

        return data;
    }

    /**
     * Bulk approve multiple items
     */
    async bulkApprove(ids: string[], adminId: string) {
        const { data, error } = await supabase
            .from('review_queue')
            .update({
                status: 'approved',
                resolved_at: new Date().toISOString(),
                assigned_to: adminId
            })
            .in('id', ids)
            .select();

        if (error) throw error;

        // Update all related invoices
        const invoiceIds = data.map(item => item.invoice_id).filter(Boolean);
        if (invoiceIds.length > 0) {
            await supabase
                .from('invoices')
                .update({ needs_review: false, user_confirmed: true })
                .in('id', invoiceIds);
        }

        return data;
    }

    /**
     * Bulk reject multiple items
     */
    async bulkReject(ids: string[], adminId: string, notes: string) {
        const { data, error } = await supabase
            .from('review_queue')
            .update({
                status: 'rejected',
                resolved_at: new Date().toISOString(),
                assigned_to: adminId,
                notes
            })
            .in('id', ids)
            .select();

        if (error) throw error;

        // Update all related invoices
        const invoiceIds = data.map(item => item.invoice_id).filter(Boolean);
        if (invoiceIds.length > 0) {
            await supabase
                .from('invoices')
                .update({ status: 'rejected' })
                .in('id', invoiceIds);
        }

        return data;
    }

    /**
     * Auto-resolve when user confirms via WhatsApp
     */
    async autoResolve(invoiceId: string) {
        const { data, error } = await supabase
            .from('review_queue')
            .update({
                status: 'approved',
                resolved_at: new Date().toISOString(),
                notes: 'Auto-resolved: User confirmed via WhatsApp'
            })
            .eq('invoice_id', invoiceId)
            .eq('status', 'pending')
            .select();

        if (error) throw error;
        return data;
    }

    /**
     * Add item to review queue with priority calculation
     */
    async addToQueue(userId: string, invoiceId: string, reasons: string[]) {
        // Fetch invoice to calculate priority
        const { data: invoice } = await supabase
            .from('invoices')
            .select('*')
            .eq('id', invoiceId)
            .single();

        if (!invoice) throw new Error('Invoice not found');

        const { score, priority } = this.calculatePriority(invoice, new Date());

        const { data, error } = await supabase
            .from('review_queue')
            .insert({
                user_id: userId,
                invoice_id: invoiceId,
                reasons,
                priority,
                priority_score: score,
                status: 'pending'
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }
}

export const reviewQueueService = new ReviewQueueService();
