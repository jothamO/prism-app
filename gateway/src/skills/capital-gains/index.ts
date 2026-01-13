/**
 * Capital Gains Tax Skill
 * Handles CGT calculations per Nigeria Tax Act 2025
 */

import { logger } from '../../utils/logger';
import { Session as SessionContext } from '../../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';

// CGT Exemptions per NTA 2025
const PERSONAL_CHATTELS_LIMIT = 5000000; // ₦5M
const VEHICLE_LIMIT_PER_YEAR = 2;

export class CapitalGainsSkill {
    private formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
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

                const gain = disposalValue - costBasis - improvements;
                const isGain = gain > 0;

                // Check exemptions
                const isPrincipalResidence = lowerMessage.includes('residence') || lowerMessage.includes('home') || lowerMessage.includes('house');
                const isVehicle = lowerMessage.includes('car') || lowerMessage.includes('vehicle');
                const isChattels = lowerMessage.includes('chattel') || lowerMessage.includes('furniture') || lowerMessage.includes('personal');

                let response = `📈 Capital Gains Tax Calculation\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `Disposal Value: ${this.formatCurrency(disposalValue)}\n` +
                    `Cost Basis: ${this.formatCurrency(costBasis)}\n`;

                if (improvements > 0) {
                    response += `Improvements: ${this.formatCurrency(improvements)}\n`;
                }

                response += `\n📊 Gain/Loss: ${isGain ? '' : '-'}${this.formatCurrency(Math.abs(gain))}\n\n`;

                // Apply exemptions
                if (!isGain) {
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
                        `Private motor vehicles (max ${VEHICLE_LIMIT_PER_YEAR}/year) are exempt.\n` +
                        `Chargeable Gain: ₦0\n\n`;
                } else if (isChattels && disposalValue <= PERSONAL_CHATTELS_LIMIT) {
                    response += `✅ *PERSONAL CHATTELS EXEMPTION*\n` +
                        `Disposal ≤ ${this.formatCurrency(PERSONAL_CHATTELS_LIMIT)} is exempt.\n` +
                        `Chargeable Gain: ₦0\n\n`;
                } else {
                    response += `💰 *CHARGEABLE GAIN*\n` +
                        `This gain is included in your assessable income.\n` +
                        `Tax is calculated at your marginal income tax rate.\n\n` +
                        `If annual income + gain > ₦50M: 25% rate applies\n\n`;
                }

                response += `Reference: Sections 51-53 NTA 2025`;

                return {
                    message: response,
                    metadata: {
                        skill: 'capital-gains',
                        disposalValue,
                        costBasis,
                        improvements,
                        gain,
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
