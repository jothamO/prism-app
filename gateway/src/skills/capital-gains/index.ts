/**
 * Capital Gains Tax Skill
 * Handles CGT calculations via central tax-calculate edge function
 * NTA 2025 compliant
 */

import { logger } from '../../utils/logger';
import { Session as SessionContext } from '../../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';
import { taxService, CGTResult } from '../../utils/tax-service';

// CGT Exemptions for display only (actual calculation in tax-calculate)
const PERSONAL_CHATTELS_LIMIT = 5000000; // ₦5M

export class CapitalGainsSkill {
    private formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
    }

    /**
     * Detect asset type from message for exemption hints
     */
    private detectAssetType(message: string): 'shares' | 'property' | 'business' | 'other' {
        const lower = message.toLowerCase();
        if (lower.includes('share') || lower.includes('stock') || lower.includes('equity')) return 'shares';
        if (lower.includes('house') || lower.includes('property') || lower.includes('land') || lower.includes('residence')) return 'property';
        if (lower.includes('business') || lower.includes('company')) return 'business';
        return 'other';
    }

    /**
     * Format CGT result for user display
     */
    private formatResult(result: CGTResult, isPrincipalResidence: boolean, isVehicle: boolean, isChattels: boolean): string {
        const isGain = !result.is_loss && result.taxable_gain > 0;

        let response = `📈 Capital Gains Tax Calculation\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Disposal Value: ${this.formatCurrency(result.proceeds)}\n` +
            `Cost Basis: ${this.formatCurrency(result.cost_basis)}\n`;

        if (result.expenses > 0) {
            response += `Expenses: ${this.formatCurrency(result.expenses)}\n`;
        }

        response += `\n📊 Gain/Loss: ${result.is_loss ? '-' : ''}${this.formatCurrency(Math.abs(result.gross_gain))}\n\n`;

        // Apply exemption messaging
        if (result.is_loss) {
            response += `✅ *NO TAX LIABILITY*\n` +
                `Capital loss - no CGT applies.\n` +
                `Loss may be carried forward against future gains.\n\n`;
        } else if (isPrincipalResidence) {
            response += `✅ *PRINCIPAL RESIDENCE EXEMPTION*\n` +
                `One-time exemption for primary residence.\n` +
                `Chargeable Gain: ₦0\n\n` +
                `⚠️ This exemption can only be used once in a lifetime.\n\n`;
        } else if (isVehicle) {
            response += `✅ *PRIVATE VEHICLE EXEMPTION*\n` +
                `Private motor vehicles (max 2/year) are exempt.\n` +
                `Chargeable Gain: ₦0\n\n`;
        } else if (isChattels && result.proceeds <= PERSONAL_CHATTELS_LIMIT) {
            response += `✅ *PERSONAL CHATTELS EXEMPTION*\n` +
                `Disposal ≤ ${this.formatCurrency(PERSONAL_CHATTELS_LIMIT)} is exempt.\n` +
                `Chargeable Gain: ₦0\n\n`;
        } else if (isGain) {
            response += `💰 *CHARGEABLE GAIN*\n` +
                `CGT Rate: ${(result.cgt_rate * 100).toFixed(0)}%\n` +
                `CGT Payable: ${this.formatCurrency(result.cgt)}\n\n` +
                `This gain is included in your assessable income.\n\n`;
        }

        response += `Reference: Sections 51-53 NTA 2025`;
        return response;
    }

    async handle(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            logger.info('[CGT Skill] Processing request', { userId: context.userId, message });

            const lowerMessage = message.toLowerCase();

            // Parse disposal and cost
            const disposalMatch = message.match(/(?:sold|disposal|proceeds?)[:\s]*[₦n]?([\d,]+)/i);
            const costMatch = message.match(/(?:cost|bought|paid)[:\s]*[₦n]?([\d,]+)/i);
            const improvementMatch = message.match(/(?:improvement|renovation)[:\s]*[₦n]?([\d,]+)/i);

            if (disposalMatch && costMatch) {
                const disposalValue = parseInt(disposalMatch[1].replace(/,/g, ''));
                const costBasis = parseInt(costMatch[1].replace(/,/g, ''));
                const improvements = improvementMatch ? parseInt(improvementMatch[1].replace(/,/g, '')) : 0;

                // Detect exemption contexts
                const isPrincipalResidence = lowerMessage.includes('residence') || lowerMessage.includes('home') || lowerMessage.includes('house');
                const isVehicle = lowerMessage.includes('car') || lowerMessage.includes('vehicle');
                const isChattels = lowerMessage.includes('chattel') || lowerMessage.includes('furniture') || lowerMessage.includes('personal');

                // Call central tax-calculate via taxService
                const result = await taxService.calculateCGT(
                    {
                        proceeds: disposalValue,
                        cost_basis: costBasis,
                        expenses: improvements,
                        asset_type: this.detectAssetType(message)
                    },
                    context.userId
                );

                logger.info('[CGT Skill] Calculation complete via tax-calculate', {
                    userId: context.userId,
                    proceeds: disposalValue,
                    gain: result.gross_gain,
                    cgt: result.cgt
                });

                return {
                    message: this.formatResult(result, isPrincipalResidence, isVehicle, isChattels),
                    metadata: {
                        skill: 'capital-gains',
                        source: 'tax-calculate',
                        ...result,
                        isPrincipalResidence,
                        isVehicle,
                        isChattels
                    }
                };
            }

            // No match - show help
            return {
                message: `📈 Capital Gains Tax Calculator\n\n` +
                    `Calculate CGT on asset disposals per NTA 2025.\n\n` +
                    `Commands:\n` +
                    `• *sold [amount] cost [amount]*\n` +
                    `• *disposal [amount] cost [amount] improvement [amount]*\n\n` +
                    `Exemptions:\n` +
                    `├─ Principal residence (once in lifetime)\n` +
                    `├─ Personal chattels ≤ ${this.formatCurrency(PERSONAL_CHATTELS_LIMIT)}\n` +
                    `├─ Private vehicles (max 2/year)\n` +
                    `└─ Compensation for personal injury\n\n` +
                    `Examples:\n` +
                    `• sold 25000000 cost 15000000 (property)\n` +
                    `• sold residence 50000000 cost 30000000\n` +
                    `• sold car 8000000 cost 12000000`,
                metadata: { skill: 'capital-gains' }
            };
        } catch (error) {
            logger.error('[CGT Skill] Error:', error);
            return {
                message: "❌ Failed to calculate capital gains. Please try again.",
                metadata: { skill: 'capital-gains', error: (error as Error).message }
            };
        }
    }
}

export const capitalGainsSkill = new CapitalGainsSkill();
