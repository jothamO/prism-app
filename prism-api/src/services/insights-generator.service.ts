/**
 * Insights Generator Service
 * Phase 5 Week 3: Automated Learning Pipeline
 * 
 * Generates proactive tax optimization recommendations:
 * - Unclaimed deductions
 * - Tax threshold warnings (small company, VAT registration)
 * - VAT refund eligibility
 * - Cash flow predictions
 * - Tax liability projections
 */

import { supabase } from '../config/database';
import { pitCalculatorService } from './pit-calculator.service';
import { businessClassificationService } from './business-classification.service';
import { vatReconciliationService } from './vat-reconciliation.service';

export interface Insight {
    id?: string;
    type: 'tax_saving' | 'threshold_warning' | 'vat_refund' | 'cash_flow' | 'compliance';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    action: string;
    potentialSaving?: number;
    potentialCost?: number;
    deadline?: string;
    metadata?: any;
}

export class InsightsGeneratorService {
    /**
     * Generate monthly insights for a user
     */
    async generateMonthlyInsights(userId: string, businessId?: string): Promise<Insight[]> {
        const insights: Insight[] = [];

        const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM

        // Insight 1: Unclaimed deductions
        const unclaimedDeductions = await this.findUnclaimedDeductions(userId, currentMonth);
        if (unclaimedDeductions && unclaimedDeductions.total > 0) {
            insights.push({
                type: 'tax_saving',
                priority: 'high',
                title: `Save ₦${this.formatCurrency(unclaimedDeductions.potentialSaving)} on taxes`,
                description: `We found ${unclaimedDeductions.count} expenses worth ₦${this.formatCurrency(unclaimedDeductions.total)} that qualify for tax deductions but aren't categorized yet.`,
                action: 'Review and categorize deductible expenses',
                potentialSaving: unclaimedDeductions.potentialSaving,
                metadata: {
                    expenseIds: unclaimedDeductions.expenseIds,
                    categories: unclaimedDeductions.suggestedCategories
                }
            });
        }

        // Insight 2: Small company threshold (if business ID provided)
        if (businessId) {
            const thresholdWarning = await this.checkSmallCompanyThreshold(businessId);
            if (thresholdWarning) {
                insights.push(thresholdWarning);
            }
        }

        // Insight 3: VAT refund eligibility
        const vatRefund = await this.checkVATRefundEligibility(userId, currentMonth);
        if (vatRefund) {
            insights.push(vatRefund);
        }

        // Insight 4: Missing business registration
        const registrationCheck = await this.checkBusinessRegistration(userId);
        if (registrationCheck) {
            insights.push(registrationCheck);
        }

        // Insight 5: Upcoming tax deadlines
        const deadlines = await this.getUpcomingDeadlines(userId);
        insights.push(...deadlines);

        // Insight 6: Tax payment projection
        if (businessId) {
            const taxProjection = await this.projectTaxLiability(businessId, userId);
            if (taxProjection) {
                insights.push(taxProjection);
            }
        }

        // Insight 7: ATM fee overcharge analysis
        const atmInsight = await this.checkATMFeeOvercharges(userId, currentMonth);
        if (atmInsight) {
            insights.push(atmInsight);
        }

        // Sort by priority and potential savings
        return insights.sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];

            if (priorityDiff !== 0) return priorityDiff;

            // If same priority, sort by potential savings
            const savingA = a.potentialSaving || 0;
            const savingB = b.potentialSaving || 0;
            return savingB - savingA;
        });
    }

    /**
     * Check for ATM fee overcharges based on CBN limits
     */
    private async checkATMFeeOvercharges(userId: string, month: string): Promise<Insight | null> {
        try {
            // Get ATM charges for the month
            const { data: charges } = await supabase
                .from('bank_charges')
                .select('*')
                .eq('user_id', userId)
                .eq('category', 'atm_fee')
                .gte('detected_at', `${month}-01`)
                .lte('detected_at', `${month}-31`);

            if (!charges || charges.length === 0) return null;

            // Calculate totals
            const totalATMFees = charges.reduce((sum, c) => sum + (c.amount || 0), 0);
            
            // Check for overcharges in metadata
            const overcharges = charges.filter(c => {
                try {
                    const meta = typeof c.metadata === 'string' ? JSON.parse(c.metadata) : c.metadata;
                    return meta?.overcharge === true;
                } catch {
                    return false;
                }
            });

            const totalOvercharge = overcharges.reduce((sum, c) => {
                try {
                    const meta = typeof c.metadata === 'string' ? JSON.parse(c.metadata) : c.metadata;
                    return sum + (meta?.overchargeAmount || 0);
                } catch {
                    return sum;
                }
            }, 0);

            // High priority if overcharges detected
            if (totalOvercharge > 0) {
                return {
                    type: 'compliance',
                    priority: 'high',
                    title: `₦${this.formatCurrency(totalOvercharge)} ATM overcharge detected`,
                    description: `${overcharges.length} ATM transaction(s) exceeded CBN fee limits. ` +
                        `Total ATM fees: ₦${this.formatCurrency(totalATMFees)}, ` +
                        `of which ₦${this.formatCurrency(totalOvercharge)} are above the legal maximum.`,
                    action: 'Report to CBN or request refund from your bank',
                    potentialSaving: totalOvercharge,
                    metadata: {
                        total_atm_fees: totalATMFees,
                        overcharge_count: overcharges.length,
                        overcharge_amount: totalOvercharge,
                        regulation: 'CBN ATM Fee Circular - Effective March 1, 2026'
                    }
                };
            }

            // Low priority summary if significant ATM fees but no overcharges
            if (totalATMFees > 5000) {
                const taxSaving = totalATMFees * 0.30; // Potential deduction at 30% rate
                return {
                    type: 'tax_saving',
                    priority: 'low',
                    title: `ATM fees this month: ₦${this.formatCurrency(totalATMFees)}`,
                    description: `You paid ₦${this.formatCurrency(totalATMFees)} in ATM fees across ` +
                        `${charges.length} transaction(s). These are deductible business expenses.`,
                    action: 'Ensure these are claimed as business deductions',
                    potentialSaving: taxSaving,
                    metadata: {
                        total_atm_fees: totalATMFees,
                        transaction_count: charges.length
                    }
                };
            }

            return null;
        } catch (error) {
            console.error('[InsightsGenerator] ATM fee check error:', error);
            return null;
        }
    }

    /**
     * Find unclaimed tax deductions
     */
    private async findUnclaimedDeductions(userId: string, month: string): Promise<any | null> {
        // Get expenses without tax category or marked as non-deductible
        const { data: expenses } = await supabase
            .from('expenses')
            .select('*')
            .eq('user_id', userId)
            .gte('date', `${month}-01`)
            .lte('date', `${month}-31`)
            .or('category.is.null,category.eq.personal,category.eq.non_deductible');

        if (!expenses || expenses.length === 0) return null;

        // Analyze which expenses might be deductible
        const deductibleExpenses = expenses.filter(exp => {
            const desc = (exp.description || '').toLowerCase();

            // Keywords for deductible expenses
            const deductibleKeywords = [
                'office', 'rent', 'salary', 'internet', 'phone', 'advertising',
                'marketing', 'software', 'subscription', 'fuel', 'travel',
                'professional', 'training', 'insurance', 'supplies'
            ];

            return deductibleKeywords.some(kw => desc.includes(kw));
        });

        if (deductibleExpenses.length === 0) return null;

        const total = deductibleExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
        const potentialSaving = total * 0.30; // Assume 30% tax rate

        // Suggest categories based on descriptions
        const suggestedCategories = deductibleExpenses.map(exp => {
            const desc = (exp.description || '').toLowerCase();

            if (desc.includes('rent')) return 'rent';
            if (desc.includes('salary') || desc.includes('wages')) return 'salaries';
            if (desc.includes('internet') || desc.includes('phone')) return 'communications';
            if (desc.includes('marketing') || desc.includes('advertising')) return 'marketing';
            if (desc.includes('fuel') || desc.includes('travel')) return 'travel';

            return 'office_supplies';
        });

        return {
            count: deductibleExpenses.length,
            total,
            potentialSaving,
            expenseIds: deductibleExpenses.map(e => e.id),
            suggestedCategories: [...new Set(suggestedCategories)]
        };
    }

    /**
     * Check small company threshold proximity
     */
    private async checkSmallCompanyThreshold(businessId: string): Promise<Insight | null> {
        const metrics = await businessClassificationService.calculateMetrics(businessId);
        const classification = await businessClassificationService.classify(businessId);

        // Already exceeds threshold
        if (metrics.turnover > 50_000_000) {
            return {
                type: 'threshold_warning',
                priority: 'medium',
                title: 'You've exceeded the small company threshold',
                description: `Your turnover is ₦${this.formatCurrency(metrics.turnover)}. You now pay 30% company tax instead of 0%.`,
                action: 'Consider tax planning strategies',
                potentialCost: (metrics.turnover - 50_000_000) * 0.30,
                metadata: { classification: 'large' }
            };
        }

        // Close to threshold (within 20%)
        const proximityPercentage = (metrics.turnover / 50_000_000) * 100;
        if (proximityPercentage >= 80) {
            const remaining = 50_000_000 - metrics.turnover;

            return {
                type: 'threshold_warning',
                priority: 'high',
                title: `You're ₦${this.formatCurrency(remaining)} from losing 0% tax`,
                description: `Your turnover is ₦${this.formatCurrency(metrics.turnover)} (${proximityPercentage.toFixed(0)}% of ₦50M threshold). Exceeding ₦50M means 30% tax on profits.`,
                action: 'Plan growth carefully or explore tax optimization',
                potentialCost: remaining * 0.30,
                metadata: { threshold: 50_000_000, current: metrics.turnover }
            };
        }

        return null;
    }

    /**
     * Check VAT refund eligibility
     */
    private async checkVATRefundEligibility(userId: string, month: string): Promise<Insight | null> {
        try {
            const reconciliation = await vatReconciliationService.getReconciliation(userId, month);

            if (!reconciliation) return null;

            // Check if in credit position for 3+ months
            if (reconciliation.net_vat < 0 && Math.abs(reconciliation.net_vat) > 500_000) {
                // Check previous months to confirm 3+ month trend
                const threeMonthsAgo = new Date();
                threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

                const { data: previousReconciliations } = await supabase
                    .from('vat_reconciliations')
                    .select('net_vat')
                    .eq('user_id', userId)
                    .gte('period', threeMonthsAgo.toISOString().substring(0, 7))
                    .lt('period', month);

                const allInCredit = previousReconciliations?.every(r => r.net_vat < 0) || false;

                if (allInCredit) {
                    return {
                        type: 'vat_refund',
                        priority: 'high',
                        title: `Request ₦${this.formatCurrency(Math.abs(reconciliation.net_vat))} VAT refund`,
                        description: `You've been in VAT credit for 3+ months. Section 156 of Tax Act 2025 allows refund requests after 3 consecutive months.`,
                        action: 'Submit VAT refund request to FIRS',
                        potentialSaving: Math.abs(reconciliation.net_vat),
                        metadata: {
                            months_in_credit: (previousReconciliations?.length || 0) + 1,
                            refund_amount: Math.abs(reconciliation.net_vat)
                        }
                    };
                }
            }
        } catch (error) {
            console.error('VAT refund check error:', error);
        }

        return null;
    }

    /**
     * Check business registration number
     */
    private async checkBusinessRegistration(userId: string): Promise<Insight | null> {
        const { data: businesses } = await supabase
            .from('businesses')
            .select('*')
            .eq('user_id', userId)
            .is('tin', null);

        if (businesses && businesses.length > 0) {
            return {
                type: 'compliance',
                priority: 'high',
                title: 'Add your business TIN',
                description: `Tax Act 2025 requires TIN on invoices (Section 153). ${businesses.length} business(es) missing TIN.`,
                action: 'Add TIN registration number',
                metadata: {
                    business_count: businesses.length,
                    business_ids: businesses.map(b => b.id)
                }
            };
        }

        return null;
    }

    /**
     * Get upcoming tax deadlines
     */
    private async getUpcomingDeadlines(userId: string): Promise<Insight[]> {
        const insights: Insight[] = [];
        const today = new Date();
        const dayOfMonth = today.getDate();

        // VAT filing deadline approaching (14th)
        if (dayOfMonth >= 10 && dayOfMonth <= 13) {
            insights.push({
                type: 'compliance',
                priority: 'high',
                title: 'VAT filing due in ' + (14 - dayOfMonth) + ' days',
                description: 'Monthly VAT returns must be filed by the 14th day of the month (Section 155).',
                action: 'Review and file VAT return',
                deadline: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-14`
            });
        }

        return insights;
    }

    /**
     * Project next month's tax liability
     */
    private async projectTaxLiability(businessId: string, userId: string): Promise<Insight | null> {
        const currentMonth = new Date().toISOString().substring(0, 7);

        // Get this month's revenue
        const { data: invoices } = await supabase
            .from('invoices')
            .select('total')
            .eq('business_id', businessId)
            .gte('date', `${currentMonth}-01`)
            .lte('date', `${currentMonth}-31`);

        if (!invoices || invoices.length === 0) return null;

        const monthlyRevenue = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

        // Estimate tax (assuming 20% profit margin, 30% tax rate)
        const estimatedProfit = monthlyRevenue * 0.20;
        const estimatedTax = estimatedProfit * 0.30;

        if (estimatedTax > 100_000) {
            return {
                type: 'cash_flow',
                priority: 'medium',
                title: `Estimated tax: ₦${this.formatCurrency(estimatedTax)} next month`,
                description: `Based on ₦${this.formatCurrency(monthlyRevenue)} revenue this month (assuming 20% profit margin).`,
                action: 'Set aside funds for tax payment',
                potentialCost: estimatedTax,
                metadata: {
                    revenue: monthlyRevenue,
                    estimated_profit: estimatedProfit
                }
            };
        }

        return null;
    }

    /**
     * Save insights to database
     */
    async saveInsights(userId: string, insights: Insight[]): Promise<void> {
        const month = new Date().toISOString().substring(0, 7);

        // Delete old insights for this month
        await supabase
            .from('user_insights')
            .delete()
            .eq('user_id', userId)
            .eq('month', month);

        // Save new insights
        const insightsToSave = insights.map(insight => ({
            user_id: userId,
            month,
            type: insight.type,
            priority: insight.priority,
            title: insight.title,
            description: insight.description,
            action: insight.action,
            potential_saving: insight.potentialSaving,
            potential_cost: insight.potentialCost,
            deadline: insight.deadline,
            metadata: insight.metadata,
            is_read: false
        }));

        if (insightsToSave.length > 0) {
            await supabase.from('user_insights').insert(insightsToSave);
        }
    }

    /**
     * Get saved insights for user
     */
    async getUserInsights(userId: string, month?: string): Promise<Insight[]> {
        const targetMonth = month || new Date().toISOString().substring(0, 7);

        const { data } = await supabase
            .from('user_insights')
            .select('*')
            .eq('user_id', userId)
            .eq('month', targetMonth)
            .order('priority', { ascending: true })
            .order('potential_saving', { ascending: false });

        return data || [];
    }

    /**
     * Mark insight as read
     */
    async markAsRead(insightId: string): Promise<void> {
        await supabase
            .from('user_insights')
            .update({ is_read: true })
            .eq('id', insightId);
    }

    /**
     * Format currency
     */
    private formatCurrency(amount: number): string {
        return amount.toLocaleString('en-NG', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    }
}

export const insightsGeneratorService = new InsightsGeneratorService();
