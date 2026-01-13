/**
 * Minimum Effective Tax Rate Skill
 * Handles 15% minimum ETR per Nigeria Tax Act 2025
 */

import { logger } from '../../utils/logger';
import { Session as SessionContext } from '../../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';

const MINIMUM_ETR = 0.15; // 15%
const LARGE_COMPANY_TURNOVER = 20000000000; // ₦20B
const DEPRECIATION_EXCLUSION = 0.05; // 5%
const PERSONNEL_EXCLUSION = 0.05; // 5%

export class MinimumETRSkill {
    private formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
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
            const taxMatch = message.match(/(?:tax\s*paid|covered\s*tax)[:\s]*[₦n]?([\d,]+)/i);
            const turnoverMatch = message.match(/turnover[:\s]*[₦n]?([\d,]+)/i);
            const depreciationMatch = message.match(/depreciation[:\s]*[₦n]?([\d,]+)/i);
            const personnelMatch = message.match(/personnel[:\s]*[₦n]?([\d,]+)/i);

            const isMNE = lowerMessage.includes('mne') || lowerMessage.includes('multinational');

            if (profitMatch && taxMatch) {
                const profits = parseInt(profitMatch[1].replace(/,/g, ''));
                const taxPaid = parseInt(taxMatch[1].replace(/,/g, ''));
                const turnover = turnoverMatch ? parseInt(turnoverMatch[1].replace(/,/g, '')) : 0;
                const depreciation = depreciationMatch ? parseInt(depreciationMatch[1].replace(/,/g, '')) : 0;
                const personnel = personnelMatch ? parseInt(personnelMatch[1].replace(/,/g, '')) : 0;

                // Check if minimum ETR applies
                const appliesMinETR = isMNE || turnover >= LARGE_COMPANY_TURNOVER;

                if (!appliesMinETR && turnover > 0) {
                    return {
                        message: `📊 Minimum Effective Tax Rate\n` +
                            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                            `Turnover: ${this.formatCurrency(turnover)}\n\n` +
                            `✅ *NOT APPLICABLE*\n` +
                            `Minimum 15% ETR only applies to:\n` +
                            `• MNE group members\n` +
                            `• Companies with turnover ≥ ${this.formatCurrency(LARGE_COMPANY_TURNOVER)}\n\n` +
                            `Your turnover is below the threshold.\n\n` +
                            `Reference: Section 59 NTA 2025`,
                        metadata: { skill: 'minimum-etr', applicable: false }
                    };
                }

                // Calculate adjusted profits
                const depreciationExclusion = depreciation * DEPRECIATION_EXCLUSION;
                const personnelExclusion = personnel * PERSONNEL_EXCLUSION;
                const adjustedProfits = profits - depreciationExclusion - personnelExclusion;

                // Calculate ETR
                const currentETR = adjustedProfits > 0 ? taxPaid / adjustedProfits : 0;
                const meetsMinimum = currentETR >= MINIMUM_ETR;
                const topUpTax = meetsMinimum ? 0 : adjustedProfits * (MINIMUM_ETR - currentETR);

                let response = `📊 Minimum Effective Tax Rate\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `Qualifying Profits: ${this.formatCurrency(profits)}\n` +
                    `Covered Tax Paid: ${this.formatCurrency(taxPaid)}\n\n`;

                if (depreciation > 0 || personnel > 0) {
                    response += `📋 Substance Exclusions (5% each):\n`;
                    if (depreciation > 0) {
                        response += `├─ Depreciation: -${this.formatCurrency(depreciationExclusion)}\n`;
                    }
                    if (personnel > 0) {
                        response += `├─ Personnel: -${this.formatCurrency(personnelExclusion)}\n`;
                    }
                    response += `└─ Adjusted Profits: ${this.formatCurrency(adjustedProfits)}\n\n`;
                }

                response += `📊 ETR Calculation:\n` +
                    `├─ Current ETR: ${(currentETR * 100).toFixed(2)}%\n` +
                    `├─ Minimum ETR: 15%\n`;

                if (meetsMinimum) {
                    response += `└─ Status: ✅ COMPLIANT\n\n` +
                        `No top-up tax required.\n`;
                } else {
                    response += `└─ Status: ⚠️ BELOW MINIMUM\n\n` +
                        `💰 Top-Up Tax Required: ${this.formatCurrency(topUpTax)}\n\n` +
                        `This ensures total tax = 15% of adjusted profits.\n`;
                }

                response += `\n💡 Note:\n` +
                    `• EDTCs may offset top-up tax\n` +
                    `• Review with tax advisor for complex structures\n\n` +
                    `Reference: Section 59 NTA 2025`;

                return {
                    message: response,
                    metadata: {
                        skill: 'minimum-etr',
                        profits,
                        taxPaid,
                        adjustedProfits,
                        currentETR,
                        meetsMinimum,
                        topUpTax
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
                    `• *minimum tax profit [X] tax paid [Y]*\n` +
                    `• *etr profit [X] tax paid [Y] turnover [Z]*\n\n` +
                    `Optional adjustments:\n` +
                    `• depreciation [amount]\n` +
                    `• personnel [amount]\n\n` +
                    `Example:\n` +
                    `minimum tax profit 500000000 tax paid 50000000 turnover 25000000000`,
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
