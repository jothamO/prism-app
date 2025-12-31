/**
 * Feedback Collection Service
 * Phase 5: Automated Learning Pipeline
 * 
 * Captures user corrections on AI predictions for continuous improvement
 */

import { supabase } from '../config/database';

export interface AIFeedback {
    id?: string;
    userId: string;
    businessId?: string;
    entityType: 'invoice_item' | 'expense_category' | 'supplier' | 'transaction_classification';
    entityId?: string;
    aiPrediction: any;
    userCorrection: any;
    itemDescription: string;
    amount?: number;
    metadata?: any;
}

export interface ValidationFeedback {
    invoiceId: string;
    userId: string;
    originalData: any;
    validatedData: any;
    fieldsChanged: string[];
    ocrConfidenceScore?: number;
    validationTimeSeconds?: number;
}

export class FeedbackCollectionService {
    /**
     * Record user correction on AI classification
     */
    async recordCorrection(feedback: AIFeedback): Promise<any> {
        const { data, error } = await supabase
            .from('ai_feedback')
            .insert({
                user_id: feedback.userId,
                business_id: feedback.businessId,
                entity_type: feedback.entityType,
                entity_id: feedback.entityId,
                ai_prediction: feedback.aiPrediction,
                user_correction: feedback.userCorrection,
                item_description: feedback.itemDescription,
                amount: feedback.amount,
                metadata: feedback.metadata || {},
                ai_model_version: process.env.AI_MODEL_VERSION || 'v1.0',
                correction_type: this.determineCorrectionType(feedback.aiPrediction, feedback.userCorrection)
            })
            .select()
            .single();

        if (error) {
            console.error('Error recording feedback:', error);
            throw error;
        }

        // Learn business-specific pattern if business ID provided
        if (feedback.businessId) {
            await this.updateBusinessPattern({
                businessId: feedback.businessId,
                itemDescription: feedback.itemDescription,
                category: feedback.userCorrection.category || feedback.userCorrection.classification,
                amount: feedback.amount
            });
        }

        return data;
    }

    /**
     * Record invoice validation (what user changed)
     */
    async recordInvoiceValidation(validation: ValidationFeedback): Promise<any> {
        const { data, error } = await supabase
            .from('invoice_validations')
            .insert({
                invoice_id: validation.invoiceId,
                user_id: validation.userId,
                original_data: validation.originalData,
                validated_data: validation.validatedData,
                fields_changed: validation.fieldsChanged,
                ocr_confidence_score: validation.ocrConfidenceScore,
                validation_time_seconds: validation.validationTimeSeconds
            })
            .select()
            .single();

        if (error) {
            console.error('Error recording validation:', error);
            throw error;
        }

        return data;
    }

    /**
     * Update business-specific classification pattern
     */
    private async updateBusinessPattern(data: {
        businessId: string;
        itemDescription: string;
        category: string;
        amount?: number;
    }): Promise<void> {
        try {
            await supabase.rpc('upsert_business_pattern', {
                p_business_id: data.businessId,
                p_pattern: data.itemDescription.toLowerCase().trim(),
                p_category: data.category,
                p_amount: data.amount
            });
        } catch (error) {
            console.error('Error updating business pattern:', error);
            // Don't throw - pattern learning is non-critical
        }
    }

    /**
     * Determine type of correction
     */
    private determineCorrectionType(aiPrediction: any, userCorrection: any): string {
        const aiCat = aiPrediction.category || aiPrediction.classification;
        const userCat = userCorrection.category || userCorrection.classification;

        if (!aiCat || !userCat) return 'full_override';

        if (aiCat === userCat) {
            return 'confirmation'; // User confirmed AI was correct
        } else {
            // Check if it's a partial edit (e.g., same parent category)
            const aiParent = aiCat.split('_')[0];
            const userParent = userCat.split('_')[0];

            if (aiParent === userParent) {
                return 'partial_edit';
            }

            return 'full_override';
        }
    }

    /**
     * Get feedback statistics for a user
     */
    async getUserFeedbackStats(userId: string, days: number = 30): Promise<any> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const { data, error } = await supabase
            .from('ai_feedback')
            .select('correction_type, entity_type')
            .eq('user_id', userId)
            .gte('created_at', cutoffDate.toISOString());

        if (error) throw error;

        const stats = {
            total: data.length,
            confirmations: data.filter(f => f.correction_type === 'confirmation').length,
            overrides: data.filter(f => f.correction_type === 'full_override').length,
            partialEdits: data.filter(f => f.correction_type === 'partial_edit').length,
            byEntity: {} as any
        };

        // Count by entity type
        data.forEach(f => {
            stats.byEntity[f.entity_type] = (stats.byEntity[f.entity_type] || 0) + 1;
        });

        // Calculate AI accuracy
        stats.accuracy = stats.total > 0
            ? ((stats.confirmations + stats.partialEdits * 0.5) / stats.total) * 100
            : 0;

        return stats;
    }

    /**
     * Get untrained feedback for model retraining
     */
    async getUntrainedFeedback(limit: number = 10000): Promise<any[]> {
        const { data, error } = await supabase
            .from('ai_feedback')
            .select('*')
            .eq('used_in_training', false)
            .order('created_at', { ascending: true })
            .limit(limit);

        if (error) throw error;

        return data || [];
    }

    /**
     * Mark feedback as used in training
     */
    async markAsUsedInTraining(feedbackIds: string[], trainingBatchId: string): Promise<void> {
        const { error } = await supabase
            .from('ai_feedback')
            .update({
                used_in_training: true,
                training_batch_id: trainingBatchId,
                trained_at: new Date().toISOString()
            })
            .in('id', feedbackIds);

        if (error) {
            console.error('Error marking feedback as trained:', error);
            throw error;
        }
    }
}

export const feedbackCollectionService = new FeedbackCollectionService();
