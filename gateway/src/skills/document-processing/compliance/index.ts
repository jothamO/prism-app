/**
 * Compliance Checker
 * Nigerian tax compliance checks: Section 191, mixed accounts, VAT thresholds
 */

import { logger } from '../../../utils/logger';
import { supabase } from '../../../config';

export interface ComplianceFlag {
    type: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
    action: string;
}

export class ComplianceChecker {
    /**
     * Check transaction for compliance issues
     */
    async check(
        txn: any,
        context: { userId: string; businessId?: string; statementId: string }
    ): Promise<ComplianceFlag[]> {
        const flags: ComplianceFlag[] = [];

        // Check Section 191 (related party transactions > ₦5M)
        const section191Flag = await this.checkSection191(txn);
        if (section191Flag) flags.push(section191Flag);

        // Check foreign currency reporting
        const foreignCurrencyFlag = this.checkForeignCurrency(txn);
        if (foreignCurrencyFlag) flags.push(foreignCurrencyFlag);

        // Check mixed account (personal vs business)
        if (context.businessId) {
            const mixedAccountFlag = await this.checkMixedAccount(
                context.statementId,
                context.businessId
            );
            if (mixedAccountFlag) flags.push(mixedAccountFlag);
        }

        // Check VAT threshold proximity
        if (context.businessId) {
            const vatThresholdFlag = await this.checkVATThreshold(context.businessId);
            if (vatThresholdFlag) flags.push(vatThresholdFlag);
        }

        return flags;
    }

    /**
     * Check for Section 191 compliance (related party > ₦5M)
     */
    private async checkSection191(txn: any): Promise<ComplianceFlag | null> {
        const amount = txn.credit || txn.debit || 0;
        const description = (txn.description || '').toLowerCase();

        // Section 191 threshold
        if (amount < 5_000_000) {
            return null;
        }

        // Check for related party keywords
        const RELATED_PARTY_KEYWORDS = [
            /director/i,
            /shareholder/i,
            /owner/i,
            /family/i,
            /related ?party/i,
            /connected ?person/i
        ];

        const isRelatedParty = RELATED_PARTY_KEYWORDS.some(pattern =>
            pattern.test(description)
        );

        if (!isRelatedParty) {
            return null;
        }

        return {
            type: 'section_191_risk',
            severity: 'high',
            message: `Related party transaction > ₦5M detected (₦${amount.toLocaleString()})`,
            action: 'Requires FIRS pre-approval under Section 191. Document relationship and business purpose.'
        };
    }

    /**
     * Check for foreign currency transactions
     */
    private checkForeignCurrency(txn: any): ComplianceFlag | null {
        const description = (txn.description || '').toLowerCase();
        const amount = txn.credit || txn.debit || 0;

        // Check for currency indicators
        const CURRENCY_PATTERNS = [
            /usd|dollar|\$/i,
            /gbp|pound|£/i,
            /eur|euro|€/i
        ];

        const hasForeignCurrency = CURRENCY_PATTERNS.some(pattern =>
            pattern.test(description)
        );

        if (!hasForeignCurrency) {
            return null;
        }

        return {
            type: 'foreign_currency',
            severity: amount > 10_000_000 ? 'high' : 'medium',
            message: 'Foreign currency transaction detected',
            action: 'Obtain CBN official exchange rate. Report in NGN equivalent. Consider Section 191 if > ₦10M.'
        };
    }

    /**
     * Check for mixed account usage (personal + business)
     */
    private async checkMixedAccount(
        statementId: string,
        businessId: string
    ): Promise<ComplianceFlag | null> {
        try {
            // Get all transactions from this statement
            const { data: transactions } = await supabase
                .from('bank_transactions')
                .select('classification')
                .eq('statement_id', statementId);

            if (!transactions || transactions.length === 0) {
                return null;
            }

            // Count personal transactions
            const personalCount = transactions.filter(
                (t: { classification: string | null }) => t.classification === 'personal'
            ).length;

            const personalPercentage = (personalCount / transactions.length) * 100;

            // Flag if > 20% personal
            if (personalPercentage > 20) {
                return {
                    type: 'mixed_account',
                    severity: 'low',
                    message: `${personalPercentage.toFixed(0)}% of transactions are personal`,
                    action: 'Consider separating business and personal accounts for clearer record-keeping and tax compliance.'
                };
            }

            return null;
        } catch (error) {
            logger.warn('[Compliance] Mixed account check failed:', error);
            return null;
        }
    }

    /**
     * Check proximity to VAT registration threshold (₦25M turnover)
     */
    private async checkVATThreshold(businessId: string): Promise<ComplianceFlag | null> {
        try {
            // Get last 12 months revenue
            const twelveMonthsAgo = new Date();
            twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

            const { data: transactions } = await supabase
                .from('bank_transactions')
                .select('credit')
                .eq('business_id', businessId)
                .eq('classification', 'sale')
                .gte('transaction_date', twelveMonthsAgo.toISOString());

            if (!transactions) {
                return null;
            }

            const annualRevenue = transactions.reduce(
                (sum: number, t: { credit: number | null }) => sum + (t.credit || 0),
                0
            );

            // VAT registration threshold: ₦25M
            const threshold = 25_000_000;
            const proximityPercentage = (annualRevenue / threshold) * 100;

            // Flag if > 70% of threshold (₦17.5M)
            if (proximityPercentage > 70) {
                const monthsToThreshold = this.estimateMonthsToThreshold(
                    annualRevenue,
                    threshold
                );

                return {
                    type: 'vat_threshold_proximity',
                    severity: proximityPercentage > 90 ? 'high' : 'medium',
                    message: `Annual revenue: ₦${annualRevenue.toLocaleString()} (${proximityPercentage.toFixed(0)}% of VAT threshold)`,
                    action: `You're approaching the ₦25M VAT registration threshold. Estimated ${monthsToThreshold} months until required registration. Plan ahead.`
                };
            }

            return null;
        } catch (error) {
            logger.warn('[Compliance] VAT threshold check failed:', error);
            return null;
        }
    }

    /**
     * Estimate months until VAT threshold breach
     */
    private estimateMonthsToThreshold(
        currentRevenue: number,
        threshold: number
    ): number {
        const remaining = threshold - currentRevenue;
        const monthlyAverage = currentRevenue / 12;

        if (monthlyAverage === 0) {
            return 999; // Never
        }

        return Math.ceil(remaining / monthlyAverage);
    }
}
