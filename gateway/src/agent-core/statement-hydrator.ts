/**
 * Statement Hydrator
 * Aggregates bank_transactions into ytd_state for agent context.
 */

import { supabase } from '../config';
import { logger } from '../utils/logger';

export class StatementHydrator {
    /**
     * Hydrate YTD state from bank transactions.
     * Uses upsert to handle conflicts.
     */
    static async hydrate(userId: string, businessId: string | null = null): Promise<void> {
        const fiscalYear = new Date().getFullYear();

        logger.info('[StatementHydrator] Starting hydration', { userId, businessId, fiscalYear });

        try {
            // 1. Aggregate transactions for the fiscal year
            let query = supabase
                .from('bank_transactions')
                .select('credit, debit, vat_amount, is_revenue, is_expense')
                .eq('user_id', userId)
                .gte('transaction_date', `${fiscalYear}-01-01`)
                .lte('transaction_date', `${fiscalYear}-12-31`);

            if (businessId) {
                query = query.eq('business_id', businessId);
            }

            const { data: transactions, error: txnError } = await query;

            if (txnError) {
                throw txnError;
            }

            // 2. Calculate aggregates
            let revenue = 0;
            let expenses = 0;
            let vatPaid = 0;
            let revenueTxnCount = 0;
            let expenseTxnCount = 0;

            for (const txn of transactions || []) {
                if (txn.is_revenue) {
                    revenue += txn.credit || 0;
                    revenueTxnCount++;
                }
                if (txn.is_expense) {
                    expenses += txn.debit || 0;
                    expenseTxnCount++;
                }
                vatPaid += txn.vat_amount || 0;
            }

            // 3. Upsert into ytd_state
            const { error: upsertError } = await supabase
                .from('ytd_state')
                .upsert({
                    user_id: userId,
                    business_id: businessId,
                    fiscal_year: fiscalYear,
                    revenue,
                    expenses,
                    vat_paid: vatPaid,
                    pit_paid: 0, // PIT requires separate logic (salary data)
                    revenue_txn_count: revenueTxnCount,
                    expense_txn_count: expenseTxnCount,
                    last_hydrated_at: new Date().toISOString()
                }, {
                    onConflict: 'user_id,business_id,fiscal_year'
                });

            if (upsertError) {
                throw upsertError;
            }

            logger.info('[StatementHydrator] Hydration complete', {
                userId,
                fiscalYear,
                revenue,
                expenses,
                vatPaid,
                revenueTxnCount,
                expenseTxnCount
            });

        } catch (error) {
            logger.error('[StatementHydrator] Hydration failed', { error, userId });
            throw error;
        }
    }
}
