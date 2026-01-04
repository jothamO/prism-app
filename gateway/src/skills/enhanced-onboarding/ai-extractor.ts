/**
 * AI-Powered Onboarding Response Extractor
 * Uses Lovable AI Gateway to naturally interpret user responses
 */

import { logger } from '../../utils/logger';

interface ExtractionOption {
    value: string;
    keywords: string[];
    description?: string;
}

interface ExtractionResult {
    selectedValue: string | null;
    confidence: number;
    reasoning: string;
    needsClarification: boolean;
}

/**
 * Extract user's onboarding response using AI
 * Provides natural language understanding for flexible input handling
 */
export async function extractOnboardingResponse(
    userMessage: string,
    currentQuestion: string,
    options: ExtractionOption[],
    context?: string
): Promise<ExtractionResult> {
    
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    
    // Fallback to pattern matching if no API key
    if (!LOVABLE_API_KEY) {
        logger.warn('[AI-Extractor] LOVABLE_API_KEY not found, using pattern matching fallback');
        return fallbackPatternMatch(userMessage, options);
    }

    const prompt = `You are PRISM, a warm and helpful Nigerian tax assistant. Extract the user's choice from their response.

CURRENT ONBOARDING QUESTION: "${currentQuestion}"

AVAILABLE OPTIONS:
${options.map((o, i) => `${i + 1}. ${o.value}${o.description ? ` - ${o.description}` : ''} (keywords: ${o.keywords.join(', ')})`).join('\n')}

USER RESPONSE: "${userMessage}"

${context ? `CONTEXT: User is a ${context}` : ''}

INTERPRETATION RULES:
- Accept number inputs (1, 2, 3) directly
- Match keywords flexibly (allow typos, slang)
- Understand Nigerian expressions and pidgin
- Look for semantic meaning, not exact matches
- If truly unclear, set needsClarification to true

RESPOND WITH VALID JSON ONLY:
{
  "selectedValue": "<exact option value string or null if unclear>",
  "confidence": <0.0 to 1.0>,
  "reasoning": "<brief 10-word max explanation>",
  "needsClarification": <true/false>
}`;

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
                temperature: 0.1,
                max_tokens: 200
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`[AI-Extractor] API error: ${response.status} - ${errorText}`);
            return fallbackPatternMatch(userMessage, options);
        }

        const data = await response.json() as { choices?: { message?: { content?: string } }[] };
        const content = data.choices?.[0]?.message?.content || '';
        
        // Parse JSON response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            logger.warn('[AI-Extractor] No JSON found in response, using fallback');
            return fallbackPatternMatch(userMessage, options);
        }

        const parsed = JSON.parse(jsonMatch[0]);
        
        logger.info(`[AI-Extractor] Extracted: ${parsed.selectedValue} (confidence: ${parsed.confidence})`);
        
        return {
            selectedValue: parsed.selectedValue || null,
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
            reasoning: parsed.reasoning || '',
            needsClarification: parsed.needsClarification ?? false
        };

    } catch (error) {
        logger.error('[AI-Extractor] Error:', error);
        return fallbackPatternMatch(userMessage, options);
    }
}

/**
 * Fallback pattern matching when AI is unavailable
 */
function fallbackPatternMatch(message: string, options: ExtractionOption[]): ExtractionResult {
    const messageLower = message.toLowerCase().trim();
    
    // Check for number responses first
    for (let i = 0; i < options.length; i++) {
        if (messageLower === String(i + 1)) {
            return {
                selectedValue: options[i].value,
                confidence: 1.0,
                reasoning: `Direct number match: ${i + 1}`,
                needsClarification: false
            };
        }
    }

    // Check for keyword matches
    for (const option of options) {
        for (const keyword of option.keywords) {
            if (messageLower.includes(keyword.toLowerCase())) {
                return {
                    selectedValue: option.value,
                    confidence: 0.8,
                    reasoning: `Keyword match: "${keyword}"`,
                    needsClarification: false
                };
            }
        }
    }

    // No match found
    return {
        selectedValue: null,
        confidence: 0,
        reasoning: 'No pattern match found',
        needsClarification: true
    };
}

/**
 * Option definitions for each onboarding step
 */
export const ONBOARDING_OPTIONS = {
    entity_type: [
        { value: 'business', keywords: ['business', 'company', 'owner', 'run', 'enterprise', '1'], description: 'I run a registered or informal business' },
        { value: 'individual', keywords: ['employ', 'individual', 'salary', 'job', 'work for', '2'], description: 'I earn a salary' },
        { value: 'self_employed', keywords: ['self', 'freelance', 'contractor', 'own boss', 'hustle', '3'], description: 'I work for myself' }
    ],
    
    business_stage: [
        { value: 'pre_revenue', keywords: ['pre', 'idea', 'planning', 'setting', 'start', '1'], description: 'Still planning or setting up' },
        { value: 'early', keywords: ['early', 'started', 'first', 'just', 'new', '2'], description: 'Just started, first customers' },
        { value: 'growing', keywords: ['grow', 'scaling', 'expand', '3'], description: 'Scaling operations' },
        { value: 'established', keywords: ['established', 'mature', 'steady', 'stable', '4'], description: 'Mature business' }
    ],
    
    account_setup: [
        { value: 'mixed', keywords: ['mixed', 'same', 'one', '1'], description: 'Same account for personal & business' },
        { value: 'separate', keywords: ['separate', 'different', '2'], description: 'Different accounts' },
        { value: 'multiple', keywords: ['multiple', 'many', 'several', '3'], description: 'Several business accounts' }
    ],
    
    freelancer_account: [
        { value: 'separate', keywords: ['yes', 'separate', 'apart', '1'], description: 'Separate account for work' },
        { value: 'mixed', keywords: ['no', 'one', 'everything', 'same', '2'], description: 'Everything in one account' },
        { value: 'mixed', keywords: ['kinda', 'try', 'sometimes', 'mostly', '3'], description: 'Try to but not always' }
    ],
    
    capital_source: [
        { value: 'family', keywords: ['family', 'friend', 'personal', 'loved', '1'], description: 'Support from loved ones' },
        { value: 'investors', keywords: ['investor', 'vc', 'angel', 'venture', '2'], description: 'VC, angel, or institutional' },
        { value: 'loan', keywords: ['loan', 'credit', 'bank', 'borrow', '3'], description: 'Bank loans or credit' },
        { value: 'bootstrapped', keywords: ['bootstrap', 'self', 'own', 'saving', 'myself', '4'], description: 'Own savings and revenue' },
        { value: 'grant', keywords: ['grant', 'award', 'government', '5'], description: 'Government or organization grant' }
    ],
    
    insight_frequency: [
        { value: 'daily', keywords: ['daily', 'every day', 'everyday', '1'], description: 'Updates every day' },
        { value: 'weekly', keywords: ['weekly', 'week', 'once a week', '2'], description: 'Summary once a week' },
        { value: 'monthly', keywords: ['monthly', 'month', 'once a month', '3'], description: 'Monthly updates' },
        { value: 'never', keywords: ['only', 'urgent', 'needed', 'when', '4'], description: 'Only when urgent' }
    ]
};
