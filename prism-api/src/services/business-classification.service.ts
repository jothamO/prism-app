/**
 * Business Classification Service
 * Tax Act 2025 - Section 56
 * 
 * Classifies businesses as small (0% tax) or medium/large (30% tax)
 * Small company: Turnover ≤ ₦50M AND Fixed assets ≤ ₦250M
 * Professional services: EXCLUDED from small company status
 */

import { supabase } from '../config/database';

interface BusinessClassification {
    classification: 'small' | 'medium' | 'large';
    taxRate: number;
    reason: string;
    qualifiesForZeroTax: boolean;
    thresholds: {
        turnoverLimit: number;
        actualTurnover: number;
        fixedAssetsLimit: number;
        actualFixedAssets: number;
    };
}

interface BusinessMetrics {
    turnover: number;
    fixedAssets: number;
    year: number;
}

export class BusinessClassificationService {
    // Section 56 thresholds
    private readonly SMALL_COMPANY_TURNOVER_LIMIT = 50_000_000; // ₦50M
    private readonly SMALL_COMPANY_ASSETS_LIMIT = 250_000_000; // ₦250M
    private readonly SMALL_COMPANY_TAX_RATE = 0; // 0% tax
    private readonly STANDARD_TAX_RATE = 0.30; // 30% tax

    /**
     * Classify business per Tax Act 2025 Section 56
     * 
     * Small company criteria:
     * 1. Gross turnover ≤ ₦50,000,000 per annum, AND
     * 2. Total fixed assets ≤ ₦250,000,000
     * 3. NOT a professional services firm
     * 
     * Professional services exclusion:
     * - Legal, accounting, consulting, etc. cannot be "small companies"
     */
    async classify(businessId: string): Promise<BusinessClassification> {
        const { data: business } = await supabase
            .from('businesses')
            .select('*')
            .eq('id', businessId)
            .single();

        if (!business) {
            throw new Error('Business not found');
        }

        const turnover = business.annual_turnover || 0;
        const fixedAssets = business.total_fixed_assets || 0;

        // Check 1: Professional services are EXCLUDED (Section 56)
        if (business.is_professional_services) {
            const result = {
                classification: 'medium' as const,
                taxRate: this.STANDARD_TAX_RATE,
                reason: 'Professional services firms are excluded from small company status (Section 56)',
                qualifiesForZeroTax: false,
                thresholds: {
                    turnoverLimit: this.SMALL_COMPANY_TURNOVER_LIMIT,
                    actualTurnover: turnover,
                    fixedAssetsLimit: this.SMALL_COMPANY_ASSETS_LIMIT,
                    actualFixedAssets: fixedAssets
                }
            };

            await this.saveClassification(businessId, result);
            return result;
        }

        // Check 2: Turnover and fixed assets thresholds
        const meetsT

        urnoverThreshold = turnover <= this.SMALL_COMPANY_TURNOVER_LIMIT;
        const meetsAssetsThreshold = fixedAssets <= this.SMALL_COMPANY_ASSETS_LIMIT;

        if (meetsT urnoverThreshold && meetsAssetsThreshold) {
            // Qualifies as SMALL COMPANY - 0% tax! 🎉
            const result = {
                classification: 'small' as const,
                taxRate: this.SMALL_COMPANY_TAX_RATE,
                reason: `Qualifies as Small Company (Section 56): Turnover ₦${turnover.toLocaleString()} ≤ ₦50M, Assets ₦${fixedAssets.toLocaleString()} ≤ ₦250M`,
                qualifiesForZeroTax: true,
                thresholds: {
                    turnoverLimit: this.SMALL_COMPANY_TURNOVER_LIMIT,
                    actualTurnover: turnover,
                    fixedAssetsLimit: this.SMALL_COMPANY_ASSETS_LIMIT,
                    actualFixedAssets: fixedAssets
                }
            };

            await this.saveClassification(businessId, result);
            return result;
        }

        // Does not qualify - Medium or Large company
        const classification = turnover > 100_000_000 ? 'large' : 'medium';

        const reasons = [];
        if (!meetsTurnoverThreshold) {
            reasons.push(`Turnover ₦${turnover.toLocaleString()} exceeds ₦50M limit`);
        }
        if (!meetsAssetsThreshold) {
            reasons.push(`Fixed assets ₦${fixedAssets.toLocaleString()} exceed ₦250M limit`);
        }

        const result = {
            classification,
            taxRate: this.STANDARD_TAX_RATE,
            reason: `Does not qualify as Small Company: ${reasons.join(', ')}`,
            qualifiesForZeroTax: false,
            thresholds: {
                turnoverLimit: this.SMALL_COMPANY_TURNOVER_LIMIT,
                actualTurnover: turnover,
                fixedAssetsLimit: this.SMALL_COMPANY_ASSETS_LIMIT,
                actualFixedAssets: fixedAssets
            }
        };

        await this.saveClassification(businessId, result);
        return result;
    }

    /**
     * Calculate annual metrics from transactions
     */
    async calculateMetrics(businessId: string, year?: number): Promise<BusinessMetrics> {
        const targetYear = year || new Date().getFullYear();
        const startDate = `${targetYear}-01-01`;
        const endDate = `${targetYear}-12-31`;

        // Calculate annual turnover from invoices (total sales)
        const { data: invoices } = await supabase
            .from('invoices')
            .select('total')
            .eq('business_id', businessId)
            .gte('date', startDate)
            .lte('date', endDate);

        const turnover = invoices?.reduce((sum, inv) => sum + (inv.total || 0), 0) || 0;

        // Calculate fixed assets from capital expenditures
        // Fixed assets = cumulative capital expenditure - depreciation
        const { data: capitalExpenses } = await supabase
            .from('expenses')
            .select('amount')
            .eq('business_id', businessId)
            .eq('category', 'capital_expenditure')
            .lte('date', endDate);

        const fixedAssets = capitalExpenses?.reduce((sum, exp) => sum + (exp.amount || 0), 0) || 0;

        // Update business record
        await supabase
            .from('businesses')
            .update({
                annual_turnover: turnover,
                total_fixed_assets: fixedAssets,
                classification_year: targetYear,
                last_classified_at: new Date().toISOString()
            })
            .eq('id', businessId);

        return {
            turnover,
            fixedAssets,
            year: targetYear
        };
    }

    /**
     * Auto-classify all businesses (run annually)
     */
    async classifyAll(year?: number): Promise<{
        total: number;
        small: number;
        medium: number;
        large: number;
    }> {
        const { data: businesses } = await supabase
            .from('businesses')
            .select('id');

        if (!businesses) {
            return { total: 0, small: 0, medium: 0, large: 0 };
        }

        const stats = { total: businesses.length, small: 0, medium: 0, large: 0 };

        for (const business of businesses) {
            try {
                await this.calculateMetrics(business.id, year);
                const classification = await this.classify(business.id);
                stats[classification.classification]++;
            } catch (error) {
                console.error(`Failed to classify business ${business.id}:`, error);
            }
        }

        return stats;
    }

    /**
     * Save classification to database
     */
    private async saveClassification(businessId: string, result: BusinessClassification): Promise<void> {
        await supabase
            .from('businesses')
            .update({
                classification: result.classification,
                tax_rate: result.taxRate,
                last_classified_at: new Date().toISOString()
            })
            .eq('id', businessId);
    }

    /**
     * Check if business qualifies for small company status
     */
    async isSmallCompany(businessId: string): Promise<boolean> {
        const classification = await this.classify(businessId);
        return classification.qualifiesForZeroTax;
    }

    /**
     * Get tax savings from small company status
     */
    async getTaxSavings(businessId: string): Promise<{
        actualTax: number;
        wouldPayAt30Percent: number;
        savings: number;
    }> {
        const { data: business } = await supabase
            .from('businesses')
            .select('annual_turnover, classification, tax_rate')
            .eq('id', businessId)
            .single();

        if (!business) {
            throw new Error('Business not found');
        }

        const profit = business.annual_turnover * 0.20; // Assume 20% profit margin
        const actualTax = profit * (business.tax_rate || 0);
        const wouldPayAt30Percent = profit * 0.30;
        const savings = wouldPayAt30Percent - actualTax;

        return {
            actualTax,
            wouldPayAt30Percent,
            savings
        };
    }
}

export const businessClassificationService = new BusinessClassificationService();
