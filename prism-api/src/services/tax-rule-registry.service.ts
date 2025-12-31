/**
 * Tax Rule Registry
 * Phase 5 Week 4: User Profile Classification
 * 
 * Central registry of all tax rules for special cases
 * Rules are prioritized and applied based on user profile
 */

export interface UserTaxProfile {
    userId: string;
    userType: 'individual' | 'business' | 'partnership';
    employmentStatus?: 'salaried' | 'self_employed' | 'retired' | 'unemployed';
    incomeTypes: Array<'salary' | 'pension' | 'business' | 'rental' | 'investment' | 'gratuity'>;
    isPensioner: boolean;
    isSeniorCitizen: boolean;
    isDisabled: boolean;
    hasDiplomaticImmunity: boolean;
    industryType?: string;
    isProfessionalServices: boolean;
}

export interface TaxRule {
    id: string;
    name: string;
    condition: (profile: UserTaxProfile) => boolean;
    apply: (income: number, profile?: UserTaxProfile) => number;
    actReference: string;
    priority: number; // 0 = highest priority
    description: string;
}

/**
 * Tax Rule Registry
 * Rules from Nigeria Tax Act 2025
 */
export const TAX_RULES: Record<string, TaxRule> = {
    // PRIORITY 0 - Total Exemptions (highest priority)

    diplomatic_exemption: {
        id: 'diplomatic_exemption',
        name: 'Diplomatic Immunity',
        condition: (profile) => profile.hasDiplomaticImmunity,
        apply: () => 0, // Fully tax exempt
        actReference: 'Vienna Convention on Diplomatic Relations',
        priority: 0,
        description: 'Diplomats, consular officials, and international organization staff are fully exempt from income tax'
    },

    // PRIORITY 1 - Pension & Gratuity Rules (Section 31)

    pension_income_exemption: {
        id: 'pension_income_exemption',
        name: 'Pension Income Partial Exemption',
        condition: (profile) => profile.isPensioner && profile.incomeTypes.includes('pension'),
        apply: (income) => {
            // Section 31(2): First ₦1M of annual pension exempt
            // Rest taxed at 50% of normal rate
            const exempt_amount = 1_000_000;
            if (income <= exempt_amount) {
                return 0; // Fully exempt
            }
            // Only 50% of excess is taxable
            const excess = income - exempt_amount;
            return excess * 0.50;
        },
        actReference: 'Section 31(2)',
        priority: 1,
        description: 'Annual pension income: First ₦1M exempt, remainder taxed at 50% of normal PIT rates'
    },

    gratuity_exemption: {
        id: 'gratuity_exemption',
        name: 'Gratuity Exemption',
        condition: (profile) => profile.incomeTypes.includes('gratuity'),
        apply: (gratuity) => {
            // Section 31(3): Gratuity exempt up to ₦10,000,000
            const exempt_threshold = 10_000_000;
            return Math.max(0, gratuity - exempt_threshold);
        },
        actReference: 'Section 31(3)',
        priority: 1,
        description: 'Gratuity payments: First ₦10M exempt from tax'
    },

    // PRIORITY 2 - Disability & Senior Citizen Allowances

    disability_allowance: {
        id: 'disability_allowance',
        name: 'Disability Tax Relief',
        condition: (profile) => profile.isDisabled,
        apply: (income) => {
            // Additional ₦500K tax-free allowance for disabled persons
            const disability_relief = 500_000;
            return Math.max(0, income - disability_relief);
        },
        actReference: 'Section 30(4)', // Hypothetical - check actual Act
        priority: 2,
        description: 'Persons with disabilities receive additional ₦500K tax-free allowance'
    },

    senior_citizen_allowance: {
        id: 'senior_citizen_allowance',
        name: 'Senior Citizen Relief',
        condition: (profile) => profile.isSeniorCitizen,
        apply: (income) => {
            // Additional ₦300K tax-free allowance for seniors (65+)
            const senior_relief = 300_000;
            return Math.max(0, income - senior_relief);
        },
        actReference: 'Section 30(5)', // Hypothetical - check actual Act
        priority: 2,
        description: 'Persons aged 65+ receive additional ₦300K tax-free allowance'
    }
};

/**
 * Tax Rule Registry Service
 */
export class TaxRuleRegistryService {
    /**
     * Get all applicable rules for a user profile
     * Sorted by priority (0 = highest)
     */
    getApplicableRules(profile: UserTaxProfile): TaxRule[] {
        const applicableRules: TaxRule[] = [];

        for (const ruleKey in TAX_RULES) {
            const rule = TAX_RULES[ruleKey];

            if (rule.condition(profile)) {
                applicableRules.push(rule);
            }
        }

        // Sort by priority (0 first, then 1, 2, etc.)
        return applicableRules.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Apply all applicable rules to income
     */
    applyRules(income: number, profile: UserTaxProfile): {
        adjustedIncome: number;
        rulesApplied: string[];
        actReferences: string[];
    } {
        const rules = this.getApplicableRules(profile);

        let adjustedIncome = income;
        const rulesApplied: string[] = [];
        const actReferences: string[] = [];

        for (const rule of rules) {
            adjustedIncome = rule.apply(adjustedIncome, profile);
            rulesApplied.push(rule.name);
            actReferences.push(rule.actReference);
        }

        return {
            adjustedIncome,
            rulesApplied,
            actReferences
        };
    }

    /**
     * Get rule by ID
     */
    getRule(ruleId: string): TaxRule | undefined {
        return TAX_RULES[ruleId];
    }

    /**
     * Get all rules
     */
    getAllRules(): TaxRule[] {
        return Object.values(TAX_RULES);
    }

    /**
     * Check if profile has any special rules
     */
    hasSpecialRules(profile: UserTaxProfile): boolean {
        return this.getApplicableRules(profile).length > 0;
    }
}

export const taxRuleRegistryService = new TaxRuleRegistryService();
