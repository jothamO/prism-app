/**
 * Enhanced PIT Calculator with Profile Support
 * Phase 5 Week 4: Profile-Aware Tax Calculations
 * 
 * Wraps existing PIT calculator with AI-assisted profile classification
 */

import { pitCalculatorService } from './pit-calculator.service';
import { profileDetectorService } from './profile-detector.service';
import { taxRuleRegistryService } from './tax-rule-registry.service';

interface PITDeductions {
    pensionContributions?: number;
    nhfContributions?: number;
    nhisContributions?: number;
    annualRent?: number;
    lifeInsurance?: number;
    housingLoanInterest?: number;
}

interface ProfileAwarePITResult {
    grossIncome: number;
    adjustedIncome: number;
    totalDeductions: number;
    chargeableIncome: number;
    totalTax: number;
    effectiveRate: number;
    marginalRate: number;
    breakdown: any[];

    // Profile information
    profileUsed: any;
    rulesApplied: string[];
    actReferences: string[];
    profileConfidence: number;
    needsProfileConfirmation: boolean;
}

export class EnhancedPITCalculatorService {
    /**
     * Calculate tax with automatic profile detection
     */
    async calculateWithProfile(
        userId: string,
        grossIncome: number,
        deductions: PITDeductions = {}
    ): Promise<ProfileAwarePITResult> {
        // Detect user profile
        const profilePrediction = await profileDetectorService.detectProfile(userId);

        // Apply profile-specific rules
        const { adjustedIncome, rulesApplied, actReferences } =
            taxRuleRegistryService.applyRules(grossIncome, profilePrediction);

        // Calculate standard PIT on adjusted income
        const pitResult = pitCalculatorService.calculate(adjustedIncome, deductions);

        return {
            ...pitResult,
            grossIncome,
            adjustedIncome,
            profileUsed: profilePrediction,
            rulesApplied,
            actReferences,
            profileConfidence: profilePrediction.confidence,
            needsProfileConfirmation: profilePrediction.needsConfirmation
        };
    }

    /**
     * Calculate tax with explicit profile (user-confirmed)
     */
    async calculateWithConfirmedProfile(
        userId: string,
        grossIncome: number,
        profile: any,
        deductions: PITDeductions = {}
    ): Promise<ProfileAwarePITResult> {
        // Apply profile-specific rules
        const { adjustedIncome, rulesApplied, actReferences } =
            taxRuleRegistryService.applyRules(grossIncome, profile);

        // Calculate standard PIT
        const pitResult = pitCalculatorService.calculate(adjustedIncome, deductions);

        return {
            ...pitResult,
            grossIncome,
            adjustedIncome,
            profileUsed: profile,
            rulesApplied,
            actReferences,
            profileConfidence: 1.0,
            needsProfileConfirmation: false
        };
    }

    /**
     * Quick estimate with profile auto-detection
     */
    async quickEstimate(userId: string, grossIncome: number): Promise<number> {
        const result = await this.calculateWithProfile(userId, grossIncome);
        return result.totalTax;
    }

    /**
     * Compare tax WITH vs WITHOUT profile optimization
     */
    async compareWithAndWithoutProfile(
        userId: string,
        grossIncome: number,
        deductions: PITDeductions = {}
    ): Promise<{
        withoutProfile: number;
        withProfile: number;
        saving: number;
        savingPercentage: number;
        rulesApplied: string[];
    }> {
        // Tax without profile (standard calculation)
        const withoutProfile = pitCalculatorService.calculate(grossIncome, deductions).totalTax;

        // Tax with profile
        const profileResult = await this.calculateWithProfile(userId, grossIncome, deductions);
        const withProfile = profileResult.totalTax;

        const saving = withoutProfile - withProfile;
        const savingPercentage = withoutProfile > 0 ? (saving / withoutProfile) * 100 : 0;

        return {
            withoutProfile,
            withProfile,
            saving,
            savingPercentage,
            rulesApplied: profileResult.rulesApplied
        };
    }
}

export const enhancedPITCalculatorService = new EnhancedPITCalculatorService();
