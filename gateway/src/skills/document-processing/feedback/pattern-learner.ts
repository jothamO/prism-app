/**
 * Pattern Learner
 * Enhanced ML learning algorithm with weighted confidence
 * Based on accuracy, recency, and sample size
 */

import { supabase } from '../../../config';
import { logger } from '../../../utils/logger';

export interface PatternUpdate {
    businessId: string;
    userId: string;
    description: string;
    category: string;
    amount?: number;
    isCorrection: boolean; // Was this a correction of wrong classification?
}

export interface LearnedPattern {
    id: string;
    itemPattern: string;           // DB: item_pattern
    category: string;
    confidence: number;
    occurrences: number;           // DB: occurrence_count
    correctPredictions: number;    // DB: correct_predictions
    lastSeenAt: string;            // DB: last_used_at
    averageAmount?: number;        // Calculated: total_amount / occurrence_count
}

export class PatternLearner {
    /**
     * Update or create a pattern from user feedback
     */
    async updatePattern(update: PatternUpdate): Promise<void> {
        try {
            const normalizedPattern = this.normalizeDescription(update.description);

            // Find existing pattern
            const existing = await this.findPattern(update.businessId, normalizedPattern, update.category);

            if (existing) {
                // Update existing pattern
                await this.updateExistingPattern(existing, update);
            } else {
                // Create new pattern
                await this.createNewPattern(update, normalizedPattern);
            }

            logger.info('[PatternLearner] Pattern updated', {
                pattern: normalizedPattern,
                category: update.category,
                isNew: !existing
            });
        } catch (error) {
            logger.error('[PatternLearner] Update failed:', error);
            throw error;
        }
    }

    /**
     * Find existing pattern
     */
    private async findPattern(
        businessId: string,
        pattern: string,
        category: string
    ): Promise<LearnedPattern | null> {
        const { data, error } = await supabase
            .from('business_classification_patterns')
            .select('*')
            .eq('business_id', businessId)
            .eq('item_pattern', pattern)
            .eq('category', category)
            .single();

        if (error && error.code !== 'PGRST116') { // Not "no rows" error
            throw error;
        }

        if (!data) return null;

        // Map DB columns to interface
        return {
            id: data.id,
            itemPattern: data.item_pattern,
            category: data.category,
            confidence: data.confidence,
            occurrences: data.occurrence_count,
            correctPredictions: data.correct_predictions,
            lastSeenAt: data.last_used_at,
            averageAmount: data.occurrence_count > 0 
                ? data.total_amount / data.occurrence_count 
                : undefined
        };
    }

    /**
     * Update existing pattern with new feedback
     */
    private async updateExistingPattern(
        existing: LearnedPattern,
        update: PatternUpdate
    ): Promise<void> {
        // Calculate new statistics
        const newOccurrences = existing.occurrences + 1;
        const newCorrectPredictions = existing.correctPredictions + (update.isCorrection ? 0 : 1);

        // Calculate weighted confidence
        const newConfidence = this.calculateWeightedConfidence({
            occurrences: newOccurrences,
            correctPredictions: newCorrectPredictions,
            lastSeenAt: existing.lastSeenAt,
            currentConfidence: existing.confidence
        });

        // Calculate new total amount
        const existingTotal = (existing.averageAmount || 0) * existing.occurrences;
        const newTotal = update.amount 
            ? existingTotal + update.amount
            : existingTotal;

        // Update pattern using correct DB column names
        const { error } = await supabase
            .from('business_classification_patterns')
            .update({
                occurrence_count: newOccurrences,
                correct_predictions: newCorrectPredictions,
                confidence: newConfidence,
                total_amount: newTotal,
                last_used_at: new Date().toISOString()
            })
            .eq('id', existing.id);

        if (error) throw error;
    }

    /**
     * Create new pattern
     */
    private async createNewPattern(
        update: PatternUpdate,
        normalizedPattern: string
    ): Promise<void> {
        const { error } = await supabase
            .from('business_classification_patterns')
            .insert({
                business_id: update.businessId,
                item_pattern: normalizedPattern,
                category: update.category,
                confidence: 0.70, // Initial confidence
                occurrence_count: 1,
                correct_predictions: update.isCorrection ? 0 : 1,
                total_amount: update.amount || 0,
                last_used_at: new Date().toISOString()
            });

        if (error) throw error;
    }

    /**
     * Calculate weighted confidence score
     * Factors: accuracy rate, sample size, recency
     */
    private calculateWeightedConfidence(params: {
        occurrences: number;
        correctPredictions: number;
        lastSeenAt: string;
        currentConfidence: number;
    }): number {
        const { occurrences, correctPredictions, lastSeenAt } = params;

        // 1. Accuracy rate (70% weight)
        const accuracyRate = correctPredictions / occurrences;

        // 2. Sample confidence (20% weight)
        // More samples = more confidence, caps at 10 samples
        const sampleFactor = Math.min(occurrences / 10, 1.0);

        // 3. Recency factor (10% weight)
        const recencyScore = this.calculateRecencyScore(lastSeenAt);

        // Weighted combination
        const confidence =
            accuracyRate * 0.7 +
            sampleFactor * 0.2 +
            recencyScore * 0.1;

        // Clamp between 0.50 and 0.99 (never 100% to allow AI override)
        return Math.max(0.50, Math.min(confidence, 0.99));
    }

    /**
     * Calculate recency score (newer = higher)
     */
    private calculateRecencyScore(lastSeenAt: string): number {
        const daysSince = (Date.now() - new Date(lastSeenAt).getTime()) / (1000 * 60 * 60 * 24);

        if (daysSince < 7) return 1.0;      // Last week
        if (daysSince < 30) return 0.8;     // Last month
        if (daysSince < 90) return 0.6;     // Last quarter
        if (daysSince < 180) return 0.4;    // Last 6 months
        return 0.2;                          // Older patterns decay
    }

    /**
     * Update moving average for amount
     */
    private updateMovingAverage(
        currentAvg: number | null | undefined,
        newValue: number,
        count: number
    ): number {
        if (!currentAvg) return newValue;

        // Exponential moving average
        return ((currentAvg * count) + newValue) / (count + 1);
    }

    /**
     * Normalize description for pattern matching
     * Removes amounts, dates, and extra spaces
     */
    private normalizeDescription(description: string): string {
        return description
            .toLowerCase()
            .replace(/₦?\d+([,\.]\d+)*/g, '')  // Remove amounts
            .replace(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/g, '') // Remove dates
            .replace(/\s+/g, ' ') // Normalize spaces
            .trim();
    }

    /**
     * Get top patterns for a business
     */
    async getTopPatterns(businessId: string, limit: number = 10): Promise<LearnedPattern[]> {
        const { data, error } = await supabase
            .from('business_classification_patterns')
            .select('*')
            .eq('business_id', businessId)
            .order('confidence', { ascending: false })
            .order('occurrence_count', { ascending: false })
            .limit(limit);

        if (error) throw error;

        // Map DB columns to interface
        return (data || []).map(row => ({
            id: row.id,
            itemPattern: row.item_pattern,
            category: row.category,
            confidence: row.confidence,
            occurrences: row.occurrence_count,
            correctPredictions: row.correct_predictions,
            lastSeenAt: row.last_used_at,
            averageAmount: row.occurrence_count > 0 
                ? row.total_amount / row.occurrence_count 
                : undefined
        }));
    }
}
