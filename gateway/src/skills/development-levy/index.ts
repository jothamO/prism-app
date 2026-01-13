/**
 * Development Levy Skill
 * Handles 4% Development Levy per Nigeria Tax Act 2025
 */

import { logger } from '../../utils/logger';
import { Session as SessionContext } from '../../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';

const DEVELOPMENT_LEVY_RATE = 0.04; // 4%

// Distribution per Section 57 NTA 2025
const LEVY_DISTRIBUTION = [
    { fund: 'Tertiary Education Trust Fund', percentage: 50 },
    { fund: 'Nigerian Education Loan (NELAF)', percentage: 15 },
    { fund: 'Information Technology Development Fund', percentage: 8 },
    { fund: 'National Agency for Science (NASENI)', percentage: 8 },
    { fund: 'National Board for Technical Education (NBTI)', percentage: 4 },
    { fund: 'National Defence and Security Fund', percentage: 10 },
    { fund: 'National Cybersecurity Fund', percentage: 5 },
];

export class DevelopmentLevySkill {
    private formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
    }

    async handle(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            logger.info('[Dev Levy] Processing request', { userId: context.userId, message });

            const lowerMessage = message.toLowerCase();
            const profitMatch = message.match(/(?:profit|levy)[:\s]*[₦n]?([\d,]+)/i);

            // Check exemption indicators
            const isSmallCompany = lowerMessage.includes('small company') || lowerMessage.includes('small business');
            const isNonResident = lowerMessage.includes('non-resident') || lowerMessage.includes('nonresident');

            if (profitMatch) {
                const profits = parseInt(profitMatch[1].replace(/,/g, ''));

                if (isSmallCompany) {
                    return {
                        message: `🏛️ Development Levy\n` +
                            `━━━━━━━━━━━━━━━━━━━━━\n\n` +
                            `Assessable Profits: ${this.formatCurrency(profits)}\n\n` +
                            `✅ *EXEMPT - SMALL COMPANY*\n` +
                            `Companies with turnover ≤ ₦50M are exempt.\n\n` +
                            `Development Levy: ₦0\n\n` +
                            `Reference: Section 57 NTA 2025`,
                        metadata: { skill: 'development-levy', exempt: true, reason: 'small_company' }
                    };
                }

                if (isNonResident) {
                    return {
                        message: `🏛️ Development Levy\n` +
                            `━━━━━━━━━━━━━━━━━━━━━\n\n` +
                            `Assessable Profits: ${this.formatCurrency(profits)}\n\n` +
                            `✅ *EXEMPT - NON-RESIDENT*\n` +
                            `Non-resident companies are exempt.\n\n` +
                            `Development Levy: ₦0\n\n` +
                            `Reference: Section 57 NTA 2025`,
                        metadata: { skill: 'development-levy', exempt: true, reason: 'non_resident' }
                    };
                }

                const levy = profits * DEVELOPMENT_LEVY_RATE;

                let response = `🏛️ Development Levy Calculation\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `Assessable Profits: ${this.formatCurrency(profits)}\n` +
                    `Rate: 4%\n\n` +
                    `💰 Development Levy: ${this.formatCurrency(levy)}\n\n` +
                    `📊 Fund Distribution:\n`;

                LEVY_DISTRIBUTION.forEach(d => {
                    const amount = levy * (d.percentage / 100);
                    response += `├─ ${d.fund} (${d.percentage}%): ${this.formatCurrency(amount)}\n`;
                });

                response += `\n💡 Note:\n` +
                    `• Due alongside Company Income Tax\n` +
                    `• Paid to FIRS with CIT returns\n` +
                    `• Replaces former Education Tax\n\n` +
                    `Reference: Section 57 NTA 2025`;

                return {
                    message: response,
                    metadata: {
                        skill: 'development-levy',
                        profits,
                        levy,
                        distribution: LEVY_DISTRIBUTION.map(d => ({
                            fund: d.fund,
                            amount: levy * (d.percentage / 100)
                        }))
                    }
                };
            }

            // No match - show help
            return {
                message: `🏛️ Development Levy Calculator\n\n` +
                    `Calculate 4% Development Levy per NTA 2025.\n\n` +
                    `Commands:\n` +
                    `• *development levy [profits]*\n` +
                    `• *dev levy [profits]*\n\n` +
                    `Exemptions:\n` +
                    `├─ Small companies (turnover ≤ ₦50M)\n` +
                    `└─ Non-resident companies\n\n` +
                    `Fund Distribution:\n` +
                    LEVY_DISTRIBUTION.map(d => `├─ ${d.fund}: ${d.percentage}%`).join('\n') +
                    `\n\nExample:\n` +
                    `• development levy 100000000`,
                metadata: { skill: 'development-levy' }
            };
        } catch (error) {
            logger.error('[Dev Levy] Error:', error);
            return {
                message: "❌ Failed to calculate development levy. Please try again.",
                metadata: { skill: 'development-levy', error: (error as Error).message }
            };
        }
    }
}

export const developmentLevySkill = new DevelopmentLevySkill();
