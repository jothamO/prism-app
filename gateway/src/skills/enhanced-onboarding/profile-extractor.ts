/**
 * Profile Extractor for Adaptive Onboarding
 * Uses AI to extract rich profile data from freeform user messages
 */

import { logger } from '../../utils/logger';

/**
 * Nigerian tax categories based on income source
 */
export type TaxCategory =
    | 'paye'           // Pay As You Earn - salaried individuals
    | 'self_assessment' // Self-employed, freelancers, professionals
    | 'company_tax'     // Registered businesses
    | 'exempt'          // Below threshold, students with no income
    | 'withholding'     // Passive income (rent, dividends)
    | 'unknown';

/**
 * Income source types
 */
export type IncomeSource =
    | 'salary'
    | 'business'
    | 'freelance'
    | 'pension'
    | 'rental'
    | 'investment'
    | 'allowance'
    | 'scholarship'
    | 'none'
    | 'mixed'
    | 'unknown';

/**
 * Extracted user profile from AI analysis
 */
export interface ExtractedProfile {
    // Primary classification
    entityType: 'business' | 'individual' | 'self_employed' | 'student' | 'retiree' | 'unemployed' | 'corper';
    entityTypeConfidence: number;

    // Extracted attributes
    attributes: {
        occupation?: string;
        incomeSource: IncomeSource;
        ageGroup?: 'youth' | 'adult' | 'senior' | 'unknown';
        employmentStatus?: 'employed' | 'self_employed' | 'unemployed' | 'retired' | 'student' | 'corper';

        // Income flags
        hasBusinessIncome?: boolean;
        hasSalaryIncome?: boolean;
        hasFreelanceIncome?: boolean;
        hasPensionIncome?: boolean;
        hasRentalIncome?: boolean;
        hasInvestmentIncome?: boolean;

        // Nigerian-specific
        isNYSC?: boolean;           // National Youth Service Corps
        isInformalBusiness?: boolean;  // Market traders, artisans
        sector?: string;            // Banking, tech, trading, etc.
    };

    // Tax implications
    taxCategory: TaxCategory;
    taxCategoryReason: string;

    // Suggested next question
    suggestedNextQuestion: string;
    suggestedOptions?: string[];

    // What to skip
    skipQuestions: string[];

    // Raw reasoning
    reasoning: string;
}

/**
 * Extract user profile from freeform message using AI
 */
export async function extractUserProfile(
    message: string,
    conversationContext?: string
): Promise<ExtractedProfile> {

    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;

    // Fallback if no API key
    if (!LOVABLE_API_KEY) {
        logger.warn('[ProfileExtractor] LOVABLE_API_KEY not found, using fallback');
        return fallbackExtraction(message);
    }

    const prompt = `You are PRISM, a Nigerian tax assistant. Analyze the user's message to understand who they are and how Nigerian tax law applies to them.

USER MESSAGE: "${message}"
${conversationContext ? `CONVERSATION CONTEXT: ${conversationContext}` : ''}

YOUR TASK: Extract profile information to understand:
1. What type of user are they? (business owner, employee, student, retiree, etc.)
2. What are their likely income sources?
3. Which Nigerian tax category applies to them?
4. What questions should we ask next to help them?

NIGERIAN TAX CATEGORIES:
- PAYE: Salaried employees (employer deducts tax)
- Self-Assessment: Freelancers, consultants, professionals
- Company Tax: Registered businesses (30% CIT)
- Withholding Tax: Rental income, dividends, contracts
- Exempt: Students with no income, below minimum wage threshold

NIGERIAN CONTEXT:
- NYSC (National Youth Service Corps) members receive allowance
- Many Nigerians have informal businesses (market trading, roadside shops)
- Common pidgin: "I dey hustle" = freelance/informal business
- "I just enter labour market" = recently employed or seeking work

RESPOND WITH VALID JSON ONLY:
{
  "entityType": "business|individual|self_employed|student|retiree|unemployed|corper",
  "entityTypeConfidence": 0.0-1.0,
  "attributes": {
    "occupation": "extracted occupation or null",
    "incomeSource": "salary|business|freelance|pension|rental|investment|allowance|scholarship|none|mixed|unknown",
    "ageGroup": "youth|adult|senior|unknown",
    "employmentStatus": "employed|self_employed|unemployed|retired|student|corper",
    "hasBusinessIncome": true/false/null,
    "hasSalaryIncome": true/false/null,
    "hasFreelanceIncome": true/false/null,
    "hasPensionIncome": true/false/null,
    "hasRentalIncome": true/false/null,
    "hasInvestmentIncome": true/false/null,
    "isNYSC": true/false/null,
    "isInformalBusiness": true/false/null,
    "sector": "sector if mentioned or null"
  },
  "taxCategory": "paye|self_assessment|company_tax|exempt|withholding|unknown",
  "taxCategoryReason": "Brief explanation of why this tax category",
  "suggestedNextQuestion": "What to ask next to understand them better",
  "suggestedOptions": ["Option 1", "Option 2", "Option 3"],
  "skipQuestions": ["questions to skip based on user type"],
  "reasoning": "Brief explanation of your analysis"
}

EXAMPLES:
- "I am a student" → entityType: "student", taxCategory: "exempt", suggestedNextQuestion: "Do you have any part-time income or side hustle?"
- "I run a small shop" → entityType: "business", taxCategory: "self_assessment" or "company_tax", suggestedNextQuestion: "Is your business registered with CAC?"
- "I just retired from civil service" → entityType: "retiree", taxCategory: "withholding", suggestedNextQuestion: "Do you receive pension, and any other income like rent?"
- "I dey hustle" → entityType: "self_employed", taxCategory: "self_assessment", suggestedNextQuestion: "What kind of hustle? Freelance work or a small business?"`;

    try {
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'google/gemini-2.5-flash',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.2,
                max_tokens: 800
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`[ProfileExtractor] API error: ${response.status} - ${errorText}`);
            return fallbackExtraction(message);
        }

        const data = await response.json() as { choices?: { message?: { content?: string } }[] };
        const content = data.choices?.[0]?.message?.content || '';

        // Parse JSON response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            logger.warn('[ProfileExtractor] No JSON found in response, using fallback');
            return fallbackExtraction(message);
        }

        const parsed = JSON.parse(jsonMatch[0]) as ExtractedProfile;

        logger.info(`[ProfileExtractor] Extracted profile`, {
            entityType: parsed.entityType,
            confidence: parsed.entityTypeConfidence,
            taxCategory: parsed.taxCategory,
            occupation: parsed.attributes?.occupation
        });

        return parsed;

    } catch (error) {
        logger.error('[ProfileExtractor] Error:', error);
        return fallbackExtraction(message);
    }
}

/**
 * Fallback extraction using keyword matching when AI is unavailable
 */
function fallbackExtraction(message: string): ExtractedProfile {
    const lower = message.toLowerCase();

    // Student detection
    if (lower.includes('student') || lower.includes('school') || lower.includes('university') ||
        lower.includes('studying') || lower.includes('undergraduate') || lower.includes('graduate')) {
        return {
            entityType: 'student',
            entityTypeConfidence: 0.7,
            attributes: {
                occupation: 'student',
                incomeSource: 'unknown',
                ageGroup: 'youth',
                employmentStatus: 'student'
            },
            taxCategory: 'exempt',
            taxCategoryReason: 'Students typically have no taxable income',
            suggestedNextQuestion: 'Do you have any part-time income or side hustle?',
            suggestedOptions: ['Yes, I work part-time', 'Yes, I do freelance work', 'No income yet'],
            skipQuestions: ['business_stage', 'capital_support', 'account_setup'],
            reasoning: 'Detected student keywords'
        };
    }

    // Retiree detection
    if (lower.includes('retire') || lower.includes('pension') || lower.includes('former')) {
        return {
            entityType: 'retiree',
            entityTypeConfidence: 0.7,
            attributes: {
                incomeSource: 'pension',
                ageGroup: 'senior',
                employmentStatus: 'retired',
                hasPensionIncome: true
            },
            taxCategory: 'withholding',
            taxCategoryReason: 'Pension income subject to withholding tax',
            suggestedNextQuestion: 'Do you have any other income like rent or investments?',
            suggestedOptions: ['Yes, I have rental income', 'Yes, investments/dividends', 'Just pension'],
            skipQuestions: ['business_stage', 'capital_support'],
            reasoning: 'Detected retirement keywords'
        };
    }

    // NYSC/Corper detection
    if (lower.includes('nysc') || lower.includes('corper') || lower.includes('corps') ||
        lower.includes('service year')) {
        return {
            entityType: 'corper',
            entityTypeConfidence: 0.8,
            attributes: {
                occupation: 'NYSC Corps Member',
                incomeSource: 'allowance',
                ageGroup: 'youth',
                employmentStatus: 'corper',
                isNYSC: true
            },
            taxCategory: 'exempt',
            taxCategoryReason: 'NYSC allowance is below taxable threshold',
            suggestedNextQuestion: 'Are you doing any side hustle during your service year?',
            suggestedOptions: ['Yes, some freelance work', 'No, just focusing on service', 'Planning to start something'],
            skipQuestions: ['business_stage', 'capital_support', 'account_setup'],
            reasoning: 'Detected NYSC keywords'
        };
    }

    // Business detection
    if (lower.includes('business') || lower.includes('company') || lower.includes('shop') ||
        lower.includes('trade') || lower.includes('sell') || lower.includes('run')) {
        return {
            entityType: 'business',
            entityTypeConfidence: 0.6,
            attributes: {
                incomeSource: 'business',
                employmentStatus: 'self_employed',
                hasBusinessIncome: true
            },
            taxCategory: 'self_assessment',
            taxCategoryReason: 'Business income requires self-assessment filing',
            suggestedNextQuestion: 'What stage is your business at?',
            suggestedOptions: ['Just starting', 'Growing steadily', 'Well established'],
            skipQuestions: [],
            reasoning: 'Detected business keywords'
        };
    }

    // Salary/Employment detection
    if (lower.includes('work') || lower.includes('job') || lower.includes('employ') ||
        lower.includes('salary') || lower.includes('staff')) {
        return {
            entityType: 'individual',
            entityTypeConfidence: 0.6,
            attributes: {
                incomeSource: 'salary',
                employmentStatus: 'employed',
                hasSalaryIncome: true
            },
            taxCategory: 'paye',
            taxCategoryReason: 'Salaried employees pay tax through PAYE',
            suggestedNextQuestion: 'Does your employer deduct tax from your salary?',
            suggestedOptions: ['Yes, they handle my taxes', 'Not sure', 'No, I handle it myself'],
            skipQuestions: ['business_stage', 'capital_support'],
            reasoning: 'Detected employment keywords'
        };
    }

    // Freelance/Hustle detection
    if (lower.includes('freelance') || lower.includes('hustle') || lower.includes('gig') ||
        lower.includes('contractor') || lower.includes('self') || lower.includes('own boss')) {
        return {
            entityType: 'self_employed',
            entityTypeConfidence: 0.6,
            attributes: {
                incomeSource: 'freelance',
                employmentStatus: 'self_employed',
                hasFreelanceIncome: true
            },
            taxCategory: 'self_assessment',
            taxCategoryReason: 'Freelance income requires self-assessment',
            suggestedNextQuestion: 'Do you keep your freelance income separate from personal spending?',
            suggestedOptions: ['Yes, separate account', 'No, all in one', 'Sometimes'],
            skipQuestions: ['business_stage'],
            reasoning: 'Detected freelance keywords'
        };
    }

    // Unemployed detection
    if (lower.includes('unemploy') || lower.includes('looking for') || lower.includes('job hunt') ||
        lower.includes('no work') || lower.includes('jobless')) {
        return {
            entityType: 'unemployed',
            entityTypeConfidence: 0.7,
            attributes: {
                incomeSource: 'none',
                employmentStatus: 'unemployed'
            },
            taxCategory: 'exempt',
            taxCategoryReason: 'No current taxable income',
            suggestedNextQuestion: 'Are you receiving any income while job hunting?',
            suggestedOptions: ['Some savings/investments', 'Family support', 'Side hustle income', 'No income'],
            skipQuestions: ['business_stage', 'capital_support', 'account_setup'],
            reasoning: 'Detected unemployment keywords'
        };
    }

    // Default fallback - ask for clarification
    return {
        entityType: 'individual',
        entityTypeConfidence: 0.3,
        attributes: {
            incomeSource: 'unknown'
        },
        taxCategory: 'unknown',
        taxCategoryReason: 'Need more information to determine tax category',
        suggestedNextQuestion: 'Tell me a bit about yourself - what do you do for a living?',
        suggestedOptions: ['I run a business', 'I work for a company', 'I\'m a freelancer', 'I\'m a student'],
        skipQuestions: [],
        reasoning: 'Could not determine user type from message'
    };
}
