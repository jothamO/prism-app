/**
 * Corporate Tax Skill
 * Handles Companies Income Tax (CIT) per Nigeria Tax Act 2025
 * Uses Central Rules Engine for dynamic thresholds
 */

import { logger } from '../../utils/logger';
import { Session as SessionContext } from '../../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';
import { getThreshold } from '../../services/rules-fetcher';

// Constants per NTA 2025
const CORPORATE_TAX_RATE = 0.30; // 30%
const SMALL_COMPANY_RATE = 0.00; // 0%
const DEVELOPMENT_LEVY_RATE = 0.04; // 4%
const MINIMUM_ETR = 0.15; // 15%

// Fallback thresholds
const FALLBACK_SMALL_COMPANY_TURNOVER = 50000000; // ₦50M
const FALLBACK_SMALL_COMPANY_ASSETS = 250000000; // ₦250M
const FALLBACK_LARGE_COMPANY_TURNOVER = 20000000000; // ₦20B

export class CorporateTaxSkill {
    private smallCompanyTurnoverCache: number | null = null;
    private smallCompanyAssetsCache: number | null = null;
    private largeCompanyTurnoverCache: number | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    /**
     * Get small company thresholds
     */
    private async getSmallCompanyThresholds(): Promise<{ turnover: number; assets: number }> {
        if (this.smallCompanyTurnoverCache && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
            return {
                turnover: this.smallCompanyTurnoverCache,
                assets: this.smallCompanyAssetsCache || FALLBACK_SMALL_COMPANY_ASSETS
            };
        }

        try {
            const turnoverThreshold = await getThreshold('SMALL_COMPANY_TURNOVER');
            const assetsThreshold = await getThreshold('SMALL_COMPANY_ASSETS');

            const turnover = turnoverThreshold?.limit ?? FALLBACK_SMALL_COMPANY_TURNOVER;
            const assets = assetsThreshold?.limit ?? FALLBACK_SMALL_COMPANY_ASSETS;
            
            this.smallCompanyTurnoverCache = turnover;
            this.smallCompanyAssetsCache = assets;
            this.cacheTimestamp = Date.now();

            return { turnover, assets };
        } catch (error) {
            logger.warn('[Corporate Tax] Failed to fetch thresholds:', error);
            return {
                turnover: FALLBACK_SMALL_COMPANY_TURNOVER,
                assets: FALLBACK_SMALL_COMPANY_ASSETS
            };
        }
    }

    /**
     * Get large company threshold for minimum ETR
     */
    private async getLargeCompanyTurnover(): Promise<number> {
        if (this.largeCompanyTurnoverCache && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
            return this.largeCompanyTurnoverCache;
        }

        try {
            const threshold = await getThreshold('LARGE_COMPANY_TURNOVER');
            if (threshold?.limit) {
                this.largeCompanyTurnoverCache = threshold.limit;
                return threshold.limit;
            }
        } catch (error) {
            logger.warn('[Corporate Tax] Failed to fetch large company threshold:', error);
        }

        return FALLBACK_LARGE_COMPANY_TURNOVER;
    }

    /**
     * Format currency
     */
    private formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
    }

    /**
     * Calculate development levy distribution
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
     * Handle corporate tax calculation
     */
    async handle(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            logger.info('[Corporate Tax] Processing request', { userId: context.userId, message });

            // Fetch thresholds
            const smallThresholds = await this.getSmallCompanyThresholds();
            const largeCompanyTurnover = await this.getLargeCompanyTurnover();

            const lowerMessage = message.toLowerCase();

            // Parse input - support various formats
            const profitMatch = message.match(/(?:profit|income|turnover|cit|corporate\s*tax)[:\s]*[₦n]?([\d,]+)/i);
            const turnoverMatch = message.match(/turnover[:\s]*[₦n]?([\d,]+)/i);
            const assetsMatch = message.match(/assets?[:\s]*[₦n]?([\d,]+)/i);

            if (profitMatch || turnoverMatch) {
                const profits = profitMatch ? parseInt(profitMatch[1].replace(/,/g, '')) : 0;
                const turnover = turnoverMatch ? parseInt(turnoverMatch[1].replace(/,/g, '')) : profits;
                const assets = assetsMatch ? parseInt(assetsMatch[1].replace(/,/g, '')) : 0;

                // Determine company classification
                const isSmallCompany = turnover <= smallThresholds.turnover &&
                    (assets === 0 || assets <= smallThresholds.assets);
                const isLargeCompany = turnover >= largeCompanyTurnover;

                // Calculate taxes
                const taxRate = isSmallCompany ? SMALL_COMPANY_RATE : CORPORATE_TAX_RATE;
                const corporateTax = profits * taxRate;
                const developmentLevy = isSmallCompany ? 0 : profits * DEVELOPMENT_LEVY_RATE;
                const totalTax = corporateTax + developmentLevy;

                let response = `🏢 Corporate Tax Calculation (CIT)\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `Assessable Profits: ${this.formatCurrency(profits)}\n`;

                if (turnoverMatch) {
                    response += `Turnover: ${this.formatCurrency(turnover)}\n`;
                }
                if (assetsMatch) {
                    response += `Total Assets: ${this.formatCurrency(assets)}\n`;
                }

                response += `\n`;

                // Company status
                if (isSmallCompany) {
                    response += `✅ *SMALL COMPANY STATUS*\n` +
                        `Turnover ≤ ${this.formatCurrency(smallThresholds.turnover)}\n` +
                        `Assets ≤ ${this.formatCurrency(smallThresholds.assets)}\n\n` +
                        `📋 Tax Breakdown:\n` +
                        `├─ CIT Rate: 0% (exempt)\n` +
                        `├─ Development Levy: Exempt\n` +
                        `└─ Total Tax: ${this.formatCurrency(0)}\n\n` +
                        `💰 Net Profit: ${this.formatCurrency(profits)}\n\n` +
                        `Reference: Section 56 NTA 2025`;
                } else {
                    response += `📋 Tax Breakdown:\n` +
                        `├─ CIT @ 30%: ${this.formatCurrency(corporateTax)}\n` +
                        `├─ Development Levy @ 4%: ${this.formatCurrency(developmentLevy)}\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `💰 Total Tax Liability: ${this.formatCurrency(totalTax)}\n` +
                        `💵 Net Profit After Tax: ${this.formatCurrency(profits - totalTax)}\n` +
                        `📊 Effective Rate: ${((totalTax / profits) * 100).toFixed(2)}%\n\n`;

                    // Development Levy distribution
                    const devDistribution = this.getDevLevyDistribution(developmentLevy);
                    response += `📊 Development Levy Distribution:\n`;
                    devDistribution.forEach(d => {
                        response += `├─ ${d.fund} (${d.percentage}%): ${this.formatCurrency(d.amount)}\n`;
                    });

                    // Minimum ETR warning for large companies
                    if (isLargeCompany) {
                        const effectiveRate = totalTax / profits;
                        if (effectiveRate < MINIMUM_ETR) {
                            const topUp = profits * (MINIMUM_ETR - effectiveRate);
                            response += `\n⚠️ *MINIMUM ETR APPLIES*\n` +
                                `Large company (turnover ≥ ${this.formatCurrency(largeCompanyTurnover)})\n` +
                                `Current ETR: ${(effectiveRate * 100).toFixed(2)}%\n` +
                                `Required: 15%\n` +
                                `Top-up tax: ${this.formatCurrency(topUp)}\n`;
                        }
                    }

                    response += `\nReference: Section 56, 57, 59 NTA 2025`;
                }

                return {
                    message: response,
                    metadata: {
                        skill: 'corporate-tax',
                        profits,
                        turnover,
                        assets,
                        isSmallCompany,
                        isLargeCompany,
                        corporateTax,
                        developmentLevy,
                        totalTax,
                        rulesSource: 'central-engine'
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
                    `├─ Development Levy: 4%\n` +
                    `└─ Minimum ETR: 15% (turnover ≥₦20B)`,
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
