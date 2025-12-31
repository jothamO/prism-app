/**
 * Phase 5 Integration Test Suite
 * 
 * End-to-end testing of all 4 weeks working together:
 * Week 1: Feedback Collection
 * Week 2: Model Retraining
 * Week 3: Insights Generation
 * Week 4: User Profile Classification
 */

import { feedbackCollectionService } from '../services/feedback-collection.service';
import { personalizedClassifierService } from '../services/personalized-classifier.service';
import { ModelTrainingWorker } from '../workers/model-training.worker';
import { insightsGeneratorService } from '../services/insights-generator.service';
import { profileDetectorService } from '../services/profile-detector.service';
import { enhancedPITCalculatorService } from '../services/enhanced-pit-calculator.service';
import { supabase } from '../config/database';

describe('Phase 5 Integration Tests: Full Learning Pipeline', () => {
    let testUserId: string;
    let testBusinessId: string;

    beforeAll(async () => {
        // Create test user (pensioner scenario)
        const { data: user } = await supabase.from('users').insert({
            whatsapp_number: '+234INTEGRATION',
            business_name: 'Integration Test Business',
            tin: 'TIN-INTEGRATION-001',
            age: 67
        }).select().single();
        testUserId = user.id;

        const { data: business } = await supabase.from('businesses').insert({
            user_id: testUserId,
            name: 'Integration Test Business',
            registration_number: 'BN-INTEGRATION-001',
            is_primary: true,
            annual_turnover: 45_000_000
        }).select().single();
        testBusinessId = business.id;
    });

    afterAll(async () => {
        // Cleanup
        await supabase.from('user_insights').delete().eq('user_id', testUserId);
        await supabase.from('ai_feedback').delete().eq('user_id', testUserId);
        await supabase.from('user_tax_profiles').delete().eq('user_id', testUserId);
        await supabase.from('businesses').delete().eq('id', testBusinessId);
        await supabase.from('users').delete().eq('id', testUserId);
    });

    describe('E2E Scenario 1: Pensioner Classification → Tax Calculation → Insights', () => {
        test('should detect pensioner, apply rules, and generate insights', async () => {
            // Step 1: User enters pension income
            await supabase.from('expenses').insert({
                user_id: testUserId,
                business_id: testBusinessId,
                description: 'Monthly pension payment received',
                amount: 200_000,
                date: new Date().toISOString().substring(0, 10),
                period: new Date().toISOString().substring(0, 7)
            });

            // Step 2: Profile detector identifies pensioner
            const profile = await profileDetectorService.detectProfile(testUserId);
            expect(profile.isPensioner).toBe(true);
            expect(profile.incomeTypes).toContain('pension');

            // Step 3: Calculate tax with profile (should apply pension exemption)
            const taxResult = await enhancedPITCalculatorService.calculateWithProfile(
                testUserId,
                2_400_000 // ₦2.4M annual pension
            );

            // Pension exemption: First ₦1M exempt, rest at 50% = ₦700K taxable
            expect(taxResult.adjustedIncome).toBeLessThan(taxResult.grossIncome);
            expect(taxResult.totalTax).toBeLessThan(285_000); // Standard tax would be ~₦285K
            expect(taxResult.rulesApplied).toContain('Pension Income Partial Exemption');

            // Step 4: Generate insights
            const insights = await insightsGeneratorService.generateMonthlyInsights(
                testUserId,
                testBusinessId
            );

            // Should have threshold warning (₦45M close to ₦50M)
            const thresholdInsight = insights.find(i => i.type === 'threshold_warning');
            expect(thresholdInsight).toBeDefined();

            // Cleanup
            await supabase.from('expenses').delete().eq('user_id', testUserId);
        });
    });

    describe('E2E Scenario 2: User Correction → Pattern Learning → Improved Classification', () => {
        test('should learn from correction and improve next classification', async () => {
            const itemDesc = 'Facebook advertising campaign';

            // Step 1: Initial classification (might be wrong)
            const initialClassification = await personalizedClassifierService.classify({
                businessId: testBusinessId,
                description: itemDesc,
                amount: 50_000
            });

            // Step 2: User corrects it
            await feedbackCollectionService.recordCorrection({
                userId: testUserId,
                businessId: testBusinessId,
                entityType: 'expense_category',
                itemDescription: itemDesc,
                amount: 50_000,
                aiPrediction: { category: 'office_supplies', confidence: 0.60 },
                userCorrection: { category: 'marketing' }
            });

            // Step 3: Check pattern was learned
            const { data: pattern } = await supabase
                .from('business_classification_patterns')
                .select('*')
                .eq('business_id', testBusinessId)
                .eq('item_pattern', itemDesc.toLowerCase())
                .single();

            expect(pattern).toBeDefined();
            expect(pattern.category).toBe('marketing');

            // Step 4: Classify same item again (should use learned pattern)
            const improvedClassification = await personalizedClassifierService.classify({
                businessId: testBusinessId,
                description: itemDesc,
                amount: 50_000
            });

            expect(improvedClassification.source).toBe('business_pattern');
            expect(improvedClassification.classification).toBe('marketing');
            expect(improvedClassification.confidence).toBeGreaterThan(0.50);
        });
    });

    describe('E2E Scenario 3: Multiple Corrections → Model Retraining', () => {
        test('should accumulate feedback for retraining', async () => {
            // Step 1: Create 5 corrections (realistic scenario)
            const corrections = [
                { desc: 'Office rent', ai: 'utilities', user: 'rent' },
                { desc: 'Google Ads', ai: 'software', user: 'marketing' },
                { desc: 'Salary payment', ai: 'transfer', user: 'salaries' },
                { desc: 'Internet bill', ai: 'office_supplies', user: 'communications' },
                { desc: 'Facebook Ads', ai: 'entertainment', user: 'marketing' }
            ];

            for (const corr of corrections) {
                await feedbackCollectionService.recordCorrection({
                    userId: testUserId,
                    businessId: testBusinessId,
                    entityType: 'expense_category',
                    itemDescription: corr.desc,
                    amount: 10_000,
                    aiPrediction: { category: corr.ai, confidence: 0.60 },
                    userCorrection: { category: corr.user }
                });
            }

            // Step 2: Get untrained feedback
            const untrainedFeedback = await feedbackCollectionService.getUntrainedFeedback(100);

            expect(untrainedFeedback.length).toBeGreaterThanOrEqual(5);
            expect(untrainedFeedback.some(f => f.item_description === 'Office rent')).toBe(true);

            // Step 3: Verify patterns learned
            const { data: patterns } = await supabase
                .from('business_classification_patterns')
                .select('*')
                .eq('business_id', testBusinessId);

            expect(patterns.length).toBeGreaterThanOrEqual(5);

            // Marketing pattern should have 2 occurrences (Google Ads + Facebook Ads)
            const marketingPattern = patterns.find(p =>
                p.category === 'marketing' && p.item_pattern.includes('ads')
            );
            expect(marketingPattern).toBeDefined();
        });
    });

    describe('E2E Scenario 4: Insights → User Action → Feedback Loop', () => {
        test('should generate insight, user acts, system learns', async () => {
            // Step 1: Create unclaimed deductible expenses
            await supabase.from('expenses').insert([
                {
                    user_id: testUserId,
                    business_id: testBusinessId,
                    description: 'Office rent payment',
                    amount: 150_000,
                    date: new Date().toISOString().substring(0, 10),
                    period: new Date().toISOString().substring(0, 7),
                    category: null // Not categorized
                },
                {
                    user_id: testUserId,
                    business_id: testBusinessId,
                    description: 'Marketing expenses',
                    amount: 75_000,
                    date: new Date().toISOString().substring(0, 10),
                    period: new Date().toISOString().substring(0, 7),
                    category: 'personal' // Wrongly categorized
                }
            ]);

            // Step 2: Generate insights
            const insights = await insightsGeneratorService.generateMonthlyInsights(
                testUserId,
                testBusinessId
            );

            const taxSavingInsight = insights.find(i => i.type === 'tax_saving');
            expect(taxSavingInsight).toBeDefined();
            expect(taxSavingInsight?.potentialSaving).toBeGreaterThan(0);

            // Step 3: Save insights
            await insightsGeneratorService.saveInsights(testUserId, insights);

            // Step 4: Verify insights stored
            const savedInsights = await insightsGeneratorService.getUserInsights(
                testUserId,
                new Date().toISOString().substring(0, 7)
            );

            expect(savedInsights.length).toBeGreaterThan(0);
            expect(savedInsights.some(i => i.type === 'tax_saving')).toBe(true);

            // Cleanup
            await supabase.from('expenses').delete().eq('user_id', testUserId);
        });
    });

    describe('E2E Scenario 5: Profile Correction → Enhanced PIT Calculation', () => {
        test('should handle profile correction and recalculate tax', async () => {
            // Step 1: AI detects profile (might be wrong)
            const detectedProfile = await profileDetectorService.detectProfile(testUserId);

            // Step 2: User corrects profile  
            const correctedProfile = {
                ...detectedProfile,
                isPensioner: true,
                isSeniorCitizen: true,
                incomeTypes: ['pension', 'rental']
            };

            await profileDetectorService.recordCorrection(
                testUserId,
                detectedProfile,
                correctedProfile,
                { age: 67, incomeKeywords: ['pension'], transactionPatterns: {}, pastCorrections: [] }
            );

            // Step 3: Calculate tax with corrected profile
            const comparison = await enhancedPITCalculatorService.compareWithAndWithoutProfile(
                testUserId,
                2_000_000
            );

            expect(comparison.withProfile).toBeLessThan(comparison.withoutProfile);
            expect(comparison.saving).toBeGreaterThan(0);
            expect(comparison.savingPercentage).toBeGreaterThan(50); // Pensioner saves 50%+
        });
    });

    describe('E2E Scenario 6: Full Monthly Workflow', () => {
        test('should simulate complete monthly cycle', async () => {
            const month = new Date().toISOString().substring(0, 7);

            // Step 1: User transactions throughout month
            await supabase.from('expenses').insert([
                {
                    user_id: testUserId,
                    business_id: testBusinessId,
                    description: 'Pension income',
                    amount: 200_000,
                    date: `${month}-05`,
                    period: month,
                    category: 'income'
                },
                {
                    user_id: testUserId,
                    business_id: testBusinessId,
                    description: 'Rent paid',
                    amount: 120_000,
                    date: `${month}-10`,
                    period: month,
                    category: 'rent'
                }
            ]);

            // Step 2: Generate monthly insights (1st of next month)
            const insights = await insightsGeneratorService.generateMonthlyInsights(
                testUserId,
                testBusinessId
            );

            expect(insights.length).toBeGreaterThan(0);

            // Step 3: Profile detection runs
            const profile = await profileDetectorService.detectProfile(testUserId);
            expect(profile.isPensioner).toBe(true);

            // Step 4: Save profile
            await profileDetectorService.saveProfile(testUserId, profile, true);

            // Step 5: Calculate monthly tax
            const monthlyIncome = 200_000 * 12; // Annual equivalent
            const taxResult = await enhancedPITCalculatorService.calculateWithProfile(
                testUserId,
                monthlyIncome
            );

            expect(taxResult.totalTax).toBeLessThan(285_000); // Standard tax
            expect(taxResult.profileUsed).toBeDefined();

            // Cleanup
            await supabase.from('expenses').delete().eq('user_id', testUserId);
        });
    });

    describe('Performance & Load Tests', () => {
        test('should handle batch user processing', async () => {
            const startTime = Date.now();

            // Simulate processing 10 users
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(
                    profileDetectorService.detectProfile(testUserId)
                );
            }

            const results = await Promise.all(promises);
            const endTime = Date.now();

            expect(results).toHaveLength(10);
            expect(endTime - startTime).toBeLessThan(5000); // Should finish in 5 seconds
        });

        test('should handle large feedback volume', async () => {
            const feedbackBatch = [];

            for (let i = 0; i < 50; i++) {
                feedbackBatch.push({
                    userId: testUserId,
                    businessId: testBusinessId,
                    entityType: 'expense_category' as const,
                    itemDescription: `Test expense ${i}`,
                    amount: 1000 + i,
                    aiPrediction: { category: 'unknown', confidence: 0.50 },
                    userCorrection: { category: 'office_supplies' }
                });
            }

            const startTime = Date.now();

            for (const feedback of feedbackBatch) {
                await feedbackCollectionService.recordCorrection(feedback);
            }

            const endTime = Date.now();

            expect(endTime - startTime).toBeLessThan(10000); // Should finish in 10 seconds
        });
    });
});

// Run tests
// npm test -- integration.test.ts
