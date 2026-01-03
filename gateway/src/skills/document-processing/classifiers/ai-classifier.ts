/**
 * AI Classifier
 * Uses Claude Haiku 4.5 for intelligent classification
 * Tier 3: When patterns and rules don't match
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../../utils/logger';
import type { ClassificationResult } from './business-pattern';
import { supabase } from '../../../config';

export class AIClassifier {
    constructor(private claude: Anthropic) { }

    /**
     * Classify transaction using AI
     */
    async classify(
        txn: any,
        context: { userId: string; businessId?: string }
    ): Promise<ClassificationResult> {
        try {
            // Get business context for better classification
            const businessContext = await this.getBusinessContext(context.businessId);

            const prompt = this.buildClassificationPrompt(txn, businessContext);

            const response = await this.claude.messages.create({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 300,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            });

            const content = response.content[0];
            if (content.type !== 'text') {
                throw new Error('Unexpected response type');
            }

            const result = this.parseClassification(content.text);

            logger.info('[AIClassifier] Classification complete', {
                txn: txn.description,
                classification: result.classification,
                confidence: result.confidence
            });

            return {
                ...result,
                source: 'ai'
            };
        } catch (error) {
            logger.error('[AIClassifier] Classification failed:', error);

            // Return conservative default
            return {
                classification: 'expense',
                category: 'unclassified',
                confidence: 0.50,
                source: 'ai',
                reasoning: 'AI classification failed - defaulting to expense'
            };
        }
    }

    /**
     * Build classification prompt
     */
    private buildClassificationPrompt(txn: any, businessContext: any): string {
        const isCredit = txn.credit && txn.credit > 0;
        const amount = txn.credit || txn.debit || 0;

        return `
Classify this Nigerian bank transaction for VAT/tax purposes.

Transaction:
- Date: ${txn.date}
- Description: "${txn.description}"
- Amount: ₦${amount.toLocaleString()}
- Type: ${isCredit ? 'Credit (money in)' : 'Debit (money out)'}
${txn.reference ? `- Reference: ${txn.reference}` : ''}

BusinessContext:
${businessContext ? `- Type: ${businessContext.type}
- Industry: ${businessContext.industry}
- Name: ${businessContext.name}` : '- No business context available'}

Classify as ONE of:
- "sale" - Customer payment, revenue (VAT output)
- "expense" - Business expense for operations (VAT input)
- "capital" - Equipment/asset purchase (capital allowance)
- "loan" - Loan transaction (not taxable)
- "personal" - Personal/family transfer (not business)
- "salary" - Staff salary payment (WHT applies)

Also provide a specific category (e.g., "marketing_expense", "pos_sale", "equipment_purchase")

Return ONLY valid JSON:
{
  "classification": "...",
  "category": "...",
  "confidence": 0.XX,
  "reasoning": "brief explanation"
}

Be conservative - if unsure, lower confidence.
`.trim();
    }

    /**
     * Parse Claude's classification response
     */
    private parseClassification(response: string): Omit<ClassificationResult, 'source'> {
        try {
            // Extract JSON
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON in response');
            }

            const parsed = JSON.parse(jsonMatch[0]);

            return {
                classification: parsed.classification || 'expense',
                category: parsed.category || 'unclassified',
                confidence: Math.min(parsed.confidence || 0.70, 0.95), // Cap AI confidence at 95%
                reasoning: parsed.reasoning || 'AI classification'
            };
        } catch (error) {
            logger.error('[AIClassifier] Parse error:', error);
            throw new Error('Failed to parse AI response');
        }
    }

    /**
     * Get business context for better classification
     */
    private async getBusinessContext(businessId?: string): Promise<any> {
        if (!businessId) {
            return null;
        }

        try {
            const { data } = await supabase
                .from('businesses')
                .select('name, business_type, industry')
                .eq('id', businessId)
                .single();

            return data ? {
                name: data.name,
                type: data.business_type,
                industry: data.industry
            } : null;
        } catch (error) {
            logger.warn('[AIClassifier] Failed to get business context:', error);
            return null;
        }
    }
}
