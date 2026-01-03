/**
 * Accuracy Tracker
 * Measures classification accuracy and learning rate over time
 */

import { supabase } from '../../../config';
import { logger } from '../../../utils/logger';

export interface AccuracyMetrics {
    statementId: string;
    totalTransactions: number;
    reviewedTransactions: number;
    correctClassifications: number;
    accuracy: number;
    reviewRate: number;
}

export interface LearningMetrics {
    businessId: string;
    periodMonths: number;
    currentAccuracy: number;
    previousAccuracy: number;
    improvementRate: number;
    patternMatchRate: number;
    totalPatterns: number;
}

export class AccuracyTracker {
    /**
     * Calculate accuracy for a specific statement
     */
    async calculateStatementAccuracy(statementId: string): Promise<AccuracyMetrics> {
        const { data: transactions, error } = await supabase
            .from('bank_transactions')
            .select('classification, user_classification, user_reviewed, user_correction')
            .eq('statement_id', statementId);

        if (error) throw error;
        if (!transactions || transactions.length === 0) {
            return {
                statementId,
                totalTransactions: 0,
                reviewedTransactions: 0,
                correctClassifications: 0,
                accuracy: 0,
                reviewRate: 0
            };
        }

        const reviewed = transactions.filter(t => t.user_reviewed);
        const correct = reviewed.filter(t =>
            !t.user_correction && t.classification === t.user_classification
        );

        return {
            statementId,
            totalTransactions: transactions.length,
            reviewedTransactions: reviewed.length,
            correctClassifications: correct.length,
            accuracy: reviewed.length > 0 ? correct.length / reviewed.length : 0,
            reviewRate: reviewed.length / transactions.length
        };
    }

    /**
     * Calculate learning rate (improvement over time)
     */
    async getLearningRate(
        businessId: string,
        periodMonths: number = 3
    ): Promise<LearningMetrics> {
        try {
            const now = new Date();
            const midpoint = new Date(now);
            midpoint.setMonth(midpoint.getMonth() - Math.floor(periodMonths / 2));

            const startDate = new Date(now);
            startDate.setMonth(startDate.getMonth() - periodMonths);

            // Get accuracy for recent period (last half)
            const recentAccuracy = await this.getAccuracyForPeriod(
                businessId,
                midpoint,
                now
            );

            // Get accuracy for previous period (first half)
            const previousAccuracy = await this.getAccuracyForPeriod(
                businessId,
                startDate,
                midpoint
            );

            // Get pattern match rate
            const patternMatchRate = await this.getPatternMatchRate(businessId);

            // Get total learned patterns
            const { count: totalPatterns } = await supabase
                .from('business_classification_patterns')
                .select('id', { count: 'exact', head: true })
                .eq('business_id', businessId);

            // Calculate improvement
            const improvementRate = previousAccuracy > 0
                ? (recentAccuracy - previousAccuracy) / previousAccuracy
                : 0;

            return {
                businessId,
                periodMonths,
                currentAccuracy: recentAccuracy,
                previousAccuracy,
                improvementRate,
                patternMatchRate,
                totalPatterns: totalPatterns || 0
            };
        } catch (error) {
            logger.error('[AccuracyTracker] Learning rate calculation failed:', error);
            throw error;
        }
    }

    /**
     * Get accuracy for a specific time period
     */
    private async getAccuracyForPeriod(
        businessId: string,
        startDate: Date,
        endDate: Date
    ): Promise<number> {
        const { data: transactions, error } = await supabase
            .from('bank_transactions')
            .select('classification, user_classification, user_reviewed')
            .eq('business_id', businessId)
            .eq('user_reviewed', true)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());

        if (error) throw error;
        if (!transactions || transactions.length === 0) return 0;

        const correct = transactions.filter(t =>
            t.classification === t.user_classification
        ).length;

        return correct / transactions.length;
    }

    /**
     * Calculate pattern match rate (% of transactions using learned patterns)
     */
    private async getPatternMatchRate(businessId: string): Promise<number> {
        const { data: transactions, error } = await supabase
            .from('bank_transactions')
            .select('classification_source')
            .eq('business_id', businessId);

        if (error) throw error;
        if (!transactions || transactions.length === 0) return 0;

        const patternMatches = transactions.filter(t =>
            t.classification_source === 'business_pattern'
        ).length;

        return patternMatches / transactions.length;
    }

    /**
     * Get accuracy history for charting
     */
    async getAccuracyHistory(
        businessId: string,
        months: number = 6
    ): Promise<Array<{ month: string; accuracy: number }>> {
        const history: Array<{ month: string; accuracy: number }> = [];
        const now = new Date();

        for (let i = 0; i < months; i++) {
            const endDate = new Date(now);
            endDate.setMonth(endDate.getMonth() - i);

            const startDate = new Date(endDate);
            startDate.setMonth(startDate.getMonth() - 1);

            const accuracy = await this.getAccuracyForPeriod(businessId, startDate, endDate);

            history.unshift({
                month: endDate.toISOString().substring(0, 7), // YYYY-MM
                accuracy
            });
        }

        return history;
    }

    /**
     * Get classification source breakdown
     */
    async getSourceBreakdown(businessId: string): Promise<Record<string, number>> {
        const { data: transactions, error } = await supabase
            .from('bank_transactions')
            .select('classification_source')
            .eq('business_id', businessId);

        if (error) throw error;
        if (!transactions) return {};

        const breakdown: Record<string, number> = {};

        for (const txn of transactions) {
            const source = txn.classification_source || 'unknown';
            breakdown[source] = (breakdown[source] || 0) + 1;
        }

        return breakdown;
    }
}
