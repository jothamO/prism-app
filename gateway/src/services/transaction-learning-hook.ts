/**
 * Transaction Processing Hook
 * Integrates profile learning with transaction classification
 */

import { logger } from '../utils/logger';
import { profileLearner, ProfileUpdate } from './profile-learner';
import { supabase } from '../config';

/**
 * Process a transaction and learn from it
 * Call this after each transaction is classified
 */
export async function processTransactionForLearning(
    userId: string,
    transaction: {
        id?: string;
        narration: string;
        amount: number;
        type: 'credit' | 'debit';
        classification: string;
        date: string;
    }
): Promise<{
    updates: ProfileUpdate[];
    notification: string | null;
}> {
    try {
        // Learn from transaction
        const updates = await profileLearner.learnFromTransaction(userId, transaction);

        // Generate notification if profile changed significantly
        const notification = await profileLearner.getProfileChangeNotification(userId, updates);

        if (updates.length > 0) {
            logger.info('[TransactionHook] Profile updated from transaction', {
                userId,
                transactionId: transaction.id,
                updatesCount: updates.length,
                hasNotification: !!notification
            });
        }

        return { updates, notification };

    } catch (error) {
        logger.error('[TransactionHook] Failed to process transaction', { userId, error });
        return { updates: [], notification: null };
    }
}

/**
 * Handle a user correction and learn from it
 * Call this when user corrects a transaction classification
 */
export async function processCorrection(
    userId: string,
    transactionId: string,
    originalClassification: string,
    correctedClassification: string,
    transaction: {
        narration: string;
        amount: number;
        type: 'credit' | 'debit';
    }
): Promise<{
    updates: ProfileUpdate[];
    notification: string | null;
}> {
    try {
        // Mark transaction as corrected in database
        await supabase
            .from('transactions')
            .update({
                original_classification: originalClassification,
                classification: correctedClassification,
                was_corrected: true,
                corrected_by_user: true
            })
            .eq('id', transactionId);

        // Learn from correction
        const updates = await profileLearner.learnFromCorrection(
            userId,
            transactionId,
            originalClassification,
            correctedClassification,
            transaction
        );

        // Generate notification if profile changed significantly
        const notification = await profileLearner.getProfileChangeNotification(userId, updates);

        if (updates.length > 0) {
            logger.info('[CorrectionHook] Profile updated from correction', {
                userId,
                transactionId,
                original: originalClassification,
                corrected: correctedClassification,
                updatesCount: updates.length
            });
        }

        return { updates, notification };

    } catch (error) {
        logger.error('[CorrectionHook] Failed to process correction', { userId, error });
        return { updates: [], notification: null };
    }
}

/**
 * Get user's current profile confidence
 */
export async function getProfileConfidence(userId: string): Promise<number> {
    const { data } = await supabase
        .from('onboarding_progress')
        .select('profile_confidence')
        .eq('user_id', userId)
        .single();

    return data?.profile_confidence || 0.5;
}

/**
 * Get profile learning summary for user
 */
export async function getLearningSummary(userId: string): Promise<{
    confidence: number;
    totalTransactionsAnalyzed: number;
    incomeSources: string[];
    recentUpdates: ProfileUpdate[];
}> {
    const { data } = await supabase
        .from('onboarding_progress')
        .select('profile_confidence, extracted_profile, income_sources_detected')
        .eq('user_id', userId)
        .single();

    const metrics = data?.extracted_profile?.patternMetrics || {};
    const updates = data?.extracted_profile?.profileUpdates || [];

    return {
        confidence: data?.profile_confidence || 0.5,
        totalTransactionsAnalyzed: metrics.totalClassifications || 0,
        incomeSources: data?.income_sources_detected || [],
        recentUpdates: updates.slice(-5) // Last 5 updates
    };
}
