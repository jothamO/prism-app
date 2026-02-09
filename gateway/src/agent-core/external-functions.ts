/**
 * External Functions Registry
 * Functions callable by the Monty-sandboxed agent.
 * Enforces autonomy tiers and user-scoping.
 */

import { supabase } from '../config';
import { PendingApproval } from './errors';
import { logger } from '../utils/logger';
import { MemoryManager, PARALayer } from './memory-manager';
import { KnowledgeBaseService } from '../services/knowledge-base.service';

// Type definitions for agent code
export interface YTDState {
    revenue: number;
    expenses: number;
    vat_paid: number;
    pit_paid: number;
}

export interface Thresholds {
    vat_threshold: number;
    pit_threshold: number;
    withholding_threshold: number;
}

/**
 * Registry of all functions callable by Monty-sandboxed agent code.
 * Each function is tenant-scoped via user_id parameter.
 */
export const externalFunctions = {

    // ============================================================
    // TIER 1: OBSERVATIONAL (Always allowed, read-only)
    // ============================================================

    /**
     * Calculate year-to-date financial state for user.
     */
    async calculate_ytd(user_id: string): Promise<YTDState> {
        logger.info('[ExternalFunctions] calculate_ytd', { user_id });

        const fiscalYear = new Date().getFullYear();
        const { data, error } = await supabase
            .from('ytd_state')
            .select('revenue, expenses, vat_paid, pit_paid')
            .eq('user_id', user_id)
            .eq('fiscal_year', fiscalYear)
            .maybeSingle();

        if (error) {
            throw error;
        }

        return data || {
            revenue: 0,
            expenses: 0,
            vat_paid: 0,
            pit_paid: 0
        };
    },


    /**
     * Get Nigerian tax thresholds for current year.
     */
    async get_thresholds(user_id: string): Promise<Thresholds> {
        logger.info('[ExternalFunctions] get_thresholds', { user_id });
        return {
            vat_threshold: 25_000_000,
            pit_threshold: 300_000,
            withholding_threshold: 10_000_000
        };
    },

    /**
     * Query Nigerian tax law knowledge base via QMD.
     */
    async query_tax_law(question: string): Promise<string> {
        logger.info('[ExternalFunctions] query_tax_law', { question });
        return await KnowledgeBaseService.searchTaxLaw(question);
    },

    /**
     * Get active PARA facts for the user.
     */
    async get_active_facts(user_id: string, layer?: PARALayer): Promise<any[]> {
        logger.info('[ExternalFunctions] get_active_facts', { user_id, layer });
        return await MemoryManager.getActiveFacts(user_id, layer);
    },

    // ============================================================
    // TIER 2: ADVISORY (Auto-executed with 24h undo)
    // ============================================================

    /**
     * Create an optimization suggestion for user.
     */
    async create_optimization_hint(
        user_id: string,
        hint_type: string,
        details: Record<string, any>
    ): Promise<void> {
        logger.info('[ExternalFunctions] create_optimization_hint', { user_id, hint_type });

        await supabase.from('optimization_hints').insert({
            user_id,
            hint_type,
            details,
            tier: 2,
            created_at: new Date().toISOString(),
            undo_available_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });
    },

    /**
     * Automatically tag a transaction.
     */
    async auto_tag_transaction(
        user_id: string,
        transaction_id: string,
        suggested_category: string
    ): Promise<void> {
        logger.info('[ExternalFunctions] auto_tag_transaction', { user_id, transaction_id, suggested_category });

        await supabase.from('transactions').update({
            category: suggested_category,
            is_auto_tagged: true,
            tagged_at: new Date().toISOString()
        })
            .eq('id', transaction_id)
            .eq('user_id', user_id);
    },

    /**
     * Store an atomic fact (supersedes old facts by entity_name).
     */
    async store_atomic_fact(
        user_id: string,
        layer: PARALayer,
        entity_name: string,
        fact_content: any,
        confidence: number = 1.0
    ): Promise<void> {
        logger.info('[ExternalFunctions] store_atomic_fact', { user_id, entity_name, layer });
        await MemoryManager.storeFact({
            user_id,
            layer,
            entity_name,
            fact_content,
            confidence
        });
    },

    // ============================================================
    // TIER 3: ACTIVE (Requires user approval, creates proposal)
    // ============================================================

    /**
     * Reclassify a transaction (requires user approval).
     */
    async reclassify_transaction(
        user_id: string,
        transaction_id: string,
        new_category: string,
        reason: string
    ): Promise<never> {
        logger.info('[ExternalFunctions] reclassify_transaction (GATE)', { user_id, transaction_id });

        throw new PendingApproval('tier_3', {
            function_name: 'reclassify_transaction',
            user_id,
            args: { transaction_id, new_category, reason },
            requires_secure_handover: false
        });
    },

    /**
     * Create a new project draft (requires user approval).
     */
    async create_project_draft(
        user_id: string,
        project_name: string,
        estimated_revenue: number
    ): Promise<never> {
        logger.info('[ExternalFunctions] create_project_draft (GATE)', { user_id, project_name });

        throw new PendingApproval('tier_3', {
            function_name: 'create_project_draft',
            user_id,
            args: { project_name, estimated_revenue },
            requires_secure_handover: false
        });
    },

    // ============================================================
    // TIER 4: CRITICAL (Requires secure handover + MFA)
    // ============================================================

    /**
     * File VAT registration with FIRS (requires secure web handover).
     */
    async file_vat_registration(
        user_id: string,
        business_details: Record<string, any>
    ): Promise<never> {
        logger.info('[ExternalFunctions] file_vat_registration (GATE)', { user_id });

        throw new PendingApproval('tier_4', {
            function_name: 'file_vat_registration',
            user_id,
            args: { business_details },
            requires_secure_handover: true
        });
    },

    /**
     * Submit tax return to FIRS (requires secure web handover).
     */
    async submit_tax_return(
        user_id: string,
        year: number,
        return_data: Record<string, any>
    ): Promise<never> {
        logger.info('[ExternalFunctions] submit_tax_return (GATE)', { user_id, year });

        throw new PendingApproval('tier_4', {
            function_name: 'submit_tax_return',
            user_id,
            args: { year, return_data },
            requires_secure_handover: true
        });
    }
};
