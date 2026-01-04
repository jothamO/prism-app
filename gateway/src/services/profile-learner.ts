/**
 * Profile Learning Service
 * Continuously learns about users from transaction patterns and corrections
 * Grows profile confidence over time
 */

import { supabase } from '../config';
import { logger } from '../utils/logger';
import { ExtractedProfile, TaxCategory, IncomeSource } from '../skills/enhanced-onboarding/profile-extractor';

/**
 * Pattern metrics tracked for each user
 */
export interface PatternMetrics {
    // Transaction counts by type
    salaryCreditsCount: number;
    freelanceCreditsCount: number;
    businessCreditsCount: number;
    rentalCreditsCount: number;
    pensionCreditsCount: number;
    dividendCreditsCount: number;

    // Amounts by type
    totalSalaryIncome: number;
    totalFreelanceIncome: number;
    totalBusinessIncome: number;
    totalRentalIncome: number;
    totalPensionIncome: number;

    // Correction tracking
    totalClassifications: number;
    totalCorrections: number;
    correctionRate: number; // corrections / classifications

    // Last updated
    lastUpdated: string;

    // Detected patterns
    detectedIncomeSources: IncomeSource[];
    primaryIncomeSource: IncomeSource;

    // Threshold tracking
    ytdTurnover: number;
    monthlyAvgIncome: number;
}

/**
 * Profile update from transaction pattern
 */
export interface ProfileUpdate {
    field: string;
    oldValue: any;
    newValue: any;
    reason: string;
    confidence: number;
    timestamp: string;
}

/**
 * Income pattern detection result
 */
interface IncomePattern {
    source: IncomeSource;
    confidence: number;
    evidence: string[];
    amount: number;
    frequency: 'recurring' | 'occasional' | 'one_time';
}

/**
 * Salary detection keywords
 */
const SALARY_KEYWORDS = [
    'salary', 'payroll', 'wages', 'monthly pay', 'compensation',
    'allowance', 'sal/', 'sal-', 'pay slip'
];

/**
 * Freelance/Gig detection keywords
 */
const FREELANCE_KEYWORDS = [
    'upwork', 'fiverr', 'toptal', 'payoneer', 'wise', 'remitly',
    'freelance', 'contract', 'gig', 'project payment', 'consulting'
];

/**
 * Business income detection keywords
 */
const BUSINESS_KEYWORDS = [
    'pos', 'customer payment', 'invoice', 'sales', 'payment from',
    'business', 'trading', 'merchandise', 'stock'
];

/**
 * Rental income detection keywords
 */
const RENTAL_KEYWORDS = [
    'rent', 'lease', 'tenant', 'property income', 'rental'
];

/**
 * Pension/Retirement detection keywords
 */
const PENSION_KEYWORDS = [
    'pension', 'retirement', 'gratuity', 'ptad', 'pencom',
    'contributory pension'
];

/**
 * Profile Learner Service
 */
export class ProfileLearnerService {

    /**
     * Learn from a new transaction and update profile if needed
     */
    async learnFromTransaction(
        userId: string,
        transaction: {
            narration: string;
            amount: number;
            type: 'credit' | 'debit';
            classification?: string;
            date: string;
        }
    ): Promise<ProfileUpdate[]> {
        const updates: ProfileUpdate[] = [];

        if (transaction.type !== 'credit') {
            // Only learn income patterns from credits
            return updates;
        }

        // Detect income pattern from transaction
        const pattern = this.detectIncomePattern(transaction.narration, transaction.amount);

        if (!pattern || pattern.confidence < 0.6) {
            return updates;
        }

        logger.info('[ProfileLearner] Income pattern detected', {
            userId,
            source: pattern.source,
            confidence: pattern.confidence,
            amount: transaction.amount
        });

        // Get current profile
        const profile = await this.getUserProfile(userId);
        if (!profile) {
            logger.warn('[ProfileLearner] No profile found for user', { userId });
            return updates;
        }

        // Update pattern metrics
        const metrics = await this.updatePatternMetrics(userId, pattern, transaction.amount);

        // Check if profile needs updating based on patterns
        const profileUpdates = await this.checkForProfileUpdates(userId, profile, metrics);
        updates.push(...profileUpdates);

        // Save updates if any
        if (updates.length > 0) {
            await this.saveProfileUpdates(userId, updates, profile);
        }

        return updates;
    }

    /**
     * Learn from a user correction
     */
    async learnFromCorrection(
        userId: string,
        transactionId: string,
        originalClassification: string,
        correctedClassification: string,
        transaction: {
            narration: string;
            amount: number;
            type: 'credit' | 'debit';
        }
    ): Promise<ProfileUpdate[]> {
        const updates: ProfileUpdate[] = [];

        logger.info('[ProfileLearner] Learning from correction', {
            userId,
            transactionId,
            original: originalClassification,
            corrected: correctedClassification
        });

        // Get current profile
        const profile = await this.getUserProfile(userId);
        if (!profile) return updates;

        // Update correction count in metrics
        await this.incrementCorrectionCount(userId);

        // Learn from specific corrections
        if (originalClassification === 'personal' && correctedClassification === 'sale') {
            // User corrected personal to sale - they have business income
            if (!profile.data?.hasBusinessIncome) {
                updates.push({
                    field: 'hasBusinessIncome',
                    oldValue: false,
                    newValue: true,
                    reason: 'User corrected transaction to business sale',
                    confidence: 0.8,
                    timestamp: new Date().toISOString()
                });
            }
        }

        if (originalClassification === 'personal' && correctedClassification === 'expense') {
            // User corrected personal to business expense
            if (!profile.data?.hasBusinessIncome) {
                updates.push({
                    field: 'hasBusinessIncome',
                    oldValue: false,
                    newValue: true,
                    reason: 'User has business expenses',
                    confidence: 0.7,
                    timestamp: new Date().toISOString()
                });
            }
        }

        if (correctedClassification === 'rental_income') {
            if (!profile.data?.hasRentalIncome) {
                updates.push({
                    field: 'hasRentalIncome',
                    oldValue: false,
                    newValue: true,
                    reason: 'User confirmed rental income',
                    confidence: 0.95,
                    timestamp: new Date().toISOString()
                });
            }
        }

        // Save updates
        if (updates.length > 0) {
            await this.saveProfileUpdates(userId, updates, profile);
        }

        return updates;
    }

    /**
     * Detect income pattern from transaction narration
     */
    private detectIncomePattern(narration: string, amount: number): IncomePattern | null {
        const lower = narration.toLowerCase();
        const evidence: string[] = [];

        // Check salary
        for (const keyword of SALARY_KEYWORDS) {
            if (lower.includes(keyword)) {
                evidence.push(`Contains '${keyword}'`);
                return {
                    source: 'salary',
                    confidence: 0.85,
                    evidence,
                    amount,
                    frequency: 'recurring'
                };
            }
        }

        // Check freelance
        for (const keyword of FREELANCE_KEYWORDS) {
            if (lower.includes(keyword)) {
                evidence.push(`Contains '${keyword}'`);
                return {
                    source: 'freelance',
                    confidence: 0.80,
                    evidence,
                    amount,
                    frequency: lower.includes('upwork') || lower.includes('fiverr') ? 'recurring' : 'occasional'
                };
            }
        }

        // Check rental
        for (const keyword of RENTAL_KEYWORDS) {
            if (lower.includes(keyword)) {
                evidence.push(`Contains '${keyword}'`);
                return {
                    source: 'rental',
                    confidence: 0.75,
                    evidence,
                    amount,
                    frequency: 'recurring'
                };
            }
        }

        // Check pension
        for (const keyword of PENSION_KEYWORDS) {
            if (lower.includes(keyword)) {
                evidence.push(`Contains '${keyword}'`);
                return {
                    source: 'pension',
                    confidence: 0.90,
                    evidence,
                    amount,
                    frequency: 'recurring'
                };
            }
        }

        // Check business (lower confidence - needs more patterns)
        for (const keyword of BUSINESS_KEYWORDS) {
            if (lower.includes(keyword)) {
                evidence.push(`Contains '${keyword}'`);
                return {
                    source: 'business',
                    confidence: 0.65,
                    evidence,
                    amount,
                    frequency: 'occasional'
                };
            }
        }

        return null;
    }

    /**
     * Get user profile from database
     */
    private async getUserProfile(userId: string): Promise<any> {
        const { data, error } = await supabase
            .from('onboarding_progress')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error) {
            logger.error('[ProfileLearner] Failed to get profile', { userId, error });
            return null;
        }

        return data;
    }

    /**
     * Update pattern metrics for user
     */
    private async updatePatternMetrics(
        userId: string,
        pattern: IncomePattern,
        amount: number
    ): Promise<PatternMetrics> {
        // Get current metrics
        const { data: currentData } = await supabase
            .from('onboarding_progress')
            .select('extracted_profile')
            .eq('user_id', userId)
            .single();

        const current: PatternMetrics = currentData?.extracted_profile?.patternMetrics || {
            salaryCreditsCount: 0,
            freelanceCreditsCount: 0,
            businessCreditsCount: 0,
            rentalCreditsCount: 0,
            pensionCreditsCount: 0,
            dividendCreditsCount: 0,
            totalSalaryIncome: 0,
            totalFreelanceIncome: 0,
            totalBusinessIncome: 0,
            totalRentalIncome: 0,
            totalPensionIncome: 0,
            totalClassifications: 0,
            totalCorrections: 0,
            correctionRate: 0,
            lastUpdated: new Date().toISOString(),
            detectedIncomeSources: [],
            primaryIncomeSource: 'unknown',
            ytdTurnover: 0,
            monthlyAvgIncome: 0
        };

        // Update based on income source
        switch (pattern.source) {
            case 'salary':
                current.salaryCreditsCount++;
                current.totalSalaryIncome += amount;
                break;
            case 'freelance':
                current.freelanceCreditsCount++;
                current.totalFreelanceIncome += amount;
                break;
            case 'business':
                current.businessCreditsCount++;
                current.totalBusinessIncome += amount;
                break;
            case 'rental':
                current.rentalCreditsCount++;
                current.totalRentalIncome += amount;
                break;
            case 'pension':
                current.pensionCreditsCount++;
                current.totalPensionIncome += amount;
                break;
        }

        current.totalClassifications++;
        current.lastUpdated = new Date().toISOString();

        // Update YTD turnover
        current.ytdTurnover = current.totalSalaryIncome +
            current.totalFreelanceIncome +
            current.totalBusinessIncome +
            current.totalRentalIncome +
            current.totalPensionIncome;

        // Detect income sources
        current.detectedIncomeSources = [];
        if (current.salaryCreditsCount >= 2) current.detectedIncomeSources.push('salary');
        if (current.freelanceCreditsCount >= 3) current.detectedIncomeSources.push('freelance');
        if (current.businessCreditsCount >= 5) current.detectedIncomeSources.push('business');
        if (current.rentalCreditsCount >= 1) current.detectedIncomeSources.push('rental');
        if (current.pensionCreditsCount >= 1) current.detectedIncomeSources.push('pension');

        // Determine primary income source
        const totals: Partial<Record<IncomeSource, number>> = {
            salary: current.totalSalaryIncome,
            freelance: current.totalFreelanceIncome,
            business: current.totalBusinessIncome,
            rental: current.totalRentalIncome,
            pension: current.totalPensionIncome
        };

        let maxSource: IncomeSource = 'unknown';
        let maxAmount = 0;
        for (const [source, amt] of Object.entries(totals)) {
            if (amt > maxAmount) {
                maxAmount = amt;
                maxSource = source as IncomeSource;
            }
        }
        current.primaryIncomeSource = maxSource;

        // Save updated metrics
        await supabase
            .from('onboarding_progress')
            .update({
                extracted_profile: {
                    ...currentData?.extracted_profile,
                    patternMetrics: current
                }
            })
            .eq('user_id', userId);

        return current;
    }

    /**
     * Check if profile needs updating based on accumulated patterns
     */
    private async checkForProfileUpdates(
        userId: string,
        profile: any,
        metrics: PatternMetrics
    ): Promise<ProfileUpdate[]> {
        const updates: ProfileUpdate[] = [];
        const data = profile.data || {};

        // Check if income source should be updated
        if (metrics.primaryIncomeSource !== 'unknown' &&
            metrics.primaryIncomeSource !== data.incomeSource) {

            // Only update if we have strong evidence (multiple transactions)
            const minTransactions = {
                salary: 2,
                freelance: 3,
                business: 5,
                rental: 1,
                pension: 1
            };

            const countMap: Partial<Record<IncomeSource, number>> = {
                salary: metrics.salaryCreditsCount,
                freelance: metrics.freelanceCreditsCount,
                business: metrics.businessCreditsCount,
                rental: metrics.rentalCreditsCount,
                pension: metrics.pensionCreditsCount
            };

            const count = countMap[metrics.primaryIncomeSource] || 0;

            const minRequired = minTransactions[metrics.primaryIncomeSource as keyof typeof minTransactions] || 3;

            if (count >= minRequired) {
                updates.push({
                    field: 'incomeSource',
                    oldValue: data.incomeSource,
                    newValue: metrics.primaryIncomeSource,
                    reason: `Detected ${count} ${metrics.primaryIncomeSource} transactions`,
                    confidence: Math.min(0.95, 0.6 + (count * 0.05)),
                    timestamp: new Date().toISOString()
                });
            }
        }

        // Check income flags
        if (metrics.salaryCreditsCount >= 2 && !data.hasSalaryIncome) {
            updates.push({
                field: 'hasSalaryIncome',
                oldValue: false,
                newValue: true,
                reason: `Detected ${metrics.salaryCreditsCount} salary credits totaling ₦${metrics.totalSalaryIncome.toLocaleString()}`,
                confidence: 0.85,
                timestamp: new Date().toISOString()
            });
        }

        if (metrics.freelanceCreditsCount >= 3 && !data.hasFreelanceIncome) {
            updates.push({
                field: 'hasFreelanceIncome',
                oldValue: false,
                newValue: true,
                reason: `Detected ${metrics.freelanceCreditsCount} freelance payments`,
                confidence: 0.80,
                timestamp: new Date().toISOString()
            });
        }

        if (metrics.businessCreditsCount >= 5 && !data.hasBusinessIncome) {
            updates.push({
                field: 'hasBusinessIncome',
                oldValue: false,
                newValue: true,
                reason: `Detected ${metrics.businessCreditsCount} business transactions`,
                confidence: 0.75,
                timestamp: new Date().toISOString()
            });
        }

        if (metrics.rentalCreditsCount >= 1 && !data.hasRentalIncome) {
            updates.push({
                field: 'hasRentalIncome',
                oldValue: false,
                newValue: true,
                reason: `Detected rental income of ₦${metrics.totalRentalIncome.toLocaleString()}`,
                confidence: 0.80,
                timestamp: new Date().toISOString()
            });
        }

        if (metrics.pensionCreditsCount >= 1 && !data.hasPensionIncome) {
            updates.push({
                field: 'hasPensionIncome',
                oldValue: false,
                newValue: true,
                reason: `Detected pension income of ₦${metrics.totalPensionIncome.toLocaleString()}`,
                confidence: 0.90,
                timestamp: new Date().toISOString()
            });
        }

        // Check tax category changes
        const newTaxCategory = this.inferTaxCategory(metrics, data);
        if (newTaxCategory !== data.taxCategory && newTaxCategory !== 'unknown') {
            updates.push({
                field: 'taxCategory',
                oldValue: data.taxCategory,
                newValue: newTaxCategory,
                reason: this.getTaxCategoryReason(newTaxCategory, metrics),
                confidence: 0.75,
                timestamp: new Date().toISOString()
            });
        }

        return updates;
    }

    /**
     * Infer tax category from patterns
     */
    private inferTaxCategory(metrics: PatternMetrics, data: any): TaxCategory {
        // If they have salary income primarily, it's PAYE
        if (metrics.primaryIncomeSource === 'salary' &&
            metrics.totalSalaryIncome > metrics.totalFreelanceIncome + metrics.totalBusinessIncome) {
            return 'paye';
        }

        // If business income dominates, check turnover for company vs self-assessment
        if (metrics.totalBusinessIncome > 0 && metrics.ytdTurnover > 50000000) {
            return 'company_tax';
        }

        // Freelance or business below threshold
        if (metrics.totalFreelanceIncome > 0 || metrics.totalBusinessIncome > 0) {
            return 'self_assessment';
        }

        // Rental/pension primarily
        if (metrics.primaryIncomeSource === 'rental' || metrics.primaryIncomeSource === 'pension') {
            return 'withholding';
        }

        // No significant income
        if (metrics.ytdTurnover < 300000) {
            return 'exempt';
        }

        return 'unknown';
    }

    /**
     * Get reason for tax category
     */
    private getTaxCategoryReason(category: TaxCategory, metrics: PatternMetrics): string {
        switch (category) {
            case 'paye':
                return `Salary income detected: ₦${metrics.totalSalaryIncome.toLocaleString()}. Employer handles tax.`;
            case 'self_assessment':
                return `Self-employed income: ₦${(metrics.totalFreelanceIncome + metrics.totalBusinessIncome).toLocaleString()}. Self-assessment required.`;
            case 'company_tax':
                return `Business turnover ₦${metrics.ytdTurnover.toLocaleString()} exceeds ₦50M. Company tax applies.`;
            case 'withholding':
                return `Passive income (rental/pension) subject to withholding tax at source.`;
            case 'exempt':
                return `YTD income ₦${metrics.ytdTurnover.toLocaleString()} below taxable threshold.`;
            default:
                return 'Tax category to be determined from more transactions.';
        }
    }

    /**
     * Save profile updates to database
     */
    private async saveProfileUpdates(
        userId: string,
        updates: ProfileUpdate[],
        currentProfile: any
    ): Promise<void> {
        const data = currentProfile.data || {};

        // Apply updates
        for (const update of updates) {
            data[update.field] = update.newValue;
        }

        // Recalculate confidence
        const confidence = this.calculateProfileConfidence(data, updates.length);

        // Save to database
        const { error } = await supabase
            .from('onboarding_progress')
            .update({
                data,
                // Add to history
                extracted_profile: {
                    ...currentProfile.extracted_profile,
                    profileUpdates: [
                        ...(currentProfile.extracted_profile?.profileUpdates || []),
                        ...updates
                    ],
                    profileConfidence: confidence,
                    lastLearningUpdate: new Date().toISOString()
                }
            })
            .eq('user_id', userId);

        if (error) {
            logger.error('[ProfileLearner] Failed to save updates', { userId, error });
        } else {
            logger.info('[ProfileLearner] Profile updated', {
                userId,
                updatesCount: updates.length,
                newConfidence: confidence
            });
        }
    }

    /**
     * Calculate profile confidence score
     */
    private calculateProfileConfidence(
        data: any,
        newUpdatesCount: number
    ): number {
        let score = 0.5; // Base confidence from onboarding

        // Increase for each confirmed field
        if (data.entityType) score += 0.1;
        if (data.incomeSource && data.incomeSource !== 'unknown') score += 0.1;
        if (data.taxCategory && data.taxCategory !== 'unknown') score += 0.1;
        if (data.occupation) score += 0.05;

        // Increase for income flags (transaction evidence)
        const incomeFlags = [
            data.hasSalaryIncome,
            data.hasFreelanceIncome,
            data.hasBusinessIncome,
            data.hasRentalIncome,
            data.hasPensionIncome
        ].filter(Boolean).length;

        score += incomeFlags * 0.03;

        // Cap at 0.99
        return Math.min(0.99, score);
    }

    /**
     * Increment correction count for user
     */
    private async incrementCorrectionCount(userId: string): Promise<void> {
        const { data } = await supabase
            .from('onboarding_progress')
            .select('extracted_profile')
            .eq('user_id', userId)
            .single();

        const metrics: PatternMetrics = data?.extracted_profile?.patternMetrics || {
            totalCorrections: 0,
            totalClassifications: 0,
            correctionRate: 0
        } as PatternMetrics;

        metrics.totalCorrections++;
        metrics.correctionRate = metrics.totalClassifications > 0
            ? metrics.totalCorrections / metrics.totalClassifications
            : 0;

        await supabase
            .from('onboarding_progress')
            .update({
                extracted_profile: {
                    ...data?.extracted_profile,
                    patternMetrics: metrics
                }
            })
            .eq('user_id', userId);
    }

    /**
     * Get proactive notification if profile changed significantly
     */
    async getProfileChangeNotification(
        userId: string,
        updates: ProfileUpdate[]
    ): Promise<string | null> {
        if (updates.length === 0) return null;

        // Check for significant changes
        const taxCategoryChange = updates.find(u => u.field === 'taxCategory');
        const newIncomeSource = updates.find(u =>
            u.field === 'hasFreelanceIncome' ||
            u.field === 'hasRentalIncome' ||
            u.field === 'hasBusinessIncome'
        );

        if (taxCategoryChange) {
            return `📢 Profile Update!\n\nI noticed your income pattern has changed.\n\n` +
                `Previous tax category: ${taxCategoryChange.oldValue || 'Unknown'}\n` +
                `New tax category: ${taxCategoryChange.newValue}\n\n` +
                `Reason: ${taxCategoryChange.reason}\n\n` +
                `I'll adjust my tax calculations accordingly.`;
        }

        if (newIncomeSource) {
            const incomeType = newIncomeSource.field
                .replace('has', '')
                .replace('Income', '')
                .toLowerCase();

            return `💰 Income Source Detected!\n\n` +
                `I noticed you have ${incomeType} income based on your transactions.\n\n` +
                `${newIncomeSource.reason}\n\n` +
                `I've updated your profile to track this correctly for tax purposes.`;
        }

        return null;
    }
}

// Export singleton
export const profileLearner = new ProfileLearnerService();
