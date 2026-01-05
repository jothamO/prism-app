/**
 * AI Profile Extractor
 * Uses Claude Haiku to extract user profile from freeform text
 */

import { callClaudeJSON, CLAUDE_MODELS } from './claude-client.ts';

export interface ExtractedProfile {
    entityType: 'business' | 'individual' | 'self_employed' | 'student' | 'retiree' | 'corper' | 'unemployed';
    taxCategory: string;
    occupation?: string;
    hasBusinessIncome: boolean;
    hasSalaryIncome: boolean;
    hasFreelanceIncome: boolean;
    hasPensionIncome: boolean;
    hasRentalIncome: boolean;
    hasInvestmentIncome: boolean;
    informalBusiness: boolean;
    location?: string;
    confidence: number;
}

const SYSTEM_PROMPT = `You are a Nigerian tax profile analyzer. Extract structured information from user descriptions to determine their tax category and income sources.

Nigerian Tax Context:
- Informal businesses often operate without CAC (Corporate Affairs Commission) registration
- NYSC corps members have tax-free allowances
- Self-employed includes freelancers, contractors, consultants
- Many Nigerians have multiple income sources (salary + side business)
- Common occupations: trader, fashion designer, tech worker, artisan, civil servant

Tax Categories:
- salary_earner: Primary income from employment (PAYE)
- small_business: Business income under ₦25M/year
- medium_business: Business income ₦25M-₦100M
- freelancer: Self-employed, contract work
- informal_business: Unregistered business
- pension: Retired with pension income
- student: Currently studying
- nysc: NYSC corps member

Return a JSON object with the extracted profile.`;

/**
 * Extract profile using Claude Haiku (fast and cheap)
 */
export async function extractProfileWithAI(
    userText: string,
    userName?: string,
    fallbackWorkStatus?: string
): Promise<ExtractedProfile> {
    // Default profile for fallback
    const defaultProfile: ExtractedProfile = {
        entityType: 'individual',
        taxCategory: 'salary_earner',
        hasBusinessIncome: false,
        hasSalaryIncome: true,
        hasFreelanceIncome: false,
        hasPensionIncome: false,
        hasRentalIncome: false,
        hasInvestmentIncome: false,
        informalBusiness: false,
        confidence: 0.3,
    };

    // If no text provided, use fallback work status
    if (!userText?.trim()) {
        if (fallbackWorkStatus) {
            return mapWorkStatusToProfile(fallbackWorkStatus);
        }
        return defaultProfile;
    }

    try {
        const userMessage = `Extract profile information from this Nigerian user's self-description.

User name: ${userName || 'Unknown'}
Description: "${userText}"

Return JSON with these fields:
{
  "entityType": "business|individual|self_employed|student|retiree|corper|unemployed",
  "taxCategory": "salary_earner|small_business|medium_business|freelancer|informal_business|pension|student|nysc",
  "occupation": "detected occupation or null",
  "hasBusinessIncome": true/false,
  "hasSalaryIncome": true/false,
  "hasFreelanceIncome": true/false,
  "hasPensionIncome": true/false,
  "hasRentalIncome": true/false,
  "hasInvestmentIncome": true/false,
  "informalBusiness": true if no CAC/registration mentioned,
  "location": "city/state if mentioned",
  "confidence": 0.0-1.0
}`;

        const result = await callClaudeJSON<ExtractedProfile>(
            SYSTEM_PROMPT,
            userMessage,
            { model: CLAUDE_MODELS.HAIKU, maxTokens: 512 }
        );

        if (result) {
            console.log('[profile-extractor] AI extracted:', result);
            return result;
        }

        // AI call succeeded but parsing failed - use keyword fallback
        return extractProfileWithKeywords(userText, fallbackWorkStatus);
    } catch (error) {
        console.warn('[profile-extractor] AI extraction failed, using keyword fallback:', error);
        return extractProfileWithKeywords(userText, fallbackWorkStatus);
    }
}

/**
 * Keyword-based fallback extraction (when AI is unavailable)
 */
function extractProfileWithKeywords(text: string, workStatus?: string): ExtractedProfile {
    const lowerText = (text || '').toLowerCase();

    const result: ExtractedProfile = {
        entityType: 'individual',
        taxCategory: 'salary_earner',
        occupation: undefined,
        hasBusinessIncome: false,
        hasSalaryIncome: false,
        hasFreelanceIncome: false,
        hasPensionIncome: false,
        hasRentalIncome: false,
        hasInvestmentIncome: false,
        informalBusiness: false,
        confidence: 0.5,
    };

    // Business indicators
    const businessKeywords = ['business', 'company', 'shop', 'store', 'boutique', 'owner', 'run my own', 'trading', 'sell', 'merchandise'];
    const freelanceKeywords = ['freelance', 'freelancer', 'contractor', 'consultant', 'side gig', 'side hustle', 'contract work', 'consulting'];
    const salaryKeywords = ['salary', 'employed', 'work for', 'job', 'employee', 'staff', 'office', 'civil servant'];
    const informalKeywords = ['no cac', 'not registered', 'informal', 'small scale', 'side business', 'not yet registered'];
    const rentalKeywords = ['rental', 'rent', 'tenant', 'landlord', 'property'];
    const investmentKeywords = ['investment', 'dividend', 'stock', 'shares', 'interest'];
    const pensionKeywords = ['retired', 'pension', 'pensioner'];
    const studentKeywords = ['student', 'studying', 'university', 'school', 'undergraduate', 'postgraduate'];
    const nyscKeywords = ['nysc', 'corps', 'corper', 'youth service'];

    // Occupation extraction
    const occupationPatterns = [
        /i(?:'m| am) (?:a |an )?([a-zA-Z\s]+?)(?:\.|,|in |at |from |who )/i,
        /work(?:ing)? as (?:a |an )?([a-zA-Z\s]+?)(?:\.|,|in |at )/i,
    ];

    for (const pattern of occupationPatterns) {
        const match = lowerText.match(pattern);
        if (match && match[1]) {
            result.occupation = match[1].trim();
            break;
        }
    }

    // Detect income sources
    if (businessKeywords.some(k => lowerText.includes(k))) {
        result.hasBusinessIncome = true;
        result.entityType = 'business';
        result.taxCategory = 'small_business';
    }

    if (freelanceKeywords.some(k => lowerText.includes(k))) {
        result.hasFreelanceIncome = true;
        result.entityType = result.hasBusinessIncome ? 'business' : 'self_employed';
        result.taxCategory = result.hasBusinessIncome ? 'small_business' : 'freelancer';
    }

    if (salaryKeywords.some(k => lowerText.includes(k))) {
        result.hasSalaryIncome = true;
        if (!result.hasBusinessIncome && !result.hasFreelanceIncome) {
            result.entityType = 'individual';
            result.taxCategory = 'salary_earner';
        }
    }

    if (informalKeywords.some(k => lowerText.includes(k))) {
        result.informalBusiness = true;
        result.taxCategory = 'informal_business';
    }

    if (rentalKeywords.some(k => lowerText.includes(k))) {
        result.hasRentalIncome = true;
    }

    if (investmentKeywords.some(k => lowerText.includes(k))) {
        result.hasInvestmentIncome = true;
    }

    if (pensionKeywords.some(k => lowerText.includes(k))) {
        result.hasPensionIncome = true;
        result.entityType = 'retiree';
        result.taxCategory = 'pension';
    }

    if (studentKeywords.some(k => lowerText.includes(k))) {
        result.entityType = 'student';
        result.taxCategory = 'student';
    }

    if (nyscKeywords.some(k => lowerText.includes(k))) {
        result.entityType = 'corper';
        result.taxCategory = 'nysc';
    }

    // Location extraction
    const nigerianCities = ['lagos', 'abuja', 'port harcourt', 'kano', 'ibadan', 'kaduna', 'benin', 'enugu', 'owerri', 'warri', 'calabar', 'uyo', 'asaba', 'abeokuta', 'onitsha', 'ilorin', 'jos', 'aba', 'akure', 'bauchi'];
    for (const city of nigerianCities) {
        if (lowerText.includes(city)) {
            result.location = city.charAt(0).toUpperCase() + city.slice(1);
            break;
        }
    }

    // Override with workStatus if provided
    if (workStatus && !text) {
        return mapWorkStatusToProfile(workStatus);
    }

    return result;
}

/**
 * Map quick-select work status to profile
 */
function mapWorkStatusToProfile(workStatus: string): ExtractedProfile {
    const baseProfile: ExtractedProfile = {
        entityType: 'individual',
        taxCategory: 'salary_earner',
        hasBusinessIncome: false,
        hasSalaryIncome: false,
        hasFreelanceIncome: false,
        hasPensionIncome: false,
        hasRentalIncome: false,
        hasInvestmentIncome: false,
        informalBusiness: false,
        confidence: 0.7,
    };

    switch (workStatus) {
        case 'business':
            return { ...baseProfile, entityType: 'business', taxCategory: 'small_business', hasBusinessIncome: true };
        case 'employed':
            return { ...baseProfile, entityType: 'individual', taxCategory: 'salary_earner', hasSalaryIncome: true };
        case 'freelancer':
            return { ...baseProfile, entityType: 'self_employed', taxCategory: 'freelancer', hasFreelanceIncome: true };
        case 'student':
            return { ...baseProfile, entityType: 'student', taxCategory: 'student' };
        case 'retired':
            return { ...baseProfile, entityType: 'retiree', taxCategory: 'pension', hasPensionIncome: true };
        case 'other':
        default:
            return baseProfile;
    }
}
