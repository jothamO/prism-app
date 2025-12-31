/**
 * Phase 5 Week 4 - User Profile Classification Test Suite
 * 
 * Tests AI-assisted profile detection, rule application, and enhanced PIT calculations
 */

import { profileDetectorService } from '../services/profile-detector.service';
import { taxRuleRegistryService } from '../services/tax-rule-registry.service';
import { enhancedPITCalculatorService } from '../services/enhanced-pit-calculator.service';
import { supabase } from '../config/database';

describe('Phase 5 Week 4: User Profile Classification', () => {
    let testUserId: string;

    beforeAll(async () => {
        // Create test user
        const { data: user } = await supabase.from('users').insert({
            whatsapp_number: '+234TESTPROFILE',
            business_name: 'Profile Test',
            age: 66 // Senior citizen
        }).select().single();
        testUserId = user.id;
    });

    afterAll(async () => {
        // Cleanup
        await supabase.from('user_tax_profiles').delete().eq('user_id', testUserId);
        await supabase.from('profile_corrections').delete().eq('user_id', testUserId);
        await supabase.from('users').delete().eq('id', testUserId);
    });

    describe('Profile Detection', () => {
        test('should detect pensioner from pension keywords', async () => {
            // Create pension-related expense
            await supabase.from('expenses').insert({
                user_id: testUserId,
                description: 'Monthly pension payment received',
                amount: 200_000,
                date: new Date().toISOString().substring(0, 10)
            });

            const profile = await profileDetectorService.detectProfile(testUserId);

            expect(profile.isPensioner).toBe(true);
            expect(profile.incomeTypes).toContain('pension');
            expect(profile.employmentStatus).toBe('retired');

            // Cleanup
            await supabase.from('expenses').delete().eq('user_id', testUserId);
        });

        test('should detect senior citizen from age', async () => {
            const profile = await profileDetectorService.detectProfile(testUserId);

            expect(profile.isSeniorCitizen).toBe(true);
            expect(profile.confidence).toBeGreaterThanOrEqual(0.90);
        });

        test('should detect diplomatic immunity from keywords', async () => {
            await supabase.from('expenses').insert({
                user_id: testUserId,
                description: 'Salary from US Embassy',
                amount: 500_000,
                date: new Date().toISOString().substring(0, 10)
            });

            const profile = await profileDetectorService.detectProfile(testUserId);

            expect(profile.incomeTypes).toContain('diplomatic');

            // Cleanup
            await supabase.from('expenses').delete().eq('user_id', testUserId);
        });
    });

    describe('Tax Rule Registry', () => {
        test('should apply pension exemption correctly', async () => {
            const mockProfile = {
                userId: testUserId,
                userType: 'individual' as const,
                employmentStatus: 'retired' as const,
                incomeTypes: ['pension' as const],
                isPensioner: true,
                isSeniorCitizen: false,
                isDisabled: false,
                hasDiplomaticImmunity: false,
                isProfessionalServices: false
            };

            const income = 2_000_000; // ₦2M pension
            const result = taxRuleRegistryService.applyRules(income, mockProfile);

            // First ₦1M exempt, rest at 50% = ₦1M + ₦500K taxable = ₦500K actual taxable
            expect(result.adjustedIncome).toBe(500_000);
            expect(result.rulesApplied).toContain('Pension Income Partial Exemption');
        });

        test('should apply gratuity exemption correctly', async () => {
            const mockProfile = {
                userId: testUserId,
                userType: 'individual' as const,
                employmentStatus: 'salaried' as const,
                incomeTypes: ['gratuity' as const],
                isPensioner: false,
                isSeniorCitizen: false,
                isDisabled: false,
                hasDiplomaticImmunity: false,
                isProfessionalServices: false
            };

            const gratuity = 15_000_000; // ₦15M gratuity
            const result = taxRuleRegistryService.applyRules(gratuity, mockProfile);

            // First ₦10M exempt, ₦5M taxable
            expect(result.adjustedIncome).toBe(5_000_000);
        });

        test('should apply diplomatic exemption (total)', async () => {
            const mockProfile = {
                userId: testUserId,
                userType: 'individual' as const,
                employmentStatus: 'salaried' as const,
                incomeTypes: ['salary' as const],
                isPensioner: false,
                isSeniorCitizen: false,
                isDisabled: false,
                hasDiplomaticImmunity: true,
                isProfessionalServices: false
            };

            const income = 10_000_000;
            const result = taxRuleRegistryService.applyRules(income, mockProfile);

            // Fully exempt
            expect(result.adjustedIncome).toBe(0);
            expect(result.rulesApplied).toContain('Diplomatic Immunity');
        });
    });

    describe('Enhanced PIT Calculator', () => {
        test('should calculate tax with profile auto-detection', async () => {
            // Setup pensioner profile
            await supabase.from('expenses').insert({
                user_id: testUserId,
                description: 'Pension income',
                amount: 180_000,
                date: new Date().toISOString().substring(0, 10)
            });

            const income = 2_000_000;
            const result = await enhancedPITCalculatorService.calculateWithProfile(
                testUserId,
                income
            );

            expect(result.grossIncome).toBe(income);
            expect(result.adjustedIncome).toBeLessThan(income);
            expect(result.rulesApplied.length).toBeGreaterThan(0);

            // Cleanup
            await supabase.from('expenses').delete().eq('user_id', testUserId);
        });

        test('should show tax savings from profile', async () => {
            await supabase.from('user_tax_profiles').upsert({
                user_id: testUserId,
                user_type: 'individual',
                employment_status: 'retired',
                income_types: ['pension'],
                is_pensioner: true,
                is_senior_citizen: true,
                is_disabled: false,
                has_diplomatic_immunity: false,
                user_confirmed: true
            });

            const income = 2_000_000;
            const comparison = await enhancedPITCalculatorService.compareWithAndWithoutProfile(
                testUserId,
                income
            );

            expect(comparison.withProfile).toBeLessThan(comparison.withoutProfile);
            expect(comparison.saving).toBeGreaterThan(0);
            expect(comparison.savingPercentage).toBeGreaterThan(0);
        });
    });

    describe('Profile Correction Workflow', () => {
        test('should save profile correction', async () => {
            const aiPrediction = {
                isPensioner: false,
                isSeniorCitizen: true
            };

            const userCorrection = {
                isPensioner: true,
                isSeniorCitizen: true,
                incomeTypes: ['pension']
            };

            await profileDetectorService.recordCorrection(
                testUserId,
                aiPrediction,
                userCorrection,
                { age: 66, incomeKeywords: ['pension'], transactionPatterns: {}, pastCorrections: [] }
            );

            const { data } = await supabase
                .from('profile_corrections')
                .select('*')
                .eq('user_id', testUserId);

            expect(data).toHaveLength(1);
            expect(data![0].user_correction).toEqual(userCorrection);
        });

        test('should update profile after correction', async () => {
            const { data: profile } = await supabase
                .from('user_tax_profiles')
                .select('*')
                .eq('user_id', testUserId)
                .single();

            expect(profile.is_pensioner).toBe(true);
            expect(profile.user_confirmed).toBe(true);
        });
    });

    describe('Edge Case Scenarios', () => {
        test('pensioner with ₦800K income - should be tax-free', async () => {
            const mockProfile = {
                userId: testUserId,
                userType: 'individual' as const,
                employmentStatus: 'retired' as const,
                incomeTypes: ['pension' as const],
                isPensioner: true,
                isSeniorCitizen: true,
                isDisabled: false,
                hasDiplomaticImmunity: false,
                isProfessionalServices: false
            };

            const income = 800_000;
            const result = await enhancedPITCalculatorService.calculateWithConfirmedProfile(
                testUserId,
                income,
                mockProfile
            );

            // Under ₦1M, fully exempt
            expect(result.totalTax).toBe(0);
        });

        test('diplomat with ₦10M income - should be fully exempt', async () => {
            const mockProfile = {
                userId: testUserId,
                userType: 'individual' as const,
                employmentStatus: 'salaried' as const,
                incomeTypes: ['salary' as const],
                isPensioner: false,
                isSeniorCitizen: false,
                isDisabled: false,
                hasDiplomaticImmunity: true,
                isProfessionalServices: false
            };

            const income = 10_000_000;
            const result = await enhancedPITCalculatorService.calculateWithConfirmedProfile(
                testUserId,
                income,
                mockProfile
            );

            expect(result.totalTax).toBe(0);
            expect(result.actReferences).toContain('Vienna Convention on Diplomatic Relations');
        });
    });
});

// Run tests
// npm test -- user-profiles.test.ts
