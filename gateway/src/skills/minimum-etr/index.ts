/**
 * Minimum Effective Tax Rate Skill
 * Handles 15% minimum ETR via central tax-calculate edge function
 * NTA 2025 compliant
 */

import { logger } from '../../utils/logger';
import { Session as SessionContext } from '../../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';
import { taxService, METRResult } from '../../utils/tax-service';

// Display constants (calculation in tax-calculate)
const LARGE_COMPANY_TURNOVER = 20000000000; // ₦20B

export class MinimumETRSkill {
    private formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
    }

    /**
     * Format METR result for user display
     */
    private formatResult(result: METRResult, isMNE: boolean): string {
        // Check if minimum ETR applies
        if (!result.is_large_company && !isMNE) {
            return `📊 Minimum Effective Tax Rate\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `Turnover: ${this.formatCurrency(result.turnover)}\n\n` +
                `✅ *NOT APPLICABLE*\n` +
                `Minimum 15% ETR only applies to:\n` +
                `• MNE group members\n` +
                `• Companies with turnover ≥ ${this.formatCurrency(LARGE_COMPANY_TURNOVER)}\n\n` +
                `Your turnover is below the threshold.\n\n` +
                `Reference: Section 59 NTA 2025`;
        }

        let response = `📊 Minimum Effective Tax Rate\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Qualifying Profits: ${this.formatCurrency(result.profits)}\n` +
            `Adjusted Profits: ${this.formatCurrency(result.adjusted_profits)}\n`;

        if (result.losses_brought_forward > 0) {
            response += `Losses B/F: ${this.formatCurrency(result.losses_brought_forward)}\n`;
        }

        response += `Turnover: ${this.formatCurrency(result.turnover)}\n\n` +
            `📊 ETR Analysis:\n` +
            `├─ Minimum ETR: ${(result.minimum_etr * 100).toFixed(0)}%\n` +
            `├─ Minimum Tax: ${this.formatCurrency(result.minimum_tax)}\n` +
            `└─ Status: ${result.is_large_company ? '⚠️ SUBJECT TO MIN ETR' : '✅ Below threshold'}\n\n` +
            `${result.note}\n\n` +
            `💡 Note:\n` +
            `• EDTCs may offset top-up tax\n` +
            `• Review with tax advisor for complex structures\n\n` +
            `Reference: Section 59 NTA 2025`;

        return response;
    }

    async handle(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            logger.info('[MinETR] Processing request', { userId: context.userId, message });

            const lowerMessage = message.toLowerCase();

            // Parse values
            const profitMatch = message.match(/(?:profit|income)[:\s]*[₦n]?([\d,]+)/i);
            const lossMatch = message.match(/(?:loss|losses?)[:\s]*[₦n]?([\d,]+)/i);
            const turnoverMatch = message.match(/turnover[:\s]*[₦n]?([\d,]+)/i);

            const isMNE = lowerMessage.includes('mne') || lowerMessage.includes('multinational');

            if (profitMatch) {
                const profits = parseInt(profitMatch[1].replace(/,/g, ''));
                const losses = lossMatch ? parseInt(lossMatch[1].replace(/,/g, '')) : 0;
                const turnover = turnoverMatch ? parseInt(turnoverMatch[1].replace(/,/g, '')) : profits * 1.2;

                // Call central tax-calculate via taxService
                const result = await taxService.calculateMETR(
                    {
                        profits,
                        losses_brought_forward: losses,
                        turnover
                    },
                    context.userId
                );

                logger.info('[MinETR] Calculation complete via tax-calculate', {
                    userId: context.userId,
                    profits,
                    isLargeCompany: result.is_large_company,
                    minimumTax: result.minimum_tax
                });

                return {
                    message: this.formatResult(result, isMNE),
                    metadata: {
                        skill: 'minimum-etr',
                        source: 'tax-calculate',
                        isMNE,
                        ...result
                    }
                };
            }

            // No match - show help
            return {
                message: `📊 Minimum ETR Calculator\n\n` +
                    `Calculate 15% minimum effective tax rate.\n\n` +
                    `Who it applies to:\n` +
                    `├─ MNE group members\n` +
                    `└─ Turnover ≥ ${this.formatCurrency(LARGE_COMPANY_TURNOVER)}\n\n` +
                    `Commands:\n` +
                    `• *minimum tax profit [X]*\n` +
                    `• *etr profit [X] turnover [Z]*\n` +
                    `• *etr profit [X] losses [Y]*\n\n` +
                    `Example:\n` +
                    `minimum tax profit 500000000 turnover 25000000000`,
                metadata: { skill: 'minimum-etr' }
            };
        } catch (error) {
            logger.error('[MinETR] Error:', error);
            return {
                message: "❌ Failed to calculate minimum ETR. Please try again.",
                metadata: { skill: 'minimum-etr', error: (error as Error).message }
            };
        }
    }
}

export const minimumETRSkill = new MinimumETRSkill();
