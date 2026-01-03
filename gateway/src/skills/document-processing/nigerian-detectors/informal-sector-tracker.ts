/**
 * Informal Sector Tracker
 * Monitors unregistered businesses approaching VAT/CAC registration thresholds
 * Nigerian Tax Act 2025 - ₦25M turnover requires VAT registration
 */

import { logger } from '../../../utils/logger';
import { supabase } from '../../../config';

export interface InformalSectorStatus {
    isRegistered: boolean;
    annualRevenue: number;
    distanceToThreshold: number;
    needsRegistration: boolean;
    alerts: string[];
}

export class InformalSectorTracker {
    // Nigerian thresholds
    private readonly VAT_REGISTRATION_THRESHOLD = 25_000_000; // ₦25M
    private readonly WARNING_THRESHOLD = 20_000_000; // ₦20M (80% of limit)
    private readonly CRITICAL_THRESHOLD = 23_000_000; // ₦23M (92% of limit)

    /**
     * Check informal sector compliance for a business
     */
    async checkStatus(businessId: string): Promise<InformalSectorStatus> {
        try {
            // Get business registration status
            const { data: business } = await supabase
                .from('businesses')
                .select('informal_business, cac_registration_number, created_at')
                .eq('id', businessId)
                .single();

            if (!business) {
                throw new Error('Business not found');
            }

            const isRegistered = !business.informal_business && !!business.cac_registration_number;

            // Calculate annual revenue (last 12 months)
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

            const { data: transactions } = await supabase
                .from('bank_transactions')
                .select('credit')
                .eq('business_id', businessId)
                .eq('classification', 'sale')
                .gte('transaction_date', oneYearAgo.toISOString());

            const annualRevenue = transactions
                ? transactions.reduce((sum, t) => sum + (t.credit || 0), 0)
                : 0;

            const distanceToThreshold = this.VAT_REGISTRATION_THRESHOLD - annualRevenue;
            const needsRegistration = annualRevenue >= this.VAT_REGISTRATION_THRESHOLD;

            // Generate alerts
            const alerts = this.generateAlerts(
                annualRevenue,
                isRegistered,
                business.created_at
            );

            logger.info('[InformalSectorTracker] Status checked', {
                businessId,
                isRegistered,
                annualRevenue,
                needsRegistration
            });

            return {
                isRegistered,
                annualRevenue,
                distanceToThreshold,
                needsRegistration,
                alerts
            };
        } catch (error) {
            logger.error('[InformalSectorTracker] Status check failed:', error);
            throw error;
        }
    }

    /**
     * Generate registration alerts based on revenue
     */
    private generateAlerts(
        annualRevenue: number,
        isRegistered: boolean,
        businessCreatedAt: string
    ): string[] {
        const alerts: string[] = [];

        // Already exceeded threshold
        if (annualRevenue >= this.VAT_REGISTRATION_THRESHOLD && !isRegistered) {
            const excess = annualRevenue - this.VAT_REGISTRATION_THRESHOLD;
            alerts.push(
                `🚨 URGENT: Your turnover (₦${(annualRevenue / 1_000_000).toFixed(1)}M) ` +
                `exceeds ₦25M threshold by ₦${(excess / 1_000_000).toFixed(1)}M. ` +
                `CAC registration and VAT registration are MANDATORY.`
            );
        }

        // Critical threshold (92%)
        else if (annualRevenue >= this.CRITICAL_THRESHOLD && !isRegistered) {
            const remaining = this.VAT_REGISTRATION_THRESHOLD - annualRevenue;
            alerts.push(
                `⚠️ CRITICAL: Your turnover (₦${(annualRevenue / 1_000_000).toFixed(1)}M) ` +
                `is ₦${(remaining / 1_000_000).toFixed(1)}M away from ₦25M threshold. ` +
                `Start CAC registration process NOW to avoid penalties.`
            );
        }

        // Warning threshold (80%)
        else if (annualRevenue >= this.WARNING_THRESHOLD && !isRegistered) {
            const remaining = this.VAT_REGISTRATION_THRESHOLD - annualRevenue;
            alerts.push(
                `💡 NOTICE: Your turnover (₦${(annualRevenue / 1_000_000).toFixed(1)}M) ` +
                `is ₦${(remaining / 1_000_000).toFixed(1)}M away from ₦25M threshold. ` +
                `Consider registering with CAC soon.`
            );
        }

        // Business > 6 months old, making good revenue, still informal
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const businessAge = new Date(businessCreatedAt);

        if (
            businessAge < sixMonthsAgo &&
            annualRevenue >= 5_000_000 &&
            annualRevenue < this.WARNING_THRESHOLD &&
            !isRegistered
        ) {
            alerts.push(
                `📋 TIP: Your business is growing (₦${(annualRevenue / 1_000_000).toFixed(1)}M turnover). ` +
                `CAC registration provides credibility and access to business banking.`
            );
        }

        return alerts;
    }

    /**
     * Update business registration status
     */
    async updateRegistrationStatus(
        businessId: string,
        cacNumber: string
    ): Promise<void> {
        await supabase
            .from('businesses')
            .update({
                informal_business: false,
                cac_registration_number: cacNumber,
                updated_at: new Date().toISOString()
            })
            .eq('id', businessId);

        logger.info('[InformalSectorTracker] Registration updated', {
            businessId,
            cacNumber
        });
    }

    /**
     * Get monthly revenue projection (for forecasting)
     */
    async getMonthlyProjection(businessId: string): Promise<{
        currentMonthRevenue: number;
        projected12MonthRevenue: number;
        monthsToThreshold: number | null;
    }> {
        // Get last 3 months average
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const { data: recentTransactions } = await supabase
            .from('bank_transactions')
            .select('credit, transaction_date')
            .eq('business_id', businessId)
            .eq('classification', 'sale')
            .gte('transaction_date', threeMonthsAgo.toISOString());

        if (!recentTransactions || recentTransactions.length === 0) {
            return {
                currentMonthRevenue: 0,
                projected12MonthRevenue: 0,
                monthsToThreshold: null
            };
        }

        const totalRevenue = recentTransactions.reduce((sum, t) => sum + (t.credit || 0), 0);
        const monthlyAverage = totalRevenue / 3;
        const projected12Month = monthlyAverage * 12;

        // Calculate months to reach threshold
        let monthsToThreshold: number | null = null;
        if (monthlyAverage > 0 && projected12Month < this.VAT_REGISTRATION_THRESHOLD) {
            const remaining = this.VAT_REGISTRATION_THRESHOLD - projected12Month;
            monthsToThreshold = Math.ceil(remaining / monthlyAverage);
        }

        return {
            currentMonthRevenue: monthlyAverage,
            projected12MonthRevenue: projected12Month,
            monthsToThreshold
        };
    }
}
