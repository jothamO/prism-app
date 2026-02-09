/**
 * Knowledge Base Service
 * Bridge between the Agent Core and the Central Rules Engine.
 * Provides fact-grounded tax rules for the agent's RAG context.
 */

import { supabase } from '../config';
import { logger } from '../utils/logger';

export interface TaxRule {
    id: string;
    rule_code: string;
    rule_name: string;
    rule_type: string;
    parameters: Record<string, any>;
    description: string;
    priority: number;
}

export class KnowledgeBaseService {
    /**
     * Build a summary of current tax rules for agent grounding.
     */
    static async getTaxProvisionsSummary(): Promise<string> {
        try {
            const { data: rules, error } = await supabase
                .from('compliance_rules')
                .select('*')
                .eq('is_active', true)
                .order('priority');

            if (error) throw error;
            if (!rules || rules.length === 0) {
                return "No verified tax rules available in the knowledge base.";
            }

            const categories: Record<string, TaxRule[]> = {};
            rules.forEach(rule => {
                const type = rule.rule_type || 'general';
                if (!categories[type]) categories[type] = [];
                categories[type].push(rule);
            });

            let summary = "FACT-GROUNDED TAX RULES:\n\n";

            for (const [type, typeRules] of Object.entries(categories)) {
                summary += `${type.toUpperCase()}:\n`;
                typeRules.forEach(r => {
                    summary += `- ${r.rule_name}: ${r.description || ''}\n`;
                    if (r.parameters && Object.keys(r.parameters).length > 0) {
                        summary += `  (Params: ${JSON.stringify(r.parameters)})\n`;
                    }
                });
                summary += "\n";
            }

            summary += "\nCITATION RULE: Use these rules only. If not listed, state information is unverified.";
            return summary;
        } catch (error) {
            logger.error('[KnowledgeBaseService] Error building tax summary:', error);
            return "Error retrieving tax rules. Defaulting to safe mode.";
        }
    }

    /**
     * Search for specific tax law provisions (Basic Keyword Search for now).
     * To be upgraded to Vector Search (P6.9).
     */
    static async searchTaxLaw(query: string): Promise<string> {
        logger.info('[KnowledgeBaseService] Searching tax law', { query });

        // 1. Try to find a specific rule match
        const { data: rules } = await supabase
            .from('compliance_rules')
            .select('*')
            .ilike('description', `%${query}%`)
            .limit(3);

        if (rules && rules.length > 0) {
            return rules.map(r => `Rule: ${r.rule_name}\nDescription: ${r.description}`).join('\n---\n');
        }

        // 2. Fallback to general summary if specific match fails
        return await this.getTaxProvisionsSummary();
    }
}
