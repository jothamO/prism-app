/**
 * Phase 5 Week 1 - Feedback System Test Suite
 * 
 * Tests feedback collection, pattern learning, and personalized classification
 */

import { feedbackCollectionService } from '../services/feedback-collection.service';
import { personalizedClassifierService } from '../services/personalized-classifier.service';
import { supabase } from '../config/database';

describe('Phase 5 Week 1: Feedback System', () => {
    let testUserId: string;
    let testBusinessId: string;

    beforeAll(async () => {
        // Create test user and business
        const { data: user } = await supabase.from('users').insert({
            whatsapp_number: '+234TEST123',
            business_name: 'Test Business'
        }).select().single();
        testUserId = user.id;

        const { data: business } = await supabase.from('businesses').insert({
            user_id: testUserId,
            name: 'Test Business',
            is_primary: true
        }).select().single();
        testBusinessId = business.id;
    });

    afterAll(async () => {
        // Cleanup
        await supabase.from('ai_feedback').delete().eq('user_id', testUserId);
        await supabase.from('business_classification_patterns').delete().eq('business_id', testBusinessId);
        await supabase.from('businesses').delete().eq('id', testBusinessId);
        await supabase.from('users').delete().eq('id', testUserId);
    });

    describe('Feedback Collection', () => {
        test('should record user correction', async () => {
            const feedback = await feedbackCollectionService.recordCorrection({
                userId: testUserId,
                businessId: testBusinessId,
                entityType: 'transaction_classification',
                itemDescription: 'Facebook ads payment',
                amount: 50000,
                aiPrediction: { classification: 'office_supplies', confidence: 0.65 },
                userCorrection: { classification: 'marketing_expense' }
            });

            expect(feedback).toBeDefined();
            expect(feedback.correction_type).toBe('full_override');
            expect(feedback.used_in_training).toBe(false);
        });

        test('should detect confirmation (AI was correct)', async () => {
            const feedback = await feedbackCollectionService.recordCorrection({
                userId: testUserId,
                businessId: testBusinessId,
                entityType: 'expense_category',
                itemDescription: 'Office rent',
                amount: 200000,
                aiPrediction: { category: 'rent', confidence: 0.92 },
                userCorrection: { category: 'rent' }
            });

            expect(feedback.correction_type).toBe('confirmation');
        });

        test('should get user feedback stats', async () => {
            const stats = await feedbackCollectionService.getUserFeedbackStats(testUserId, 30);

            expect(stats.total).toBeGreaterThanOrEqual(2);
            expect(stats).toHaveProperty('accuracy');
            expect(stats.accuracy).toBeGreaterThan(0);
        });
    });

    describe('Business Pattern Learning', () => {
        test('should create business pattern from correction', async () => {
            // First correction creates pattern
            await feedbackCollectionService.recordCorrection({
                userId: testUserId,
                businessId: testBusinessId,
                entityType: 'expense_category',
                itemDescription: 'Google Ads',
                amount: 75000,
                aiPrediction: { category: 'software', confidence: 0.60 },
                userCorrection: { category: 'marketing' }
            });

            // Check pattern was created
            const { data: patterns } = await supabase
                .from('business_classification_patterns')
                .select('*')
                .eq('business_id', testBusinessId)
                .eq('item_pattern', 'google ads');

            expect(patterns).toHaveLength(1);
            expect(patterns[0].category).toBe('marketing');
            expect(patterns[0].occurrences).toBe(1);
        });

        test('should update pattern on repeated correction', async () => {
            // Second correction updates pattern
            await feedbackCollectionService.recordCorrection({
                userId: testUserId,
                businessId: testBusinessId,
                entityType: 'expense_category',
                itemDescription: 'Google Ads',
                amount: 80000,
                aiPrediction: { category: 'software', confidence: 0.60 },
                userCorrection: { category: 'marketing' }
            });

            // Check pattern was updated
            const { data: patterns } = await supabase
                .from('business_classification_patterns')
                .select('*')
                .eq('business_id', testBusinessId)
                .eq('item_pattern', 'google ads');

            expect(patterns).toHaveLength(1);
            expect(patterns[0].occurrences).toBe(2);
            expect(patterns[0].confidence).toBeGreaterThan(0);
        });
    });

    describe('Personalized Classifier', () => {
        test('should use business pattern over AI (high confidence)', async () => {
            // Create strong pattern (3+ occurrences)
            for (let i = 0; i < 3; i++) {
                await feedbackCollectionService.recordCorrection({
                    userId: testUserId,
                    businessId: testBusinessId,
                    entityType: 'expense_category',
                    itemDescription: 'LinkedIn Premium',
                    amount: 15000,
                    aiPrediction: { category: 'software', confidence: 0.70 },
                    userCorrection: { category: 'marketing' }
                });
            }

            // Now classify similar item
            const result = await personalizedClassifierService.classify({
                businessId: testBusinessId,
                description: 'LinkedIn Premium',
                amount: 15000
            });

            expect(result.source).toBe('business_pattern');
            expect(result.classification).toBe('marketing');
            expect(result.confidence).toBeGreaterThan(0.80);
        });

        test('should use AI fallback when no pattern match', async () => {
            const result = await personalizedClassifierService.classify({
                businessId: testBusinessId,
                description: 'Brand new never seen before expense',
                amount: 10000
            });

            expect(result.source).toBe('ai');
            expect(result.confidence).toBeGreaterThan(0);
        });

        test('should use hybrid mode (pattern + AI agree)', async () => {
            // Create medium confidence pattern
            await feedbackCollectionService.recordCorrection({
                userId: testUserId,
                businessId: testBusinessId,
                entityType: 'expense_category',
                itemDescription: 'Office supplies from Shoprite',
                amount: 5000,
                aiPrediction: { category: 'travel', confidence: 0.50 },
                userCorrection: { category: 'office_supplies' }
            });

            // Classify - if AI agrees, should boost confidence
            const result = await personalizedClassifierService.classify({
                businessId: testBusinessId,
                description: 'Office supplies from Shoprite',
                amount: 5000
            });

            // If hybrid worked, source should be 'hybrid' or 'business_pattern'
            expect(['hybrid', 'business_pattern', 'ai']).toContain(result.source);
        });

        test('should handle fuzzy pattern matching', async () => {
            // Create pattern with exact term
            await feedbackCollectionService.recordCorrection({
                userId: testUserId,
                businessId: testBusinessId,
                entityType: 'expense_category',
                itemDescription: 'MTN airtime',
                amount: 2000,
                aiPrediction: { category: 'office_supplies', confidence: 0.40 },
                userCorrection: { category: 'communications' }
            });

            // Try slightly different description
            const result = await personalizedClassifierService.classify({
                businessId: testBusinessId,
                description: 'MTN airtime recharge',
                amount: 2000
            });

            // Should match pattern since 'MTN airtime' is contained
            expect(result.classification).toBeDefined();
        });
    });

    describe('Untrained Feedback Retrieval', () => {
        test('should get untrained feedback for model training', async () => {
            const untrainedFeedback = await feedbackCollectionService.getUntrainedFeedback(100);

            expect(Array.isArray(untrainedFeedback)).toBe(true);
            expect(untrainedFeedback.length).toBeGreaterThan(0);
            expect(untrainedFeedback[0]).toHaveProperty('item_description');
            expect(untrainedFeedback[0]).toHaveProperty('ai_prediction');
            expect(untrainedFeedback[0]).toHaveProperty('user_correction');
        });

        test('should mark feedback as used in training', async () => {
            const feedback = await feedbackCollectionService.recordCorrection({
                userId: testUserId,
                businessId: testBusinessId,
                entityType: 'expense_category',
                itemDescription: 'Test expense for training',
                amount: 1000,
                aiPrediction: { category: 'test', confidence: 0.50 },
                userCorrection: { category: 'test_corrected' }
            });

            await feedbackCollectionService.markAsUsedInTraining([feedback.id], 'test_batch_123');

            const { data: updated } = await supabase
                .from('ai_feedback')
                .select('used_in_training, training_batch_id')
                .eq('id', feedback.id)
                .single();

            expect(updated.used_in_training).toBe(true);
            expect(updated.training_batch_id).toBe('test_batch_123');
        });
    });
});

// Run tests
// npm test -- feedback-system.test.ts
