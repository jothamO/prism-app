import fetch from 'node-fetch';

export interface Intent {
    name: string;
    confidence: number;
    entities: Record<string, any>;
    reasoning?: string;
}

const INTENT_DEFINITIONS = `You are analyzing user messages for PRISM, a Nigerian tax assistant bot compliant with Tax Act 2025.

Identify the user's intent from these options:

1. get_transaction_summary
   - User wants to see transactions/spending
   - Entities: timeframe (string), category (string), project (string), amount_range (object)
   - Examples: "show me my spending", "what did I buy last week", "house project expenses"

2. get_tax_relief_info
   - User wants tax relief/deduction information
   - Entities: relief_type (rent|mortgage|pension|startup|small_business)
   - Examples: "how much rent relief can I claim", "tell me about pension deductions", "am I eligible for startup exemption"

3. upload_receipt
   - User mentions sending/uploading receipt
   - Entities: expense_type (string), merchant (string)
   - Examples: "I'll send the receipt", "here's my cement invoice", "uploading shoprite bill"

4. categorize_expense
   - User wants to classify/tag an expense
   - Entities: project (string), category (string), amount (number), is_personal (boolean)
   - Examples: "tag this to the house project", "is this a business expense", "categorize as office supplies"

5. get_tax_calculation
   - User wants tax amount calculated
   - Entities: income_type (salary|business|interest), amount (number)
   - Examples: "how much tax will I pay", "calculate my VAT", "what's my CIT for this year"

6. set_reminder
   - User wants tax filing reminder
   - Entities: reminder_type (vat|wht|cit|pit), date (string)
   - Examples: "remind me to file VAT", "when is CIT due", "set reminder for tax deadline"

7. connect_bank
   - User wants to link bank account
   - Entities: bank_name (string)
   - Examples: "connect my GTBank account", "link my bank", "add access bank"

8. artificial_transaction_warning
   - Suspicious expense categorization detected (Section 191 NTA 2025)
   - Entities: item (string), claimed_category (string)
   - Examples: User trying to tag TV/fridge/personal item as business expense

9. verify_identity
   - User wants to verify identity documents (NIN, TIN, BVN, CAC)
   - Entities: id_type (NIN|TIN|BVN|CAC), id_number (string)
   - Examples: "verify my NIN", "check TIN 12345678901", "validate my CAC RC123456"
   
10. general_query
   - General tax questions or other queries
   - Examples: "what is EMTL", "explain Section 32", "how does PRISM work", "what changes are coming in March"

Respond in JSON format:
{
  "intent": "intent_name",
  "confidence": 0.0-1.0,
  "entities": {},
  "reasoning": "brief explanation"
}`;

export class NLUService {
    private lovableApiKey = process.env.LOVABLE_API_KEY;

    /**
     * Classify user intent using Gemini 3 Flash (via Lovable AI)
     */
    async classifyIntent(userMessage: string, context?: {
        userId?: string;
        recentMessages?: string[];
        conversationState?: string;
    }): Promise<Intent> {
        if (!this.lovableApiKey) {
            console.warn('LOVABLE_API_KEY not set, using fallback intent detection');
            return this.fallbackIntentDetection(userMessage);
        }

        try {
            const contextInfo = [];
            if (context?.conversationState) {
                contextInfo.push(`Current conversation state: ${context.conversationState}`);
            }
            if (context?.recentMessages?.length) {
                contextInfo.push(`Recent messages: ${context.recentMessages.slice(-3).join(', ')}`);
            }

            const prompt = `${INTENT_DEFINITIONS}

${contextInfo.length ? contextInfo.join('\n') + '\n\n' : ''}User Message: "${userMessage}"

Classify this message and respond with JSON only.`;

            const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.lovableApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'google/gemini-2.5-flash', // Aligned with Gateway model
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an intent classifier for a Nigerian tax bot. Always respond with valid JSON.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    response_format: { type: 'json_object' },
                    temperature: 0.3 // Lower for consistent classification
                })
            });

            if (!response.ok) {
                const error = await response.text();
                console.error('Gemini API error:', response.status, error);
                return this.fallbackIntentDetection(userMessage);
            }

            const data: any = await response.json();
            const content = data.choices?.[0]?.message?.content;

            if (!content) {
                console.error('No content in Gemini response');
                return this.fallbackIntentDetection(userMessage);
            }

            // Parse JSON response
            const result = JSON.parse(content);

            return {
                name: result.intent || 'general_query',
                confidence: result.confidence || 0.5,
                entities: result.entities || {},
                reasoning: result.reasoning
            };

        } catch (error) {
            console.error('NLU classification error:', error);
            return this.fallbackIntentDetection(userMessage);
        }
    }

    /**
     * Fallback rule-based intent detection (when AI unavailable)
     */
    private fallbackIntentDetection(userMessage: string): Intent {
        const lowerMsg = userMessage.toLowerCase();

        // Transaction queries
        if (lowerMsg.match(/\b(show|see|view|list|get)\b.*\b(transaction|spending|expense|purchase)/i) ||
            lowerMsg.match(/\b(how much|what did i)\b.*\b(spend|buy|paid)/i)) {
            return {
                name: 'get_transaction_summary',
                confidence: 0.7,
                entities: {},
                reasoning: 'Keyword match: transaction/spending query'
            };
        }

        // Tax relief queries
        if (lowerMsg.match(/\b(rent|mortgage|pension|startup|small business)\b.*\b(relief|deduction|exemption)/i) ||
            lowerMsg.match(/\b(how much|what)\b.*\b(save|claim|deduct)/i)) {
            return {
                name: 'get_tax_relief_info',
                confidence: 0.7,
                entities: {},
                reasoning: 'Keyword match: tax relief query'
            };
        }

        // Receipt upload
        if (lowerMsg.match(/\b(send|upload|attach|here is|here's)\b.*\b(receipt|invoice)/i)) {
            return {
                name: 'upload_receipt',
                confidence: 0.8,
                entities: {},
                reasoning: 'Keyword match: receipt upload'
            };
        }

        // Categorization
        if (lowerMsg.match(/\b(tag|categorize|classify|assign)\b.*\b(to|as|under)/i) ||
            lowerMsg.match(/\b(is this|was this)\b.*\b(business|personal|project)/i)) {
            return {
                name: 'categorize_expense',
                confidence: 0.7,
                entities: {},
                reasoning: 'Keyword match: categorization request'
            };
        }

        // Tax calculation
        if (lowerMsg.match(/\b(calculate|compute|how much)\b.*\b(tax|vat|cit|pit)/i)) {
            return {
                name: 'get_tax_calculation',
                confidence: 0.7,
                entities: {},
                reasoning: 'Keyword match: tax calculation'
            };
        }

        // Identity verification (aligned with Gateway)
        if (lowerMsg.match(/\b(verify|validate|check)\b.*\b(nin|bvn|tin|cac)/i) ||
            lowerMsg.match(/\b(nin|bvn|tin|cac)\b.*\b(verify|validate|check)/i)) {
            return {
                name: 'verify_identity',
                confidence: 0.85,
                entities: {
                    id_type: /nin/i.test(lowerMsg) ? 'NIN' : 
                             /bvn/i.test(lowerMsg) ? 'BVN' : 
                             /tin/i.test(lowerMsg) ? 'TIN' : 
                             /cac/i.test(lowerMsg) ? 'CAC' : undefined
                },
                reasoning: 'Keyword match: identity verification'
            };
        }

        // Bank connection
        if (lowerMsg.match(/\b(connect|link|add)\b.*\b(bank|account)/i)) {
            return {
                name: 'connect_bank',
                confidence: 0.8,
                entities: {},
                reasoning: 'Keyword match: bank connection'
            };
        }
        return {
            name: 'general_query',
            confidence: 0.5,
            entities: {},
            reasoning: 'No specific intent pattern matched'
        };
    }

    /**
     * Check if expense categorization is suspicious (Section 191 compliance)
     */
    async detectArtificialTransaction(
        item: string,
        claimedCategory: string,
        userContext?: { entity_type: string }
    ): Promise<{ is_suspicious: boolean; warning?: string }> {
        const lowerItem = item.toLowerCase();

        // Personal items that shouldn't be business expenses
        const personalItems = [
            'tv', 'television', 'fridge', 'refrigerator', 'couch', 'sofa',
            'bed', 'mattress', 'clothing', 'shoes', 'jewelry', 'watch',
            'phone' // Unless telecom business
        ];

        const isSuspicious = personalItems.some(personal => lowerItem.includes(personal));

        if (isSuspicious && claimedCategory.toLowerCase().includes('business')) {
            return {
                is_suspicious: true,
                warning: `⚠️ *Tax Compliance Warning* (Section 191)\n\n` +
                    `Claiming "${item}" as a business expense may be viewed as an *artificial transaction* by FIRS.\n\n` +
                    `This is typically a personal expense. Are you sure you want to proceed?`
            };
        }

        return { is_suspicious: false };
    }
}

export const nluService = new NLUService();
