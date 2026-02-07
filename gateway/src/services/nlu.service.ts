/**
 * Gateway NLU Service
 * Natural Language Understanding for intent classification and entity extraction
 * Uses Lovable AI (google/gemini-2.5-flash) with fallback to rule-based detection
 */

import { aiClient } from '../utils/ai-client';
import { logger } from '../utils/logger';

// Intent types supported by PRISM
export type IntentType =
    | 'get_transaction_summary'
    | 'get_tax_relief_info'
    | 'upload_receipt'
    | 'categorize_expense'
    | 'get_tax_calculation'
    | 'set_reminder'
    | 'connect_bank'
    | 'verify_identity'
    | 'onboarding'
    | 'general_query';

export interface NLUIntent {
    name: IntentType;
    confidence: number;
    entities: Record<string, unknown>;
    reasoning?: string;
}

export interface NLUResult {
    intent: NLUIntent;
    source: 'ai' | 'fallback';
    artificialTransactionCheck?: {
        isSuspicious: boolean;
        warning?: string;
        actReference?: string;
    };
}

export interface ConversationContext {
    recentMessages?: Array<{ role: string; content: string }>;
    userId?: string;
    entityType?: 'business' | 'individual';
}

// Intent definitions for AI classification
const INTENT_DEFINITIONS = `
Available intents:

1. get_transaction_summary - User wants transaction history, spending summary, or bank activity
   Entities: period (month, week, day), account_type
   Examples: "show my transactions", "what did I spend last month", "summary of December"

2. get_tax_relief_info - User asking about tax deductions, exemptions, reliefs, or allowances
   Entities: relief_type (pension, housing, children, medical, nhf, nhis)
   Examples: "what deductions can I claim", "tax relief for children", "am I exempt"

3. upload_receipt - User wants to upload, send, or submit a receipt or invoice
   Entities: receipt_type (invoice, receipt, expense)
   Examples: "I want to upload a receipt", "here's my invoice", "submit expense"

4. categorize_expense - User wants to classify or categorize a transaction or expense
   Entities: category, amount, description
   Examples: "categorize this as transport", "is this a business expense", "classify my purchase"

5. get_tax_calculation - User wants to calculate VAT, income tax, or any tax amount
   Entities: tax_type (vat, income, pension, salary, freelance), amount, period, expenses
   Examples: "calculate VAT on 50000", "how much tax do I owe", "what's my tax bill", "tax 10000000"

6. set_reminder - User wants to set up a reminder for tax filing or payment deadlines
   Entities: reminder_type, due_date, tax_type
   Examples: "remind me to file VAT", "set deadline reminder", "when is my tax due"

7. connect_bank - User wants to link their bank account for automatic transaction tracking
   Entities: bank_name
   Examples: "connect my bank", "link account", "add my GTBank"

8. verify_identity - User wants to verify their NIN, TIN, or CAC registration
   Entities: id_type (nin, tin, cac, bvn), id_value
   Examples: "verify my TIN", "check my NIN", "validate my CAC number"

9. onboarding - User is starting fresh or wants to set up their account
   Examples: "start", "get started", "begin", "setup", "onboard"

10. general_query - General questions about tax, the system, or conversation that doesn't fit other intents
    Examples: "hello", "what can you do", "help me understand VAT"
`;

// Personal items that might be artificial transactions (Section 191)
const PERSONAL_ITEM_PATTERNS = [
    { pattern: /\b(playstation|xbox|nintendo|gaming|ps5|ps4)\b/i, item: 'gaming console' },
    { pattern: /\b(vacation|holiday|trip|travel)\b.*\b(personal|family)\b/i, item: 'personal vacation' },
    { pattern: /\b(groceries|supermarket|food shopping)\b/i, item: 'personal groceries' },
    { pattern: /\b(gym|fitness|workout|membership)\b/i, item: 'personal fitness' },
    { pattern: /\b(birthday|anniversary|wedding)\b/i, item: 'personal celebration' },
    { pattern: /\b(netflix|spotify|streaming|disney)\b/i, item: 'personal entertainment subscription' },
    { pattern: /\b(personal|family)\s+(car|vehicle|suv)\b/i, item: 'personal vehicle' },
    { pattern: /\b(children|kids)\s+(school|tuition)\b/i, item: 'personal education' },
];

export class NLUService {
    constructor() { }

    /**
     * Classify user intent using AI or fallback
     */
    async classifyIntent(message: string, context?: ConversationContext): Promise<NLUResult> {
        // Try AI classification first
        try {
            const aiResult = await this.classifyWithAI(message, context);
            if (aiResult) {
                // Check for artificial transaction if relevant
                const artificialCheck = this.checkArtificialTransaction(
                    message,
                    aiResult.entities
                );

                return {
                    intent: aiResult,
                    source: 'ai',
                    artificialTransactionCheck: artificialCheck
                };
            }
        } catch (error) {
            logger.error('[NLU] AI classification failed, using fallback:', error);
        }

        // Fallback to rule-based
        const fallbackResult = this.fallbackIntentDetection(message);
        const artificialCheck = this.checkArtificialTransaction(
            message,
            fallbackResult.entities
        );

        return {
            intent: fallbackResult,
            source: 'fallback',
            artificialTransactionCheck: artificialCheck
        };
    }

    /**
     * AI-powered intent classification using centralized AIClient (fast tier)
     */
    private async classifyWithAI(message: string, context?: ConversationContext): Promise<NLUIntent | null> {
        try {
            // Build context string
            const contextString = context?.recentMessages?.length
                ? `Recent conversation:\n${context.recentMessages.map(m => `${m.role}: ${m.content}`).join('\n')}\n\n`
                : '';

            const entityTypeHint = context?.entityType
                ? `The user is a ${context.entityType === 'business' ? 'business owner' : 'individual taxpayer'}.\n`
                : '';

            const systemPrompt = `You are an NLU intent classifier for PRISM, a Nigerian tax assistant.

${INTENT_DEFINITIONS}

${entityTypeHint}

Analyze the user's message and return a JSON object with:
- name: the intent name (one of the 10 listed above)
- confidence: a number between 0 and 1 indicating how confident you are
- entities: any extracted entities as key-value pairs (amounts as numbers, periods as strings)
- reasoning: brief explanation of why you chose this intent

Extract Nigerian-specific entities:
- Amounts: Parse ₦ or N prefix, commas (e.g., "50,000" → 50000)
- Periods: "last month", "December", "Q4 2024"
- Tax types: VAT, PAYE, CIT, income tax, pension
- ID numbers: TIN (10+ digits), NIN (11 digits), CAC/RC numbers

Be precise. If the message is a greeting or unclear, use "general_query".
Consider the conversation context when available.

Return ONLY valid JSON, no markdown or explanation.`;

            const responseText = await aiClient.chat({
                tier: 'fast',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `${contextString}Current message: "${message}"` }
                ]
            });

            if (!responseText) return null;

            const parsed = JSON.parse(responseText.match(/\{[\s\S]*\}/)?.[0] || '{}');

            return {
                name: this.validateIntentName(parsed.name),
                confidence: Math.min(1, Math.max(0, parsed.confidence || 0.8)),
                entities: parsed.entities || {},
                reasoning: parsed.reasoning
            };
        } catch (error) {
            logger.error('[NLU] AI classification error:', error);
            return null;
        }
    }

    /**
     * Fallback rule-based intent detection
     */
    private fallbackIntentDetection(message: string): NLUIntent {
        const lower = message.toLowerCase().trim();

        // Define patterns for each intent
        const patterns: Array<{
            intent: IntentType;
            patterns: RegExp[];
            confidence: number;
        }> = [
                {
                    intent: 'onboarding',
                    patterns: [
                        /^\/?(start|onboard|setup|get started|begin)$/i,
                        /^(hi|hello|hey)\s*$/i
                    ],
                    confidence: 0.9
                },
                {
                    intent: 'get_tax_calculation',
                    patterns: [
                        /^(vat|tax|salary|pension|freelance)\s+[₦n]?\d/i,
                        /calculate\s+(vat|tax|income)/i,
                        /how\s+much\s+(vat|tax)/i,
                        /\btax\s+on\s+\d+/i
                    ],
                    confidence: 0.85
                },
                {
                    intent: 'get_transaction_summary',
                    patterns: [
                        /\b(transactions?|spending|spent|summary|history|statement)\b/i,
                        /\b(show|view|see)\s+(my\s+)?(money|account|bank)/i,
                        /what\s+did\s+i\s+spend/i
                    ],
                    confidence: 0.8
                },
                {
                    intent: 'get_tax_relief_info',
                    patterns: [
                        /\b(relief|deduct|exempt|allowance)\b/i,
                        /\b(can\s+i\s+claim|what\s+deductions?)\b/i,
                        /\bsection\s+\d+\b/i,
                        /\b(nhf|nhis|pension)\s+contribution/i
                    ],
                    confidence: 0.8
                },
                {
                    intent: 'upload_receipt',
                    patterns: [
                        /\b(upload|send|submit)\s+(receipt|invoice|document)/i,
                        /\breceipt\b.*\b(upload|send|here)/i,
                        /\binvoice\b.*\b(upload|send|here)/i
                    ],
                    confidence: 0.8
                },
                {
                    intent: 'categorize_expense',
                    patterns: [
                        /\b(categorize|classify|category)\b/i,
                        /\bis\s+this\s+(business|personal|deductible)\b/i,
                        /\bwhat\s+type\s+of\s+expense\b/i
                    ],
                    confidence: 0.75
                },
                {
                    intent: 'set_reminder',
                    patterns: [
                        /\b(remind|reminder|deadline|due\s+date)\b/i,
                        /\bwhen\s+(is|should)\s+(my|the)\s+(tax|vat|filing)/i
                    ],
                    confidence: 0.75
                },
                {
                    intent: 'connect_bank',
                    patterns: [
                        /\b(connect|link|add)\s+(my\s+)?(bank|account)/i,
                        /\b(gtbank|zenith|access|uba|first\s+bank|sterling|fcmb)\b/i
                    ],
                    confidence: 0.75
                },
                {
                    intent: 'verify_identity',
                    patterns: [
                        /\b(verify|validate|check)\s+(my\s+)?(nin|tin|cac|bvn)/i,
                        /\bmy\s+(nin|tin|cac)\s+is\b/i,
                        /\b(nin|tin|cac)\s*[:\s]+\d+/i
                    ],
                    confidence: 0.8
                }
            ];

        // Check each pattern
        for (const { intent, patterns: regexes, confidence } of patterns) {
            for (const regex of regexes) {
                if (regex.test(lower)) {
                    const entities = this.extractEntities(message, intent);
                    return {
                        name: intent,
                        confidence,
                        entities
                    };
                }
            }
        }

        // Default to general_query
        return {
            name: 'general_query',
            confidence: 0.5,
            entities: {}
        };
    }

    /**
     * Extract entities from message based on intent
     */
    private extractEntities(message: string, intent: IntentType): Record<string, unknown> {
        const entities: Record<string, unknown> = {};
        const lower = message.toLowerCase();

        // Extract amounts (handle Nigerian formats)
        const amountMatch = message.match(/[₦n]?\s?(\d[\d,]*(?:\.\d{2})?)/i);
        if (amountMatch) {
            entities.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
        }

        // Extract second amount for expenses (freelance X expenses Y)
        const expenseMatch = message.match(/expenses?\s+[₦n]?(\d[\d,]*)/i);
        if (expenseMatch) {
            entities.expenses = parseFloat(expenseMatch[1].replace(/,/g, ''));
        }

        // Extract period references
        if (/last\s+month/i.test(lower)) entities.period = 'last_month';
        else if (/this\s+month/i.test(lower)) entities.period = 'current_month';
        else if (/last\s+week/i.test(lower)) entities.period = 'last_week';
        else if (/this\s+year/i.test(lower)) entities.period = 'current_year';
        else if (/last\s+year/i.test(lower)) entities.period = 'last_year';

        // Extract specific months
        const monthMatch = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/);
        if (monthMatch) {
            entities.period = monthMatch[1];
        }

        // Extract tax types
        if (/\bvat\b/i.test(lower)) entities.tax_type = 'vat';
        else if (/\bincome\s+tax\b/i.test(lower)) entities.tax_type = 'income';
        else if (/\bpension\b/i.test(lower)) entities.tax_type = 'pension';
        else if (/\bsalary\b/i.test(lower)) entities.tax_type = 'salary';
        else if (/\bfreelance\b/i.test(lower)) entities.tax_type = 'freelance';
        else if (/\bpaye\b/i.test(lower)) entities.tax_type = 'paye';

        // Extract ID types and values
        const ninMatch = message.match(/\bNIN[:\s]*(\d{11})/i);
        if (ninMatch) {
            entities.id_type = 'nin';
            entities.id_value = ninMatch[1];
        }

        const tinMatch = message.match(/\bTIN[:\s]*(\d{10,})/i);
        if (tinMatch) {
            entities.id_type = 'tin';
            entities.id_value = tinMatch[1];
        }

        const cacMatch = message.match(/\b(?:CAC|RC)[:\s]*(\d+)/i);
        if (cacMatch) {
            entities.id_type = 'cac';
            entities.id_value = cacMatch[1];
        }

        // Extract description after amount
        const descMatch = message.match(/\d[\d,]*\s+(.+)$/i);
        if (descMatch && intent === 'get_tax_calculation') {
            entities.description = descMatch[1].trim();
        }

        // Extract relief types
        const reliefTypes = ['pension', 'nhf', 'nhis', 'housing', 'children', 'medical', 'insurance', 'rent'];
        for (const relief of reliefTypes) {
            if (lower.includes(relief)) {
                entities.relief_type = relief;
                break;
            }
        }

        // Extract bank names
        const bankNames = ['gtbank', 'zenith', 'access', 'uba', 'first bank', 'sterling', 'fcmb', 'fidelity', 'union', 'stanbic'];
        for (const bank of bankNames) {
            if (lower.includes(bank)) {
                entities.bank_name = bank;
                break;
            }
        }

        return entities;
    }

    /**
     * Check for artificial transaction (Section 191 NTA 2025)
     */
    private checkArtificialTransaction(
        message: string,
        entities: Record<string, unknown>
    ): { isSuspicious: boolean; warning?: string; actReference?: string } | undefined {
        const lower = message.toLowerCase();

        // Check for personal items being claimed as business
        for (const { pattern, item } of PERSONAL_ITEM_PATTERNS) {
            if (pattern.test(lower)) {
                // Check if context suggests business claim
                if (/\b(business|deduct|claim|expense|write[\s-]?off)\b/i.test(lower)) {
                    return {
                        isSuspicious: true,
                        warning: `⚠️ SECTION 191 ALERT: "${item}" appears to be a personal expense being claimed as business deductible. This may constitute an artificial arrangement to avoid tax.`,
                        actReference: 'Section 191 NTA 2025 - Anti-Avoidance'
                    };
                }
            }
        }

        // Check if categorization intent with suspicious items
        if (entities.category === 'business' || entities.category === 'deductible') {
            for (const { pattern, item } of PERSONAL_ITEM_PATTERNS) {
                if (pattern.test(lower)) {
                    return {
                        isSuspicious: true,
                        warning: `⚠️ SECTION 191 ALERT: "${item}" appears to be a personal expense being claimed as business deductible.`,
                        actReference: 'Section 191 NTA 2025 - Anti-Avoidance'
                    };
                }
            }
        }

        return undefined;
    }

    /**
     * Validate and normalize intent name
     */
    private validateIntentName(name: string): IntentType {
        const validIntents: IntentType[] = [
            'get_transaction_summary',
            'get_tax_relief_info',
            'upload_receipt',
            'categorize_expense',
            'get_tax_calculation',
            'set_reminder',
            'connect_bank',
            'verify_identity',
            'onboarding',
            'general_query'
        ];

        if (validIntents.includes(name as IntentType)) {
            return name as IntentType;
        }

        return 'general_query';
    }
}

// Export singleton instance
export const nluService = new NLUService();
