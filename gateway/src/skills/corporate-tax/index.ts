/**
 * Corporate Tax Skill
 * Handles Companies Income Tax (CIT) via central tax-calculate edge function
 * NTA 2025 compliant
 */

import { logger } from '../../utils/logger';
import { Session as SessionContext } from '../../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';
import { taxService, CITResult } from '../../utils/tax-service';

export class CorporateTaxSkill {
    private formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
    }

    /**
     * Calculate development levy distribution (for display only)
     */
    private getDevLevyDistribution(devLevy: number): { fund: string; percentage: number; amount: number }[] {
        return [
            { fund: 'Tertiary Education Trust Fund', percentage: 50, amount: devLevy * 0.50 },
            { fund: 'Nigerian Education Loan', percentage: 15, amount: devLevy * 0.15 },
            { fund: 'IT Development Fund', percentage: 8, amount: devLevy * 0.08 },
            { fund: 'NASENI', percentage: 8, amount: devLevy * 0.08 },
            { fund: 'NBTI', percentage: 4, amount: devLevy * 0.04 },
            { fund: 'Defence & Security Fund', percentage: 10, amount: devLevy * 0.10 },
            { fund: 'Cybersecurity Fund', percentage: 5, amount: devLevy * 0.05 },
        ];
    }

    /**
     * Format CIT result for user display
     */
    private formatResult(result: CITResult): string {
        let response = `🏢 Corporate Tax Calculation (CIT)\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Assessable Profits: ${this.formatCurrency(result.taxable_profits)}\n` +
            `Turnover: ${this.formatCurrency(result.turnover)}\n\n`;

        if (result.is_small_company) {
            response += `✅ *SMALL COMPANY STATUS*\n` +
                `Turnover ≤ ₦50M, qualifies for 0% CIT\n\n` +
                `📋 Tax Breakdown:\n` +
                `├─ CIT Rate: 0% (exempt)\n` +
                `├─ Development Levy: Exempt\n` +
                `└─ Total Tax: ${this.formatCurrency(0)}\n\n` +
                `💰 Net Profit: ${this.formatCurrency(result.taxable_profits)}\n\n` +
                `Reference: Section 56 NTA 2025`;
        } else {
            response += `📋 Tax Breakdown:\n` +
                `├─ CIT @ ${(result.cit_rate * 100).toFixed(0)}%: ${this.formatCurrency(result.cit)}\n` +
                `├─ Tertiary Education Tax: ${this.formatCurrency(result.tertiary_education_tax)}\n` +
                `├─ Development Levy: ${this.formatCurrency(result.development_levy)}\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `💰 Total Tax Liability: ${this.formatCurrency(result.total_tax)}\n` +
                `💵 Net Profit After Tax: ${this.formatCurrency(result.taxable_profits - result.total_tax)}\n` +
                `📊 Effective Rate: ${result.effective_rate.toFixed(2)}%\n\n`;

            // Development Levy distribution
            const devDistribution = this.getDevLevyDistribution(result.development_levy);
            response += `📊 Development Levy Distribution:\n`;
            devDistribution.forEach(d => {
                response += `├─ ${d.fund} (${d.percentage}%): ${this.formatCurrency(d.amount)}\n`;
            });

            response += `\nReference: Section 56, 57, 59 NTA 2025`;
        }

        return response;
    }

    /**
     * Handle corporate tax calculation
     */
    async handle(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            logger.info('[Corporate Tax] Processing request', { userId: context.userId, message });

            // Parse input - support various formats
            const profitMatch = message.match(/(?:profit|income|turnover|cit|corporate\s*tax)[:\s]*[₦n]?([\d,]+)/i);
            const turnoverMatch = message.match(/turnover[:\s]*[₦n]?([\d,]+)/i);
            const assetsMatch = message.match(/assets?[:\s]*[₦n]?([\d,]+)/i);

            if (profitMatch || turnoverMatch) {
                const profits = profitMatch ? parseInt(profitMatch[1].replace(/,/g, '')) : 0;
                const turnover = turnoverMatch ? parseInt(turnoverMatch[1].replace(/,/g, '')) : profits;
                const assets = assetsMatch ? parseInt(assetsMatch[1].replace(/,/g, '')) : 0;

                // Call central tax-calculate via taxService
                const result = await taxService.calculateCIT(
                    {
                        profits,
                        turnover,
                        assets
                    },
                    context.userId
                );

                logger.info('[Corporate Tax] Calculation complete via tax-calculate', {
                    userId: context.userId,
                    profits,
                    isSmallCompany: result.is_small_company,
                    totalTax: result.total_tax
                });

                return {
                    message: this.formatResult(result),
                    metadata: {
                        skill: 'corporate-tax',
                        source: 'tax-calculate',
                        ...result
                    }
                };
            }

            // No match - show help
            return {
                message: `🏢 Corporate Tax Calculator\n\n` +
                    `Calculate Companies Income Tax (CIT) per NTA 2025.\n\n` +
                    `Commands:\n` +
                    `• *corporate tax [profits]* - Calculate CIT\n` +
                    `• *cit [profits] turnover [amount]* - With turnover check\n` +
                    `• *cit [profits] assets [amount]* - With assets check\n\n` +
                    `Examples:\n` +
                    `• corporate tax 50000000\n` +
                    `• cit 25000000 turnover 40000000\n` +
                    `• cit 100000000 turnover 30000000 assets 200000000\n\n` +
                    `📋 Rates:\n` +
                    `├─ Small Company (0%): Turnover ≤₦50M, Assets ≤₦250M\n` +
                    `├─ Standard CIT: 30%\n` +
                    `├─ Tertiary Education Tax: 2.5%\n` +
                    `└─ Development Levy: 4% of CIT`,
                metadata: { skill: 'corporate-tax' }
            };
        } catch (error) {
            logger.error('[Corporate Tax] Error:', error);
            return {
                message: "❌ Failed to calculate corporate tax. Please try again.",
                metadata: { skill: 'corporate-tax', error: (error as Error).message }
            };
        }
    }
}

export const corporateTaxSkill = new CorporateTaxSkill();
