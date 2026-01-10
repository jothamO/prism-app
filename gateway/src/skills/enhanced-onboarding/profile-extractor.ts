/**
 * Profile Extractor
 * Extracts user tax profile from freeform text using AI or keywords
 */

import { logger } from '../../utils/logger';

export type TaxCategory = 
    | 'individual_employed'
    | 'individual_self_employed'
    | 'individual_mixed'
    | 'sme'
    | 'corporate'
    | 'unknown';

export type IncomeSource = 
    | 'salary'
    | 'business'
    | 'freelance'
    | 'rental'
    | 'pension'
    | 'dividend'
    | 'unknown';

export interface ExtractedProfile {
    entityType: 'individual' | 'business' | 'self_employed' | 'student' | 'retiree' | 'unemployed' | 'corper';
    entityTypeConfidence: number;
    taxCategory: TaxCategory;
    taxCategoryReason?: string;
    attributes?: {
        occupation?: string;
        incomeSource?: IncomeSource;
        ageGroup?: 'youth' | 'adult' | 'senior' | 'unknown';
        employmentStatus?: 'employed' | 'self_employed' | 'unemployed' | 'retired' | 'student' | 'corper';
        hasBusinessIncome?: boolean;
        hasSalaryIncome?: boolean;
        hasFreelanceIncome?: boolean;
        hasPensionIncome?: boolean;
        hasRentalIncome?: boolean;
        hasInvestmentIncome?: boolean;
        isNYSC?: boolean;
    };
    suggestedNextQuestion?: string;
    suggestedOptions?: string[];
    confidence: number;
}

// Keyword patterns for detection
const EMPLOYMENT_PATTERNS = [
    { pattern: /\b(work|employed|job|company|office|salary|payroll)\b/i, entityType: 'individual' as const, confidence: 0.8 },
    { pattern: /\b(9.*5|nine.*five|corporate|staff|employee)\b/i, entityType: 'individual' as const, confidence: 0.75 },
];

const BUSINESS_PATTERNS = [
    { pattern: /\b(business|company|enterprise|shop|store|owner|ceo|md)\b/i, entityType: 'business' as const, confidence: 0.8 },
    { pattern: /\b(trading|merchandise|pos|sales|vendor|supplier)\b/i, entityType: 'business' as const, confidence: 0.75 },
];

const FREELANCE_PATTERNS = [
    { pattern: /\b(freelance|self.?employed|contractor|consultant|gig)\b/i, entityType: 'self_employed' as const, confidence: 0.85 },
    { pattern: /\b(upwork|fiverr|remote|independent)\b/i, entityType: 'self_employed' as const, confidence: 0.8 },
];

const STUDENT_PATTERNS = [
    { pattern: /\b(student|school|university|college|studying|undergraduate|postgraduate)\b/i, entityType: 'student' as const, confidence: 0.9 },
];

const RETIREE_PATTERNS = [
    { pattern: /\b(retire|pension|gratuity|ptad|pencom)\b/i, entityType: 'retiree' as const, confidence: 0.9 },
];

const CORPER_PATTERNS = [
    { pattern: /\b(nysc|corp|youth service|corper|national service)\b/i, entityType: 'corper' as const, confidence: 0.95 },
];

/**
 * Extract user profile from freeform text
 */
export function extractUserProfile(text: string, userName?: string): ExtractedProfile {
    const lower = text.toLowerCase().trim();
    
    // Default profile
    let profile: ExtractedProfile = {
        entityType: 'individual',
        entityTypeConfidence: 0,
        taxCategory: 'unknown',
        attributes: {},
        confidence: 0
    };
    
    // Check all patterns and find the best match
    const allPatterns = [
        ...CORPER_PATTERNS, // Check corper first (most specific)
        ...STUDENT_PATTERNS,
        ...RETIREE_PATTERNS,
        ...FREELANCE_PATTERNS,
        ...BUSINESS_PATTERNS,
        ...EMPLOYMENT_PATTERNS,
    ];
    
    for (const { pattern, entityType, confidence } of allPatterns) {
        if (pattern.test(lower)) {
            profile.entityType = entityType;
            profile.entityTypeConfidence = confidence;
            profile.confidence = confidence;
            break;
        }
    }
    
    // Determine tax category based on entity type
    switch (profile.entityType) {
        case 'individual':
            profile.taxCategory = 'individual_employed';
            profile.taxCategoryReason = 'Detected salary/employment keywords';
            profile.attributes = { ...profile.attributes, hasSalaryIncome: true };
            break;
        case 'business':
            profile.taxCategory = 'sme';
            profile.taxCategoryReason = 'Detected business/trading keywords';
            profile.attributes = { ...profile.attributes, hasBusinessIncome: true };
            break;
        case 'self_employed':
            profile.taxCategory = 'individual_self_employed';
            profile.taxCategoryReason = 'Detected freelance/self-employment keywords';
            profile.attributes = { ...profile.attributes, hasFreelanceIncome: true };
            break;
        case 'retiree':
            profile.taxCategory = 'individual_employed';
            profile.taxCategoryReason = 'Pension income';
            profile.attributes = { ...profile.attributes, hasPensionIncome: true };
            break;
        case 'corper':
            profile.taxCategory = 'unknown';
            profile.taxCategoryReason = 'NYSC allowance is tax-exempt';
            profile.attributes = { ...profile.attributes, isNYSC: true };
            break;
        case 'student':
            profile.taxCategory = 'unknown';
            profile.taxCategoryReason = 'Student - may have part-time income';
            break;
    }
    
    // Detect mixed income
    if (/both|side.?hustle|job.*business|business.*job/i.test(lower)) {
        profile.taxCategory = 'individual_mixed';
        profile.attributes = {
            ...profile.attributes,
            hasSalaryIncome: true,
            hasBusinessIncome: true
        };
    }
    
    // Detect rental income
    if (/rent|tenant|property|landlord/i.test(lower)) {
        profile.attributes = { ...profile.attributes, hasRentalIncome: true };
    }
    
    // Detect freelance income sources
    if (/upwork|fiverr|payoneer|wise|remitly/i.test(lower)) {
        profile.attributes = { ...profile.attributes, hasFreelanceIncome: true };
    }
    
    // If low confidence, suggest a clarifying question
    if (profile.entityTypeConfidence < 0.5) {
        profile.suggestedNextQuestion = "I'd love to understand your situation better! Could you tell me - what best describes you?";
        profile.suggestedOptions = [
            "I'm employed (earn a salary)",
            "I run a business",
            "I'm a freelancer/contractor",
            "I'm a student",
            "I'm retired",
            "I'm doing NYSC"
        ];
    }
    
    logger.info('[ProfileExtractor] Extracted profile', {
        text: text.substring(0, 50),
        entityType: profile.entityType,
        confidence: profile.entityTypeConfidence,
        taxCategory: profile.taxCategory
    });
    
    return profile;
}

/**
 * Map work status string to profile
 */
export function mapWorkStatusToProfile(workStatus: string): ExtractedProfile {
    const statusMap: Record<string, ExtractedProfile> = {
        'employed': {
            entityType: 'individual',
            entityTypeConfidence: 1,
            taxCategory: 'individual_employed',
            attributes: { hasSalaryIncome: true },
            confidence: 1
        },
        'business': {
            entityType: 'business',
            entityTypeConfidence: 1,
            taxCategory: 'sme',
            attributes: { hasBusinessIncome: true },
            confidence: 1
        },
        'freelance': {
            entityType: 'self_employed',
            entityTypeConfidence: 1,
            taxCategory: 'individual_self_employed',
            attributes: { hasFreelanceIncome: true },
            confidence: 1
        },
        'both': {
            entityType: 'individual',
            entityTypeConfidence: 1,
            taxCategory: 'individual_mixed',
            attributes: { hasSalaryIncome: true, hasBusinessIncome: true },
            confidence: 1
        },
        'retired': {
            entityType: 'retiree',
            entityTypeConfidence: 1,
            taxCategory: 'individual_employed',
            attributes: { hasPensionIncome: true },
            confidence: 1
        },
        'student': {
            entityType: 'student',
            entityTypeConfidence: 1,
            taxCategory: 'unknown',
            confidence: 1
        },
        'corper': {
            entityType: 'corper',
            entityTypeConfidence: 1,
            taxCategory: 'unknown',
            attributes: { isNYSC: true },
            confidence: 1
        }
    };
    
    return statusMap[workStatus] || {
        entityType: 'individual',
        entityTypeConfidence: 0.5,
        taxCategory: 'unknown',
        confidence: 0.5
    };
}
