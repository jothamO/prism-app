/**
 * Profile Detector Service
 * Phase 5 Week 4: User Profile Classification
 * 
 * AI-powered detection of user tax profiles from signals
 * Learns from user corrections to improve classification
 */

import { supabase } from '../config/database';
import { UserTaxProfile } from './tax-rule-registry.service';

export interface ProfileSignals {
    age?: number;
    incomeKeywords: string[];
    transactionPatterns: any;
    pastCorrections: any[];
}

export interface ProfilePrediction extends UserTaxProfile {
    confidence: number;
    needsConfirmation: boolean;
    signals: ProfileSignals;
}

export class ProfileDetectorService {
    /**
     * Detect user profile from available signals
     */
    async detectProfile(userId: string): Promise<ProfilePrediction> {
        // Gather all signals about the user
        const signals = await this.gatherSignals(userId);

        // Check if we already have a confirmed profile
        const existingProfile = await this.getExistingProfile(userId);
        if (existingProfile && existingProfile.user_confirmed) {
            return {
                ...this.mapToProfileType(existingProfile),
                confidence: 1.0,
                needsConfirmation: false,
                signals
            };
        }

        // AI/ML prediction
        const prediction = await this.predictProfile(signals);

        // Confidence threshold for auto-confirmation
        const needsConfirmation = prediction.confidence < 0.85;

        return {
            ...prediction,
            needsConfirmation,
            signals
        };
    }

    /**
     * Gather signals about user for profile detection
     */
    private async gatherSignals(userId: string): Promise<ProfileSignals> {
        // Get user basic info
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        // Extract income keywords from transactions/invoices
        const incomeKeywords = await this.extractIncomeKeywords(userId);

        // Analyze transaction patterns
        const transactionPatterns = await this.analyzeTransactionPatterns(userId);

        // Get past profile corrections
        const pastCorrections = await this.getPastCorrections(userId);

        return {
            age: user?.age,
            incomeKeywords,
            transactionPatterns,
            pastCorrections
        };
    }

    /**
     * Extract income-related keywords from user's transaction history
     */
    private async extractIncomeKeywords(userId: string): Promise<string[]> {
        const keywords: string[] = [];

        // From expenses/invoices
        const { data: transactions } = await supabase
            .from('expenses')
            .select('description')
            .eq('user_id', userId)
            .limit(100);

        if (transactions) {
            transactions.forEach(t => {
                if (t.description) {
                    const desc = t.description.toLowerCase();

                    // Detect pension keywords
                    if (desc.includes('pension') || desc.includes('retirement') || desc.includes('pension')) {
                        keywords.push('pension');
                    }

                    // Detect salary keywords
                    if (desc.includes('salary') || desc.includes('wage') || desc.includes('payroll')) {
                        keywords.push('salary');
                    }

                    // Detect rental keywords
                    if (desc.includes('rent received') || desc.includes('rental income')) {
                        keywords.push('rental');
                    }

                    // Detect diplomatic keywords
                    if (desc.includes('embassy') || desc.includes('consulate') || desc.includes('diplomatic')) {
                        keywords.push('diplomatic');
                    }

                    // Detect gratuity keywords
                    if (desc.includes('gratuity') || desc.includes('severance')) {
                        keywords.push('gratuity');
                    }
                }
            });
        }

        return [...new Set(keywords)]; // Unique keywords only
    }

    /**
     * Analyze transaction patterns
     */
    private async analyzeTransactionPatterns(userId: string): Promise<any> {
        // Get monthly transaction counts and amounts
        const { data: expenses } = await supabase
            .from('expenses')
            .select('amount, date, category')
            .eq('user_id', userId)
            .order('date', { ascending: false })
            .limit(100);

        if (!expenses || expenses.length === 0) {
            return { frequency: 'none', averageAmount: 0 };
        }

        const monthlyTransactions = new Map<string, number>();
        let totalAmount = 0;

        expenses.forEach(exp => {
            const month = exp.date.substring(0, 7); // YYYY-MM
            monthlyTransactions.set(month, (monthlyTransactions.get(month) || 0) + 1);
            totalAmount += exp.amount || 0;
        });

        return {
            frequency: monthlyTransactions.size > 3 ? 'regular' : 'occasional',
            averageAmount: totalAmount / expenses.length,
            monthlyCount: monthlyTransactions.size
        };
    }

    /**
     * Get past profile corrections for this user
     */
    private async getPastCorrections(userId: string): Promise<any[]> {
        const { data } = await supabase
            .from('profile_corrections')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(10);

        return data || [];
    }

    /**
     * Predict profile using ML/rule-based logic
     * (In production, this would call an ML model)
     */
    private async predictProfile(signals: ProfileSignals): Promise<UserTaxProfile & { confidence: number }> {
        let isPensioner = false;
        let hasDiplomaticImmunity = false;
        let isSeniorCitizen = false;
        let isDisabled = false;
        const incomeTypes: any[] = [];
        let employmentStatus: any = undefined;
        let confidence = 0.50; // Default low confidence

        // Rule 1: Pensioner detection
        if (signals.incomeKeywords.includes('pension') ||
            (signals.age && signals.age >= 60 && signals.transactionPatterns.frequency === 'regular')) {
            isPensioner = true;
            incomeTypes.push('pension');
            employmentStatus = 'retired';
            confidence = signals.incomeKeywords.includes('pension') ? 0.90 : 0.70;
        }

        // Rule 2: Senior citizen (65+)
        if (signals.age && signals.age >= 65) {
            isSeniorCitizen = true;
            confidence = Math.max(confidence, 0.95);
        }

        // Rule 3: Diplomatic immunity
        if (signals.incomeKeywords.includes('diplomatic')) {
            hasDiplomaticImmunity = true;
            confidence = 0.80; // Needs user confirmation
        }

        // Rule 4: Gratuity
        if (signals.incomeKeywords.includes('gratuity')) {
            incomeTypes.push('gratuity');
            confidence = Math.max(confidence, 0.85);
        }

        // Rule 5: Salary
        if (signals.incomeKeywords.includes('salary')) {
            incomeTypes.push('salary');
            employmentStatus = employmentStatus || 'salaried';
            confidence = Math.max(confidence, 0.75);
        }

        // Rule 6: Rental income
        if (signals.incomeKeywords.includes('rental')) {
            incomeTypes.push('rental');
            confidence = Math.max(confidence, 0.70);
        }

        // Learn from past corrections
        if (signals.pastCorrections.length > 0) {
            const lastCorrection = signals.pastCorrections[0];
            if (lastCorrection.user_correction) {
                // Use past correction as strong signal
                const correctedProfile = lastCorrection.user_correction;
                isPensioner = correctedProfile.isPensioner || isPensioner;
                isSeniorCitizen = correctedProfile.isSeniorCitizen || isSeniorCitizen;
                hasDiplomaticImmunity = correctedProfile.hasDiplomaticImmunity || hasDiplomaticImmunity;
                confidence = 0.95; // High confidence from past data
            }
        }

        return {
            userId: '', // Will be populated by caller
            userType: 'individual',
            employmentStatus,
            incomeTypes: incomeTypes.length > 0 ? incomeTypes : ['salary'], // Default to salary
            isPensioner,
            isSeniorCitizen,
            isDisabled,
            hasDiplomaticImmunity,
            isProfessionalServices: false,
            confidence
        };
    }

    /**
     * Save or update user profile
     */
    async saveProfile(userId: string, profile: Partial<UserTaxProfile>, confirmed: boolean = false): Promise<void> {
        await supabase
            .from('user_tax_profiles')
            .upsert({
                user_id: userId,
                user_type: profile.userType || 'individual',
                employment_status: profile.employmentStatus,
                income_types: profile.incomeTypes || [],
                is_pensioner: profile.isPensioner || false,
                is_senior_citizen: profile.isSeniorCitizen || false,
                is_disabled: profile.isDisabled || false,
                has_diplomatic_immunity: profile.hasDiplomaticImmunity || false,
                is_professional_services: profile.isProfessionalServices || false,
                user_confirmed: confirmed,
                last_updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
    }

    /**
     * Record profile correction (for ML training)
     */
    async recordCorrection(userId: string, aiPrediction: any, userCorrection: any, signals: ProfileSignals): Promise<void> {
        await supabase
            .from('profile_corrections')
            .insert({
                user_id: userId,
                ai_prediction: aiPrediction,
                user_correction: userCorrection,
                signals
            });

        // Update profile with user's correction
        await this.saveProfile(userId, userCorrection, true);
    }

    /**
     * Get existing profile for user
     */
    private async getExistingProfile(userId: string): Promise<any | null> {
        const { data } = await supabase
            .from('user_tax_profiles')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

        return data;
    }

    /**
     * Map database profile to TypeScript type
     */
    private mapToProfileType(dbProfile: any): UserTaxProfile {
        return {
            userId: dbProfile.user_id,
            userType: dbProfile.user_type,
            employmentStatus: dbProfile.employment_status,
            incomeTypes: dbProfile.income_types || [],
            isPensioner: dbProfile.is_pensioner,
            isSeniorCitizen: dbProfile.is_senior_citizen,
            isDisabled: dbProfile.is_disabled,
            hasDiplomaticImmunity: dbProfile.has_diplomatic_immunity,
            industryType: dbProfile.industry_type,
            isProfessionalServices: dbProfile.is_professional_services
        };
    }
}

export const profileDetectorService = new ProfileDetectorService();
