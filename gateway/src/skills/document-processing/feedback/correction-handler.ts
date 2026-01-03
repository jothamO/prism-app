/**
 * Feedback/Correction Handler
 * Processes user corrections and updates business patterns for learning
 */

import { logger } from '../../../utils/logger';
import { supabase } from '../../../config';

export class FeedbackHandler {
    /**
     * Record user correction on a transaction classification
     */
    async recordCorrection(data: {
        userId: string;
        businessId?: string;
        transactionId: string;
        aiPrediction: {
            classification: string;
            category?: string;
            confidence: number;
        };
        userCorrection: {
            classification: string;
            category?: string;
        };
        description: string;
        amount?: number;
    }): Promise<void> {
        try {
            // 1. Record in ai_feedback table (existing PRISM table)
            await supabase.from('ai_feedback').insert({
                user_id: data.userId,
                business_id: data.businessId,
                entity_type: 'bank_transaction',
                entity_id: data.transactionId,
                ai_prediction: {
                    classification: data.aiPrediction.classification,
                    category: data.aiPrediction.category,
                    confidence: data.aiPrediction.confidence
                },
                user_correction: {
                    classification: data.userCorrection.classification,
                    category: data.userCorrection.category
                },
                item_description: data.description,
                amount: data.amount,
                metadata: {
                    source: 'document_processing_skill'
                }
            });

            // 2. Update business pattern if business ID provided
            if (data.businessId) {
                await this.updateBusinessPattern({
                    businessId: data.businessId,
                    description: data.description,
                    category: data.userCorrection.category || data.userCorrection.classification,
                    amount: data.amount
                });
            }

            // 3. Update transaction record
            await supabase
                .from('bank_transactions')
                .update({
                    user_classification: data.userCorrection.classification,
                    user_category: data.userCorrection.category,
                    user_reviewed: true,
                    user_reviewed_at: new Date().toISOString()
                })
                .eq('id', data.transactionId);

            logger.info('[FeedbackHandler] Correction recorded', {
                transactionId: data.transactionId,
                from: data.aiPrediction.classification,
                to: data.userCorrection.classification
            });
        } catch (error) {
            logger.error('[FeedbackHandler] Failed to record correction:', error);
            throw error;
        }
    }

    /**
     * Update business-specific classification pattern
     */
    private async updateBusinessPattern(data: {
        businessId: string;
        description: string;
        category: string;
        amount?: number;
    }): Promise<void> {
        try {
            // Use existing PRISM stored procedure
            await supabase.rpc('upsert_business_pattern', {
                p_business_id: data.businessId,
                p_pattern: data.description.toLowerCase().trim(),
                p_category: data.category,
                p_amount: data.amount || null
            });

            logger.info('[FeedbackHandler] Business pattern updated', {
                businessId: data.businessId,
                pattern: data.description,
                category: data.category
            });
        } catch (error) {
            logger.error('[FeedbackHandler] Failed to update pattern:', error);
            // Don't throw - pattern learning is non-critical
        }
    }

    /**
     * Get classification accuracy for a business
     */
    async getAccuracy(businessId: string): Promise<number> {
        try {
            const { data: transactions } = await supabase
                .from('bank_transactions')
                .select('classification, user_classification, user_reviewed')
                .eq('business_id', businessId)
                .eq('user_reviewed', true);

            if (!transactions || transactions.length === 0) {
                return 0;
            }

            const correct = transactions.filter(
                t => !t.user_classification || t.classification === t.user_classification
            ).length;

            return correct / transactions.length;
        } catch (error) {
            logger.error('[FeedbackHandler] Failed to calculate accuracy:', error);
            return 0;
        }
    }
}
