/**
 * AI Extractor
 * Parses natural language responses during onboarding
 */

import { logger } from '../../utils/logger';

export const ONBOARDING_OPTIONS = {
    work_status: ['employed', 'business', 'freelance', 'both', 'retired', 'student', 'corper', 'other'],
    income_range: ['below_800k', '800k_to_3m', '3m_to_12m', '12m_to_25m', 'above_25m'],
    has_multiple_income: ['yes', 'no'],
    registered_business: ['yes', 'no', 'in_progress'],
    account_setup: ['mixed', 'separate', 'multiple'],
    business_stage: ['pre_revenue', 'early', 'growing', 'established']
};

interface ExtractionResult {
    field: string;
    value: string;
    confidence: number;
    rawText: string;
}

/**
 * Extract structured response from natural language
 */
export function extractOnboardingResponse(
    message: string,
    expectedField: string,
    options?: string[]
): ExtractionResult | null {
    const lower = message.toLowerCase().trim();
    const fieldOptions = options || ONBOARDING_OPTIONS[expectedField as keyof typeof ONBOARDING_OPTIONS] || [];
    
    // Direct match first (number or exact option)
    for (let i = 0; i < fieldOptions.length; i++) {
        const option = fieldOptions[i];
        // Check for number selection (1, 2, 3, etc.)
        if (lower === String(i + 1)) {
            return {
                field: expectedField,
                value: option,
                confidence: 0.95,
                rawText: message
            };
        }
        // Check for exact or partial match
        if (lower === option || lower.includes(option)) {
            return {
                field: expectedField,
                value: option,
                confidence: 0.9,
                rawText: message
            };
        }
    }
    
    // Fuzzy matching for work status
    if (expectedField === 'work_status') {
        if (/work.*company|9.*5|office|corporate|earn.*salary|salaried/i.test(lower)) {
            return { field: expectedField, value: 'employed', confidence: 0.85, rawText: message };
        }
        if (/own.*business|run.*shop|entrepreneur|trader|shop.?owner|md|ceo/i.test(lower)) {
            return { field: expectedField, value: 'business', confidence: 0.85, rawText: message };
        }
        if (/freelance|remote.*work|contract|gig|upwork|fiverr|self.?employed/i.test(lower)) {
            return { field: expectedField, value: 'freelance', confidence: 0.85, rawText: message };
        }
        if (/both|side.*hustle|job.*and.*business|work.*and.*business/i.test(lower)) {
            return { field: expectedField, value: 'both', confidence: 0.85, rawText: message };
        }
        if (/retire|pension|gratuity/i.test(lower)) {
            return { field: expectedField, value: 'retired', confidence: 0.85, rawText: message };
        }
        if (/student|school|university|college|studying/i.test(lower)) {
            return { field: expectedField, value: 'student', confidence: 0.85, rawText: message };
        }
        if (/nysc|corp|youth service|corper/i.test(lower)) {
            return { field: expectedField, value: 'corper', confidence: 0.9, rawText: message };
        }
    }
    
    // Fuzzy matching for income range
    if (expectedField === 'income_range') {
        if (/below.*800|less.*800|under.*800|\<.*800/i.test(lower)) {
            return { field: expectedField, value: 'below_800k', confidence: 0.8, rawText: message };
        }
        if (/800.*3.*m|million.*3|1.*m|2.*m/i.test(lower)) {
            return { field: expectedField, value: '800k_to_3m', confidence: 0.75, rawText: message };
        }
        if (/3.*12.*m|5.*m|10.*m/i.test(lower)) {
            return { field: expectedField, value: '3m_to_12m', confidence: 0.75, rawText: message };
        }
        if (/12.*25.*m|15.*m|20.*m/i.test(lower)) {
            return { field: expectedField, value: '12m_to_25m', confidence: 0.75, rawText: message };
        }
        if (/above.*25|over.*25|more.*25|50.*m|100.*m/i.test(lower)) {
            return { field: expectedField, value: 'above_25m', confidence: 0.75, rawText: message };
        }
    }
    
    // Fuzzy matching for business stage
    if (expectedField === 'business_stage') {
        if (/no.*revenue|not.*earning|pre.*revenue|starting|idea|planning/i.test(lower)) {
            return { field: expectedField, value: 'pre_revenue', confidence: 0.8, rawText: message };
        }
        if (/just.*started|new|early|first.*customer|few.*customer/i.test(lower)) {
            return { field: expectedField, value: 'early', confidence: 0.8, rawText: message };
        }
        if (/growing|expanding|scaling|more.*customer|hiring/i.test(lower)) {
            return { field: expectedField, value: 'growing', confidence: 0.8, rawText: message };
        }
        if (/established|years|mature|stable|profitable/i.test(lower)) {
            return { field: expectedField, value: 'established', confidence: 0.8, rawText: message };
        }
    }
    
    // Fuzzy matching for account setup
    if (expectedField === 'account_setup') {
        if (/mix|same.*account|one.*account|personal.*business/i.test(lower)) {
            return { field: expectedField, value: 'mixed', confidence: 0.8, rawText: message };
        }
        if (/separate|different|dedicated|business.*account/i.test(lower)) {
            return { field: expectedField, value: 'separate', confidence: 0.8, rawText: message };
        }
        if (/multiple|several|many|different.*banks/i.test(lower)) {
            return { field: expectedField, value: 'multiple', confidence: 0.8, rawText: message };
        }
    }
    
    // Fuzzy matching for yes/no questions
    if (fieldOptions.includes('yes') && fieldOptions.includes('no')) {
        if (/^(yes|yeah|yep|sure|correct|true|definitely|of course|affirmative)/i.test(lower)) {
            return { field: expectedField, value: 'yes', confidence: 0.9, rawText: message };
        }
        if (/^(no|nope|nah|false|not really|negative|don't|doesn't)/i.test(lower)) {
            return { field: expectedField, value: 'no', confidence: 0.9, rawText: message };
        }
    }
    
    // Check for "in progress" for registration questions
    if (expectedField === 'registered_business') {
        if (/progress|processing|pending|waiting|soon/i.test(lower)) {
            return { field: expectedField, value: 'in_progress', confidence: 0.85, rawText: message };
        }
    }
    
    logger.warn('[AIExtractor] Could not extract response', { message, expectedField });
    return null;
}

/**
 * Detect if message is a skip/later request
 */
export function isSkipRequest(message: string): boolean {
    const skipPatterns = /\b(skip|later|not now|next|pass|maybe later)\b/i;
    return skipPatterns.test(message);
}

/**
 * Detect if message is asking for help/clarification
 */
export function isHelpRequest(message: string): boolean {
    const helpPatterns = /\b(help|what|explain|don't understand|confused|unclear)\b/i;
    return helpPatterns.test(message);
}
