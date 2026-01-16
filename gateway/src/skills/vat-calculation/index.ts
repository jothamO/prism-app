/**
 * VAT Calculation Skill
 * Thin wrapper around central tax-calculate edge function
 * NLU classification is now centralized in tax-calculate
 */

import { logger } from '../../utils/logger';
import { Session as SessionContext } from '../../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';
import { PersonalityFormatter } from '../../utils/personality';
import { taxService, VATResult } from '../../utils/tax-service';

export class VATCalculationSkill {
    private formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
    }

    /**
     * Handle VAT calculation request
     * NLU exemption classification is now done by tax-calculate
     */
    async handle(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            logger.info('[VAT Skill] Processing request', { userId: context.userId, message });

            // Extract amount and description from message
            const vatMatch = message.match(/vat\s+[₦n]?([\d,]+)\s*(.*)?/i);
            if (!vatMatch) {
                return {
                    message: "💡 To calculate VAT, use: *vat [amount] [description]*\n\nExample: `vat 50000 electronics`",
                    metadata: { skill: 'vat-calculation' }
                };
            }

            const amount = parseInt(vatMatch[1].replace(/,/g, ''));
            const description = vatMatch[2]?.trim() || undefined;

            // Call central tax-calculate with description for NLU classification
            const result = await taxService.calculateVAT(
                {
                    amount,
                    is_vatable: true,
                    supply_type: 'goods',
                    description // Pass to central function for exemption NLU
                },
                context.userId
            );

            logger.info('[VAT Skill] Calculation complete via tax-calculate', {
                userId: context.userId,
                amount,
                classification: result.classification,
                vatRate: result.vat_rate
            });

            // Format response based on classification
            let response: string;

            if (result.classification === 'exempt') {
                response = `📋 VAT Classification Result\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `Item: ${description || 'goods'}\n` +
                    `Amount: ${this.formatCurrency(amount)}\n\n` +
                    `✅ *EXEMPT* from VAT\n` +
                    (result.matched_keyword ? `Matched: "${result.matched_keyword}"\n\n` : '\n') +
                    `⚠️ Cannot claim input VAT on exempt supplies\n\n` +
                    `Reference: ${result.act_reference || 'NTA 2025'}`;
            } else if (result.classification === 'zero-rated') {
                response = `📋 VAT Classification Result\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `Item: ${description || 'goods'}\n` +
                    `Amount: ${this.formatCurrency(amount)}\n\n` +
                    `✅ *ZERO-RATED* (0% VAT)\n` +
                    (result.matched_keyword ? `Matched: "${result.matched_keyword}"\n\n` : '\n') +
                    `✅ Can claim input VAT on related purchases\n\n` +
                    `Reference: ${result.act_reference || 'NTA 2025'}`;
            } else {
                const ratePercent = result.vat_rate * 100;
                response = `📋 VAT Calculation\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `Item: ${description || 'goods'}\n` +
                    `Subtotal: ${this.formatCurrency(result.base_amount)}\n` +
                    `VAT @ ${ratePercent}%: ${this.formatCurrency(result.vat_amount)}\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `*Total: ${this.formatCurrency(result.total_amount)}*\n\n` +
                    `✅ Can claim as input VAT if business expense\n\n` +
                    `Reference: ${result.act_reference || 'NTA 2025'}`;
            }

            return {
                message: response,
                metadata: {
                    skill: 'vat-calculation',
                    source: 'tax-calculate',
                    amount,
                    description,
                    ...result
                }
            };
        } catch (error) {
            logger.error('[VAT Skill] Error:', error);
            return {
                message: PersonalityFormatter.error("Failed to calculate VAT. Please try again with format: `vat [amount] [description]`", true),
                metadata: { skill: 'vat-calculation', error: (error as Error).message }
            };
        }
    }
}

export const vatCalculationSkill = new VATCalculationSkill();
