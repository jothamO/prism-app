/**
 * VAT Reconciliation Service
 * Tax Act 2025 Section 156 - Input Tax Credit
 * 
 * Handles monthly VAT reconciliation:
 * - Output VAT (collected on sales)
 * - Input VAT (paid on purchases)
 * - Credit carry-forward
 * - Refund requests
 */

import { supabase } from '../config/database';

interface VATReconciliation {
    id?: string;
    user_id: string;
    business_id?: string;
    period: string; // YYYY-MM
    output_vat: number;
    input_vat: number;
    net_vat: number;
    status: 'remit' | 'credit' | 'refund_requested' | 'filed';
    credit_brought_forward: number;
    credit_carried_forward: number;
}

export class VATReconciliationService {
    /**
     * Calculate monthly VAT position (Section 156)
     */
    async calculateMonthlyVAT(userId: string, period: string, businessId?: string): Promise<VATReconciliation> {
        // 1. Get previous month's credit carried forward
        const prevPeriod = this.getPrevMonth(period);
        const { data: prevRecon } = await supabase
            .from('vat_reconciliations')
            .select('credit_carried_forward')
            .eq('user_id', userId)
            .eq('period', prevPeriod)
            .is('business_id', businessId || null)
            .maybeSingle();

        const creditBroughtForward = prevRecon?.credit_carried_forward || 0;

        // 2. Calculate OUTPUT VAT (VAT charged on sales)
        let outputQuery = supabase
            .from('invoices')
            .select('vat_amount')
            .eq('user_id', userId)
            .eq('period', period);

        if (businessId) {
            outputQuery = outputQuery.eq('business_id', businessId);
        }

        const { data: invoices, count: invoiceCount } = await outputQuery;
        const outputVAT = invoices?.reduce((sum, inv) => sum + (inv.vat_amount || 0), 0) || 0;

        // 3. Calculate INPUT VAT (VAT paid on purchases)
        const startDate = `${period}-01`;
        const endDate = this.getNextMonth(period) + '-01';

        let inputQuery = supabase
            .from('expenses')
            .select('vat_amount')
            .eq('user_id', userId)
            .gte('date', startDate)
            .lt('date', endDate)
            .eq('can_claim_input_vat', true); // Only claim if allowed

        if (businessId) {
            inputQuery = inputQuery.eq('business_id', businessId);
        }

        const { data: expenses, count: expenseCount } = await inputQuery;
        const inputVAT = expenses?.reduce((sum, exp) => sum + (exp.vat_amount || 0), 0) || 0;

        // 4. Calculate net position
        const rawNetVAT = outputVAT - inputVAT;
        const netVAT = rawNetVAT - creditBroughtForward;

        // 5. Determine status and credit carry-forward
        let status: 'remit' | 'credit' | 'refund_requested' | 'filed';
        let creditCarriedForward = 0;

        if (netVAT > 0) {
            status = 'remit'; // Owe VAT to FIRS
        } else {
            status = 'credit'; // Have credit to carry forward
            creditCarriedForward = Math.abs(netVAT);
        }

        // 6. Save or update reconciliation
        const reconciliation = {
            user_id: userId,
            business_id: businessId || null,
            period,
            output_vat: outputVAT,
            output_vat_invoices_count: invoiceCount || 0,
            input_vat: inputVAT,
            input_vat_expenses_count: expenseCount || 0,
            net_vat: netVAT,
            status,
            credit_brought_forward: creditBroughtForward,
            credit_carried_forward: creditCarriedForward
        };

        const { data: saved, error } = await supabase
            .from('vat_reconciliations')
            .upsert(reconciliation, {
                onConflict: 'user_id,business_id,period',
                ignoreDuplicates: false
            })
            .select()
            .single();

        if (error) throw error;

        return saved;
    }

    /**
     * Request VAT refund (Section 156 - Zero-rated suppliers)
     */
    async requestRefund(userId: string, period: string, businessId?: string): Promise<void> {
        const { error } = await supabase
            .from('vat_reconciliations')
            .update({
                status: 'refund_requested',
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .eq('period', period)
            .is('business_id', businessId || null)
            .eq('status', 'credit'); // Can only request refund if in credit

        if (error) throw error;
    }

    /**
     * Mark VAT as filed
     */
    async markAsFiled(userId: string, period: string, businessId?: string, remittanceProof?: string): Promise<void> {
        const { error } = await supabase
            .from('vat_reconciliations')
            .update({
                status: 'filed',
                filed_at: new Date().toISOString(),
                filed_by: 'system',
                remittance_proof: remittanceProof,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .eq('period', period)
            .is('business_id', businessId || null);

        if (error) throw error;
    }

    /**
     * Get reconciliation for a period
     */
    async getReconciliation(userId: string, period: string, businessId?: string): Promise<VATReconciliation | null> {
        const { data } = await supabase
            .from('vat_reconciliations')
            .select('*')
            .eq('user_id', userId)
            .eq('period', period)
            .is('business_id', businessId || null)
            .maybeSingle();

        return data;
    }

    /**
     * Get reconciliation history
     */
    async getHistory(userId: string, businessId?: string, limit: number = 12): Promise<VATReconciliation[]> {
        let query = supabase
            .from('vat_reconciliations')
            .select('*')
            .eq('user_id', userId)
            .order('period', { ascending: false })
            .limit(limit);

        if (businessId) {
            query = query.eq('business_id', businessId);
        }

        const { data, error } = await query;
        if (error) throw error;

        return data || [];
    }

    // Helper functions
    private getPrevMonth(period: string): string {
        const date = new Date(`${period}-01`);
        date.setMonth(date.getMonth() - 1);
        return date.toISOString().slice(0, 7);
    }

    private getNextMonth(period: string): string {
        const date = new Date(`${period}-01`);
        date.setMonth(date.getMonth() + 1);
        return date.toISOString().slice(0, 7);
    }
}

export const vatReconciliationService = new VATReconciliationService();
