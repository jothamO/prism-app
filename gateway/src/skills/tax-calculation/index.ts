/**
 * Tax Calculation Skill
 * Handles income tax calculations per Nigeria Tax Act 2025
 * Uses Central Rules Engine for dynamic tax bands
 */

import { logger } from '../../utils/logger';
import { Session as SessionContext } from '../../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';
import { getTaxBands, getThreshold, TaxBand } from '../../services/rules-fetcher';

// Fallback values (used only if rules-fetcher fails completely)
const FALLBACK_TAX_BANDS: TaxBand[] = [
    { min: 0, max: 800000, rate: 0, label: 'First ₦800,000' },
    { min: 800000, max: 3000000, rate: 0.15, label: 'Next ₦2,200,000' },
    { min: 3000000, max: 12000000, rate: 0.18, label: 'Next ₦9,000,000' },
    { min: 12000000, max: 25000000, rate: 0.21, label: 'Next ₦13,000,000' },
    { min: 25000000, max: 50000000, rate: 0.23, label: 'Next ₦25,000,000' },
    { min: 50000000, max: null, rate: 0.25, label: 'Above ₦50,000,000' },
];

const FALLBACK_MINIMUM_WAGE_ANNUAL = 840000;
const FALLBACK_SMALL_COMPANY_THRESHOLD = 50000000;

export interface TaxBandBreakdown {
    band: string;
    taxableInBand: number;
    rate: number;
    taxInBand: number;
}

export interface TaxCalculationResult {
    grossIncome: number;
    chargeableIncome: number;
    taxBreakdown: TaxBandBreakdown[];
    totalTax: number;
    effectiveRate: number;
    monthlyTax: number;
    monthlyNetIncome: number;
    isMinimumWageExempt: boolean;
    isPensionExempt: boolean;
    isFreelancer: boolean;
    actReference: string;
}

export class TaxCalculationSkill {
    private taxBandsCache: TaxBand[] | null = null;
    private minimumWageCache: number | null = null;
    private smallCompanyThresholdCache: number | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    /**
     * Get tax bands (from cache or fetch)
     */
    private async getTaxBandsWithCache(): Promise<TaxBand[]> {
        if (this.taxBandsCache && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
            return this.taxBandsCache;
        }

        try {
            const bands = await getTaxBands();
            if (bands.length > 0) {
                this.taxBandsCache = bands;
                this.cacheTimestamp = Date.now();
                logger.info('[Tax Skill] Loaded tax bands from Central Rules Engine');
                return bands;
            }
        } catch (error) {
            logger.warn('[Tax Skill] Failed to fetch tax bands, using fallback:', error);
        }

        return FALLBACK_TAX_BANDS;
    }

    /**
     * Get minimum wage threshold
     */
    private async getMinimumWageAnnual(): Promise<number> {
        if (this.minimumWageCache && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
            return this.minimumWageCache;
        }

        try {
            const threshold = await getThreshold('MINIMUM_WAGE');
            if (threshold?.annual) {
                this.minimumWageCache = threshold.annual;
                return threshold.annual;
            }
        } catch (error) {
            logger.warn('[Tax Skill] Failed to fetch minimum wage, using fallback:', error);
        }

        return FALLBACK_MINIMUM_WAGE_ANNUAL;
    }

    /**
     * Get small company threshold
     */
    private async getSmallCompanyThreshold(): Promise<number> {
        if (this.smallCompanyThresholdCache && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
            return this.smallCompanyThresholdCache;
        }

        try {
            const threshold = await getThreshold('SMALL_COMPANY_TURNOVER');
            if (threshold?.limit) {
                this.smallCompanyThresholdCache = threshold.limit;
                return threshold.limit;
            }
        } catch (error) {
            logger.warn('[Tax Skill] Failed to fetch small company threshold, using fallback:', error);
        }

        return FALLBACK_SMALL_COMPANY_THRESHOLD;
    }

    /**
     * Format currency
     */
    private formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
    }

    /**
     * Calculate progressive tax using current tax bands
     */
    private calculateProgressiveTax(
        chargeableIncome: number,
        taxBands: TaxBand[]
    ): { breakdown: TaxBandBreakdown[]; totalTax: number } {
        const breakdown: TaxBandBreakdown[] = [];
        let totalTax = 0;
        let remainingIncome = chargeableIncome;

        for (const band of taxBands) {
            if (remainingIncome <= 0) break;

            const bandMax = band.max === null ? Infinity : band.max;
            const bandWidth = bandMax === Infinity ? Infinity : bandMax - band.min;
            const taxableInBand = Math.min(remainingIncome, bandWidth);
            const taxInBand = taxableInBand * band.rate;

            breakdown.push({
                band: band.label,
                taxableInBand,
                rate: band.rate,
                taxInBand,
            });

            totalTax += taxInBand;
            remainingIncome -= taxableInBand;
        }

        return { breakdown, totalTax };
    }

    /**
     * Handle tax calculation request
     */
    async handle(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            logger.info('[Tax Skill] Processing request', { userId: context.userId, message });

            // Fetch current rules
            const taxBands = await this.getTaxBandsWithCache();
            const minimumWageAnnual = await this.getMinimumWageAnnual();
            const smallCompanyThreshold = await this.getSmallCompanyThreshold();

            const lowerMessage = message.toLowerCase();

            // Pension income check
            if (lowerMessage.includes('pension')) {
                const pensionMatch = message.match(/pension\s+[₦n]?(\d[\d,]*)/i);
                if (pensionMatch) {
                    const amount = parseInt(pensionMatch[1].replace(/,/g, ''));
                    return {
                        message: `👴 Pension Tax Calculation\n` +
                            `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                            `Pension Income: ${this.formatCurrency(amount)}\n\n` +
                            `✅ *FULLY EXEMPT*\n\n` +
                            `Under Section 163 of NTA 2025, pension\n` +
                            `income under the Pension Reform Act is\n` +
                            `completely exempt from income tax.\n\n` +
                            `📊 Summary:\n` +
                            `├─ Tax Payable: ₦0\n` +
                            `├─ Effective Rate: 0%\n` +
                            `└─ Net Monthly: ${this.formatCurrency(amount / 12)}\n\n` +
                            `Reference: Section 163 NTA 2025`,
                        metadata: { skill: 'tax-calculation', incomeType: 'pension', exempt: true }
                    };
                }
            }

            // Freelancer/business income
            const freelanceMatch = message.match(/freelance\s+[₦n]?(\d[\d,]*)\s*(?:expenses?\s+[₦n]?(\d[\d,]*))?/i);
            if (freelanceMatch) {
                const income = parseInt(freelanceMatch[1].replace(/,/g, ''));
                const expenses = freelanceMatch[2] ? parseInt(freelanceMatch[2].replace(/,/g, '')) : 0;
                const netIncome = Math.max(0, income - expenses);

                // Check Small Company status using dynamic threshold
                const isSmallCompany = income <= smallCompanyThreshold;

                const { breakdown, totalTax } = this.calculateProgressiveTax(netIncome, taxBands);
                const effectiveRate = netIncome > 0 ? (totalTax / netIncome) * 100 : 0;

                const breakdownStr = breakdown
                    .filter(b => b.taxInBand > 0)
                    .map(b => `├─ ${b.band} @ ${(b.rate * 100).toFixed(0)}%: ${this.formatCurrency(b.taxInBand)}`)
                    .join('\n');

                let response = `💻 Freelancer Tax Calculation\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `Gross Income: ${this.formatCurrency(income)}\n` +
                    `Business Expenses: ${this.formatCurrency(expenses)}\n` +
                    `Net Income: ${this.formatCurrency(netIncome)}\n\n`;

                if (isSmallCompany) {
                    response += `✅ *SMALL COMPANY STATUS*\n` +
                        `Turnover ≤ ${this.formatCurrency(smallCompanyThreshold)} qualifies for 0% Company Tax\n\n`;
                }

                response += `📋 Tax Breakdown (Section 58):\n${breakdownStr}\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `💰 Annual Tax: ${this.formatCurrency(totalTax)}\n` +
                    `📊 Effective Rate: ${effectiveRate.toFixed(2)}%\n` +
                    `📅 Monthly Tax: ${this.formatCurrency(totalTax / 12)}\n` +
                    `💵 Monthly Net: ${this.formatCurrency((netIncome - totalTax) / 12)}\n\n` +
                    `💡 Tips:\n` +
                    `• Keep receipts for all business expenses\n` +
                    `• R&D expenses get additional deduction\n`;

                if (!isSmallCompany) {
                    response += `• Consider incorporating for tax benefits\n`;
                }

                response += `\nReference: Section 20, 56, 58 NTA 2025`;

                return {
                    message: response,
                    metadata: {
                        skill: 'tax-calculation',
                        incomeType: 'freelancer',
                        grossIncome: income,
                        expenses,
                        netIncome,
                        totalTax,
                        isSmallCompany,
                        rulesSource: 'central-engine'
                    }
                };
            }

            // Regular income tax
            const taxMatch = message.match(/tax\s+[₦n]?(\d[\d,]*)/i);
            const salaryMatch = message.match(/salary\s+[₦n]?(\d[\d,]*)/i);
            const incomeMatch = taxMatch || salaryMatch;

            if (incomeMatch) {
                const amount = parseInt(incomeMatch[1].replace(/,/g, ''));
                const isMonthly = amount < 1000000; // Assume monthly if < 1M
                const annualIncome = isMonthly ? amount * 12 : amount;

                // Check minimum wage exemption using dynamic threshold
                if (annualIncome <= minimumWageAnnual) {
                    const monthlyWage = minimumWageAnnual / 12;
                    return {
                        message: `💰 Income Tax Calculation\n` +
                            `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                            `Annual Income: ${this.formatCurrency(annualIncome)}\n\n` +
                            `✅ *MINIMUM WAGE EXEMPTION*\n\n` +
                            `Your income is at or below the national\n` +
                            `minimum wage threshold (${this.formatCurrency(monthlyWage)}/month).\n\n` +
                            `📊 Summary:\n` +
                            `├─ Tax Payable: ₦0\n` +
                            `├─ Effective Rate: 0%\n` +
                            `└─ Monthly Net: ${this.formatCurrency(annualIncome / 12)}\n\n` +
                            `Reference: Section 58 NTA 2025`,
                        metadata: { skill: 'tax-calculation', minimumWageExempt: true, rulesSource: 'central-engine' }
                    };
                }

                const { breakdown, totalTax } = this.calculateProgressiveTax(annualIncome, taxBands);
                const effectiveRate = (totalTax / annualIncome) * 100;

                const breakdownStr = breakdown
                    .filter(b => b.taxInBand > 0)
                    .map(b => `├─ ${b.band} @ ${(b.rate * 100).toFixed(0)}%: ${this.formatCurrency(b.taxInBand)}`)
                    .join('\n');

                return {
                    message: `💰 Income Tax Calculation (PAYE)\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `${isMonthly ? 'Monthly' : 'Annual'} Income: ${this.formatCurrency(amount)}\n` +
                        `Annual Income: ${this.formatCurrency(annualIncome)}\n\n` +
                        `📋 Tax Breakdown (Section 58):\n${breakdownStr}\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `💰 Annual Tax: ${this.formatCurrency(totalTax)}\n` +
                        `📊 Effective Rate: ${effectiveRate.toFixed(2)}%\n` +
                        `📅 Monthly Tax: ${this.formatCurrency(totalTax / 12)}\n` +
                        `💵 Monthly Net: ${this.formatCurrency((annualIncome - totalTax) / 12)}\n\n` +
                        `Reference: Section 58, Fourth Schedule NTA 2025`,
                    metadata: {
                        skill: 'tax-calculation',
                        grossIncome: annualIncome,
                        totalTax,
                        effectiveRate,
                        monthlyTax: totalTax / 12,
                        rulesSource: 'central-engine'
                    }
                };
            }

            // No match - show help
            return {
                message: `💰 Tax Calculator\n\n` +
                    `Available commands:\n` +
                    `• *tax [amount]* - Calculate income tax\n` +
                    `• *salary [amount]* - Calculate PAYE\n` +
                    `• *pension [amount]* - Pension income (exempt)\n` +
                    `• *freelance [income] expenses [amount]* - Business income\n\n` +
                    `Examples:\n` +
                    `• tax 10000000\n` +
                    `• salary 350000\n` +
                    `• freelance 7200000 expenses 1800000`,
                metadata: { skill: 'tax-calculation' }
            };
        } catch (error) {
            logger.error('[Tax Skill] Error:', error);
            return {
                message: "❌ Failed to calculate tax. Please try again.",
                metadata: { skill: 'tax-calculation', error: (error as Error).message }
            };
        }
    }
}

export const taxCalculationSkill = new TaxCalculationSkill();
