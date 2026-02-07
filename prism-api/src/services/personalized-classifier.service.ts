/**
 * Personalized Classifier Service
 * Phase 5: Automated Learning Pipeline
 * 
 * Uses business-specific patterns learned from user corrections
 * Falls back to AI if no pattern match
 * 
 * Enhanced with Nigerian transaction detection
 */

import { supabase } from '../config/database';
import { classifierService, EnhancedClassificationResult } from './classifier.service';
import { nigerianTransactionService, NigerianFlags, TaxImplications } from './nigerian-transaction.service';

export interface Classification {
    classification: string;
    category?: string;
    confidence: number;
    source: 'business_pattern' | 'ai' | 'hybrid' | 'rule_based';
    reasoning?: string;
    needsConfirmation?: boolean;
    nigerianFlags?: NigerianFlags;
    taxImplications?: TaxImplications;
    transactionType?: string;
}

export class PersonalizedClassifierService {
    /**
     * Classify with business-specific patterns FIRST, then AI fallback
     * 
     * Tier 1: Business patterns (learned from user, instant, 100% free)
     * Tier 2: AI classifier (Claude/OpenAI)
     */
    async classify(data: {
        businessId?: string;
        userId?: string;
        description: string;
        amount?: number;
        isCredit?: boolean;
        metadata?: any;
    }): Promise<Classification> {
        // Get Nigerian-specific context upfront
        const nigerianContext = nigerianTransactionService.getEnhancedContext(
            data.description,
            data.isCredit ?? false,
            data.amount
        );

        // Step 1: Try business-specific patterns (if business ID provided)
        if (data.businessId) {
            const businessPattern = await this.findBusinessPattern(
                data.businessId,
                data.description,
                nigerianContext.nigerianFlags
            );

            // High confidence pattern = use it!
            if (businessPattern && businessPattern.confidence > 0.80) {
                return {
                    classification: businessPattern.category,
                    category: businessPattern.category,
                    confidence: businessPattern.confidence,
                    source: 'business_pattern',
                    reasoning: `Matches your ${businessPattern.occurrences}x pattern: "${businessPattern.item_pattern}"`,
                    needsConfirmation: (data.amount && data.amount > 500_000) ? true : undefined,
                    nigerianFlags: nigerianContext.nigerianFlags,
                    taxImplications: nigerianContext.taxImplications,
                    transactionType: nigerianContext.transactionTypeDescription
                };
            }

            // Medium confidence pattern = try to boost with AI
            if (businessPattern && businessPattern.confidence > 0.50) {
                const aiClassification = await this.callAIClassifier(data);

                // AI agrees with business pattern = boost confidence
                const aiCat = aiClassification.classification || aiClassification.category;
                if (aiCat === businessPattern.category) {
                    return {
                        ...aiClassification,
                        confidence: Math.min(aiClassification.confidence + 0.20, 0.99),
                        source: 'hybrid',
                        reasoning: `AI + your pattern agree: "${businessPattern.item_pattern}" → ${businessPattern.category}`,
                        nigerianFlags: nigerianContext.nigerianFlags,
                        taxImplications: nigerianContext.taxImplications,
                        transactionType: nigerianContext.transactionTypeDescription
                    };
                }

                // AI disagrees - trust AI if much higher confidence
                if (aiClassification.confidence > businessPattern.confidence + 0.25) {
                    return {
                        ...aiClassification,
                        reasoning: aiClassification.reasoning + ` (Overriding weak pattern match)`,
                        nigerianFlags: nigerianContext.nigerianFlags,
                        taxImplications: nigerianContext.taxImplications,
                        transactionType: nigerianContext.transactionTypeDescription
                    };
                }

                // Close call - use business pattern
                return {
                    classification: businessPattern.category,
                    category: businessPattern.category,
                    confidence: businessPattern.confidence,
                    source: 'business_pattern',
                    reasoning: `Your pattern: "${businessPattern.item_pattern}" (AI uncertain)`,
                    needsConfirmation: true,
                    nigerianFlags: nigerianContext.nigerianFlags,
                    taxImplications: nigerianContext.taxImplications,
                    transactionType: nigerianContext.transactionTypeDescription
                };
            }
        }

        // Step 2: No business pattern or low confidence - use AI classifier
        // AI classifier already includes Nigerian context
        return await this.callAIClassifier(data);
    }

    /**
     * Find business-specific pattern (exact or fuzzy match)
     * Enhanced with Nigerian transaction type context
     */
    private async findBusinessPattern(
        businessId: string,
        description: string,
        nigerianFlags?: NigerianFlags
    ): Promise<any | null> {
        const normalized = description.toLowerCase().trim();

        // Build pattern key with Nigerian context for better matching
        const txnTypePrefix = nigerianFlags?.is_pos_transaction ? 'pos:' :
            nigerianFlags?.is_mobile_money ? `mm_${nigerianFlags.mobile_money_provider}:` :
                nigerianFlags?.is_ussd_transaction ? 'ussd:' : '';

        // Try exact match first with transaction type prefix
        if (txnTypePrefix) {
            const { data: typedExact } = await supabase
                .from('business_classification_patterns')
                .select('*')
                .eq('business_id', businessId)
                .eq('item_pattern', txnTypePrefix + normalized)
                .order('confidence', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (typedExact && typedExact.confidence > 0.50) {
                this.recordPatternUsage(typedExact.id, true);
                return typedExact;
            }
        }

        // Try exact match without prefix
        const { data: exact } = await supabase
            .from('business_classification_patterns')
            .select('*')
            .eq('business_id', businessId)
            .eq('item_pattern', normalized)
            .order('confidence', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (exact && exact.confidence > 0.50) {
            // Mark pattern as seen (updates last_seen_at)
            this.recordPatternUsage(exact.id, true);
            return exact;
        }

        // Try fuzzy match (contains pattern)
        const { data: fuzzy } = await supabase
            .from('business_classification_patterns')
            .select('*')
            .eq('business_id', businessId)
            .order('confidence', { ascending: false })
            .limit(20); // Get top 20 patterns

        if (!fuzzy || fuzzy.length === 0) return null;

        // Find best fuzzy match
        let bestMatch: any = null;
        let bestScore = 0;

        for (const pattern of fuzzy) {
            // Check if pattern is contained in description
            if (normalized.includes(pattern.item_pattern) ||
                pattern.item_pattern.includes(normalized)) {
                const score = this.calculateMatchScore(normalized, pattern.item_pattern, pattern.confidence);

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = pattern;
                }
            }
        }

        if (bestMatch && bestScore > 0.40) {
            this.recordPatternUsage(bestMatch.id, true);
            return { ...bestMatch, confidence: bestScore };
        }

        return null;
    }

    /**
     * Calculate fuzzy match score
     */
    private calculateMatchScore(description: string, pattern: string, patternConfidence: number): number {
        // Exact match = 100%
        if (description === pattern) {
            return patternConfidence;
        }

        // Contains match = 70% of pattern confidence
        if (description.includes(pattern) || pattern.includes(description)) {
            const lengthRatio = Math.min(pattern.length, description.length) /
                Math.max(pattern.length, description.length);
            return patternConfidence * 0.70 * lengthRatio;
        }

        // Word overlap
        const descWords = new Set(description.split(' '));
        const patternWords = new Set(pattern.split(' '));
        const intersection = new Set([...descWords].filter(x => patternWords.has(x)));
        const overlap = intersection.size / Math.max(descWords.size, patternWords.size);

        return patternConfidence * overlap * 0.50;
    }

    /**
     * Record pattern usage (for analytics)
     */
    private async recordPatternUsage(patternId: string, wasCorrect: boolean): Promise<void> {
        try {
            const { data } = await supabase
                .from('business_classification_patterns')
                .select('correct_predictions, occurrences')
                .eq('id', patternId)
                .single();

            if (data) {
                await supabase
                    .from('business_classification_patterns')
                    .update({
                        correct_predictions: wasCorrect ? data.correct_predictions + 1 : data.correct_predictions,
                        occurrences: data.occurrences + 1,
                        last_seen_at: new Date().toISOString()
                    })
                    .eq('id', patternId);
            }
        } catch (error) {
            // Non-critical, log and continue
            console.error('Error recording pattern usage:', error);
        }
    }

    /**
     * Call existing AI classifier (now with Nigerian context)
     */
    private async callAIClassifier(data: any): Promise<Classification> {
        const result = await classifierService.classify({
            narration: data.description,
            description: data.description,
            amount: data.amount,
            credit: data.isCredit ? data.amount : 0,
            debit: data.isCredit ? 0 : data.amount,
            date: new Date().toISOString()
        });

        return {
            classification: result.classification,
            category: result.classification,
            confidence: result.confidence,
            source: 'ai',
            reasoning: result.reasoning || result.reason,
            needsConfirmation: result.needsConfirmation,
            nigerianFlags: result.nigerianFlags,
            taxImplications: result.taxImplications,
            transactionType: result.transactionType
        };
    }

    /**
     * Get business patterns for review
     */
    async getBusinessPatterns(businessId: string, limit: number = 50): Promise<any[]> {
        const { data, error } = await supabase
            .from('business_classification_patterns')
            .select('*')
            .eq('business_id', businessId)
            .order('occurrences', { ascending: false })
            .limit(limit);

        if (error) throw error;

        return data || [];
    }
}

export const personalizedClassifierService = new PersonalizedClassifierService();
