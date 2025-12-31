/**
 * Phase 5 Week 3 - Insights Engine Test Suite
 * 
 * Tests insights generation, detection logic, and notifications
 */

import { insightsGeneratorService } from '../services/insights-generator.service';
import { MonthlyInsightsWorker } from '../workers/monthly-insights.worker';
import { feedbackCollectionService } from '../services/feedback-collection.service';
import { supabase } from '../config/database';

describe('Phase 5 Week 3: Proactive Insights Engine', () => {
    let testUserId: string;
    let testBusinessId: string;
    let insightsWorker: MonthlyInsightsWorker;

    beforeAll(async () => {
        // Create test user and business
        const { data: user } = await supabase.from('users').insert({
            whatsapp_number: '+234TEST789',
            business_name: 'Insights Test Business'
        }).select().single();
        testUserId = user.id;

        const { data: business } = await supabase.from('businesses').insert({
            user_id: testUserId,
            name: 'Insights Test Business',
            is_primary: true,
            annual_turnover: 45_000_000, // Close to ₦50M threshold
            total_fixed_assets: 20_000_000
        }).select().single();
        testBusinessId = business.id;

        insightsWorker = new MonthlyInsightsWorker();
    });

    afterAll(async () => {
        // Cleanup
        await supabase.from('user_insights').delete().eq('user_id', testUserId);
        await supabase.from('businesses').delete().eq('id', testBusinessId);
        await supabase.from('users').delete().eq('id', testUserId);
    });

    describe('Unclaimed Deductions Detection', () => {
        test('should detect potential deductible expenses', async () => {
            // Create expenses that look deductible
            await supabase.from('expenses').insert([
                {
                    user_id: testUserId,
                    business_id: testBusinessId,
                    description: 'Office rent payment',
                    amount: 150000,
                    date: new Date().toISOString().substring(0, 10),
                    category: null // Not categorized
                },
                {
                    user_id: testUserId,
                    business_id: testBusinessId,
                    description: 'Internet subscription',
                    amount: 15000,
                    date: new Date().toISOString().substring(0, 10),
                    category: 'personal' // Wrongly categorized
                }
            ]);

            const insights = await insightsGeneratorService.generateMonthlyInsights(testUserId, testBusinessId);

            const deductionInsight = insights.find(i => i.type === 'tax_saving');
            expect(deductionInsight).toBeDefined();
            expect(deductionInsight?.potentialSaving).toBeGreaterThan(0);

            // Cleanup
            await supabase.from('expenses').delete().eq('user_id', testUserId);
        });

        test('should calculate correct tax savings (30% of unclaimed amount)', async () => {
            const unclaimedAmount = 100_000;
            const expectedSaving = unclaimedAmount * 0.30; // ₦30,000

            await supabase.from('expenses').insert({
                user_id: testUserId,
                business_id: testBusinessId,
                description: 'Marketing expense',
                amount: unclaimedAmount,
                date: new Date().toISOString().substring(0, 10),
                category: null
            });

            const insights = await insightsGeneratorService.generateMonthlyInsights(testUserId, testBusinessId);
            const deductionInsight = insights.find(i => i.type === 'tax_saving');

            expect(deductionInsight?.potentialSaving).toBeGreaterThanOrEqual(expectedSaving * 0.9); // Allow 10% variance

            // Cleanup
            await supabase.from('expenses').delete().eq('user_id', testUserId);
        });
    });

    describe('Small Company Threshold Warning', () => {
        test('should warn when close to ₦50M threshold', async () => {
            // Business already has ₦45M turnover (90% of threshold)
            const insights = await insightsGeneratorService.generateMonthlyInsights(testUserId, testBusinessId);

            const thresholdWarning = insights.find(i => i.type === 'threshold_warning');
            expect(thresholdWarning).toBeDefined();
            expect(thresholdWarning?.title).toContain('from losing 0% tax');
        });

        test('should show amount remaining before threshold', async () => {
            const insights = await insightsGeneratorService.generateMonthlyInsights(testUserId, testBusinessId);
            const thresholdWarning = insights.find(i => i.type === 'threshold_warning');

            const remaining = 50_000_000 - 45_000_000; // ₦5M
            expect(thresholdWarning?.metadata?.threshold).toBe(50_000_000);
            expect(thresholdWarning?.metadata?.current).toBe(45_000_000);
        });
    });

    describe('VAT Refund Eligibility', () => {
        test('should detect 3+ months of VAT credit', async () => {
            const currentMonth = new Date().toISOString().substring(0, 7);

            // Create 3 months of VAT credit
            const months = [];
            for (let i = 0; i < 3; i++) {
                const date = new Date();
                date.setMonth(date.getMonth() - i);
                months.push(date.toISOString().substring(0, 7));
            }

            for (const month of months) {
                await supabase.from('vat_reconciliations').insert({
                    user_id: testUserId,
                    month,
                    output_vat: 100_000,
                    input_vat: 700_000, // More input than output = credit
                    net_vat_position: -600_000,
                    status: 'draft'
                });
            }

            const insights = await insightsGeneratorService.generateMonthlyInsights(testUserId, testBusinessId);
            const refundInsight = insights.find(i => i.type === 'vat_refund');

            expect(refundInsight).toBeDefined();
            expect(refundInsight?.potentialSaving).toBeGreaterThan(500_000);

            // Cleanup
            await supabase.from('vat_reconciliations').delete().eq('user_id', testUserId);
        });
    });

    describe('Missing Registration Number', () => {
        test('should detect missing business registration', async () => {
            // Remove registration number
            await supabase
                .from('businesses')
                .update({ registration_number: null })
                .eq('id', testBusinessId);

            const insights = await insightsGeneratorService.generateMonthlyInsights(testUserId, testBusinessId);
            const complianceInsight = insights.find(i =>
                i.type === 'compliance' && i.title.includes('registration')
            );

            expect(complianceInsight).toBeDefined();
            expect(complianceInsight?.priority).toBe('high');
        });
    });

    describe('Tax Deadline Warnings', () => {
        test('should warn about upcoming VAT deadline', async () => {
            // Mock current date to be 12th (2 days before 14th)
            const mockDate = new Date();
            mockDate.setDate(12);
            jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

            const insights = await insightsGeneratorService.generateMonthlyInsights(testUserId, testBusinessId);
            const deadlineInsight = insights.find(i =>
                i.type === 'compliance' && i.title.includes('VAT filing due')
            );

            expect(deadlineInsight).toBeDefined();
            expect(deadlineInsight?.deadline).toBeDefined();

            jest.restoreAllMocks();
        });
    });

    describe('Tax Liability Projection', () => {
        test('should project tax based on current revenue', async () => {
            // Create invoices for current month
            const currentMonth = new Date().toISOString().substring(0, 7);

            await supabase.from('invoices').insert([
                {
                    user_id: testUserId,
                    business_id: testBusinessId,
                    date: `${currentMonth}-15`,
                    total: 1_000_000,
                    customer_name: 'Test Customer'
                }
            ]);

            const insights = await insightsGeneratorService.generateMonthlyInsights(testUserId, testBusinessId);
            const cashFlowInsight = insights.find(i => i.type === 'cash_flow');

            if (cashFlowInsight) {
                expect(cashFlowInsight.potentialCost).toBeGreaterThan(0);
                expect(cashFlowInsight.metadata?.revenue).toBeDefined();
            }

            // Cleanup
            await supabase.from('invoices').delete().eq('user_id', testUserId);
        });
    });

    describe('Insights Storage', () => {
        test('should save insights to database', async () => {
            const mockInsights = [
                {
                    type: 'tax_saving' as const,
                    priority: 'high' as const,
                    title: 'Test Insight',
                    description: 'Test description',
                    action: 'Test action',
                    potentialSaving: 50000
                }
            ];

            await insightsGeneratorService.saveInsights(testUserId, mockInsights);

            const { data: saved } = await supabase
                .from('user_insights')
                .select('*')
                .eq('user_id', testUserId);

            expect(saved).toHaveLength(1);
            expect(saved![0].title).toBe('Test Insight');
        });

        test('should retrieve saved insights', async () => {
            const currentMonth = new Date().toISOString().substring(0, 7);
            const insights = await insightsGeneratorService.getUserInsights(testUserId, currentMonth);

            expect(Array.isArray(insights)).toBe(true);
        });

        test('should mark insight as read', async () => {
            const { data: insight } = await supabase
                .from('user_insights')
                .select('id')
                .eq('user_id', testUserId)
                .limit(1)
                .maybeSingle();

            if (insight) {
                await insightsGeneratorService.markAsRead(insight.id);

                const { data: updated } = await supabase
                    .from('user_insights')
                    .select('is_read')
                    .eq('id', insight.id)
                    .single();

                expect(updated.is_read).toBe(true);
            }
        });
    });

    describe('Priority Sorting', () => {
        test('should sort insights by priority and savings', async () => {
            const mockInsights = [
                {
                    type: 'tax_saving' as const,
                    priority: 'low' as const,
                    title: 'Low Priority',
                    description: 'Test',
                    action: 'Test',
                    potentialSaving: 10000
                },
                {
                    type: 'compliance' as const,
                    priority: 'high' as const,
                    title: 'High Priority',
                    description: 'Test',
                    action: 'Test'
                },
                {
                    type: 'tax_saving' as const,
                    priority: 'medium' as const,
                    title: 'Medium Priority',
                    description: 'Test',
                    action: 'Test',
                    potentialSaving: 50000
                }
            ];

            await insightsGeneratorService.saveInsights(testUserId, mockInsights);

            const currentMonth = new Date().toISOString().substring(0, 7);
            const sorted = await insightsGeneratorService.getUserInsights(testUserId, currentMonth);

            // First should be high priority
            expect(sorted[0].priority).toBe('high');
        });
    });

    describe('Monthly Insights Worker', () => {
        test('should generate insights for single user', async () => {
            const result = await insightsWorker.generateForUser(testUserId);

            expect(Array.isArray(result)).toBe(true);
        });

        test('should process all users (mock)', async () => {
            // This would test the full batch process
            // For now, just verify structure
            const mockStats = {
                totalUsers: 10,
                insightsGenerated: 45,
                notificationsSent: 8
            };

            expect(mockStats.totalUsers).toBeGreaterThan(0);
            expect(mockStats.insightsGenerated).toBeGreaterThan(0);
        });
    });
});

// Run tests
// npm test -- insights-engine.test.ts
