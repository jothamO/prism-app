/**
 * Business Pattern Classifier
 * Uses learned patterns from business_classification_patterns table
 * Tier 1: Fastest, most accurate for known patterns
 */

import { supabase } from '../../../config';
import { logger } from '../../../utils/logger';

export interface ClassificationResult {
    classification: string;
    category?: string;
    confidence: number;
    source: 'business_pattern' | 'ai' | 'rule_based' | 'hybrid';
    reasoning?: string;
}

export class BusinessPatternClassifier {
    private readonly CONFIDENCE_THRESHOLD = 0.85;

    /**
     * Classify transaction using learned business patterns
     */
    async classify(data: {
        businessId?: string;
        description: string;
        amount?: number;
    }): Promise<ClassificationResult | null> {
        if (!data.businessId) {
            return null; // No patterns available without business ID
        }

        try {
            // Find matching pattern
            const pattern = await this.findPattern(data.businessId, data.description);

            if (!pattern) {
                return null;
            }

            // Check confidence threshold
            if (pattern.confidence < this.CONFIDENCE_THRESHOLD) {
                logger.debug('[BusinessPattern] Pattern found but low confidence', {
                    pattern: pattern.item_pattern,
                    confidence: pattern.confidence
                });
                return null;
            }

            // Record pattern usage (for analytics)
            await this.recordUsage(pattern.id);

            logger.info('[BusinessPattern] Pattern matched', {
                pattern: pattern.item_pattern,
                category: pattern.category,
                confidence: pattern.confidence
            });

            return {
                classification: this.extractClassification(pattern.category),
                category: pattern.category,
                confidence: pattern.confidence,
                source: 'business_pattern',
                reasoning: `Learned pattern: "${pattern.item_pattern}" → ${pattern.category} (${pattern.occurrences} times)`
            };
        } catch (error) {
            logger.error('[BusinessPattern] Classification error:', error);
            return null;
        }
    }

    /**
     * Find matching business pattern
     */
    private async findPattern(businessId: string, description: string): Promise<any> {
        const normalizedDesc = description.toLowerCase().trim();

        // Try exact match first
        const { data: exactMatch } = await supabase
            .from('business_classification_patterns')
            .select('*')
            .eq('business_id', businessId)
            .eq('item_pattern', normalizedDesc)
            .order('confidence', { ascending: false })
            .limit(1)
            .single();

        if (exactMatch) {
            return exactMatch;
        }

        // Try fuzzy match using trigram similarity
        const { data: fuzzyMatches } = await supabase
            .from('business_classification_patterns')
            .select('*')
            .eq('business_id', businessId)
            .order('confidence', { ascending: false })
            .limit(10);

        if (!fuzzyMatches || fuzzyMatches.length === 0) {
            return null;
        }

        // Calculate similarity scores
        const matches = fuzzyMatches.map(pattern => ({
            ...pattern,
            similarity: this.calculateSimilarity(normalizedDesc, pattern.item_pattern)
        }));

        // Find best match (similarity > 0.8)
        const bestMatch = matches
            .filter(m => m.similarity > 0.8)
            .sort((a, b) => b.similarity - a.similarity)[0];

        return bestMatch || null;
    }

    /**
     * Calculate string similarity (simple Levenshtein-based)
     */
    private calculateSimilarity(str1: string, str2: string): number {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;

        if (longer.length === 0) {
            return 1.0;
        }

        // Simple substring matching for now
        // In production, use proper Levenshtein distance
        if (longer.includes(shorter)) {
            return 0.9;
        }

        const words1 = str1.split(/\s+/);
        const words2 = str2.split(/\s+/);
        const commonWords = words1.filter(w => words2.includes(w));

        return commonWords.length / Math.max(words1.length, words2.length);
    }

    /**
     * Extract classification from category
     * e.g., "marketing_expense" → "expense"
     */
    private extractClassification(category: string): string {
        const classifications = ['sale', 'expense', 'capital', 'loan', 'personal', 'salary'];

        for (const classification of classifications) {
            if (category.toLowerCase().includes(classification)) {
                return classification;
            }
        }

        // Default: check if it's an expense category
        if (category.includes('_expense') || category.includes('expense_')) {
            return 'expense';
        }

        return category; // Return as-is if unknown
    }

    /**
     * Record pattern usage for analytics
     */
    private async recordUsage(patternId: string): Promise<void> {
        try {
            await supabase.rpc('increment_pattern_usage', { pattern_id: patternId });
        } catch (error) {
            // Non-critical, don't throw
            logger.warn('[BusinessPattern] Failed to record usage:', error);
        }
    }
}
