import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { nigerianTransactionService, NigerianFlags, TaxImplications } from './nigerian-transaction.service';

export interface EnhancedClassificationResult {
    classification: string;
    confidence: number;
    reasoning?: string;
    reason?: string;
    needsConfirmation?: boolean;
    nigerianFlags?: NigerianFlags;
    taxImplications?: TaxImplications;
    transactionType?: string;
}

export class ClassifierService {
    private claude: Anthropic | null = null;
    private openai: OpenAI | null = null;
    private provider: string;

    constructor() {
        this.provider = process.env.AI_PROVIDER || 'claude';

        if (process.env.CLAUDE_API_KEY) {
            this.claude = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
        }

        if (process.env.OPENAI_API_KEY) {
            this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        }
    }

    async classify(txn: any): Promise<EnhancedClassificationResult> {
        const narration = txn.narration || txn.description || '';
        const isCredit = txn.credit > 0 || txn.type === 'credit';
        
        // Get Nigerian-specific context
        const nigerianContext = nigerianTransactionService.getEnhancedContext(
            narration,
            isCredit,
            txn.amount || txn.credit || txn.debit
        );

        // Tier 1: Rule-based (instant, free)
        const ruleResult = this.ruleBasedClassification(txn, nigerianContext.nigerianFlags);
        if (ruleResult.confidence > 0.90) {
            return {
                ...ruleResult,
                nigerianFlags: nigerianContext.nigerianFlags,
                taxImplications: nigerianContext.taxImplications,
                transactionType: nigerianContext.transactionTypeDescription
            };
        }

        // Tier 2: Primary AI with Nigerian context
        try {
            const aiResult = await this.primaryAI(txn, nigerianContext);
            if (aiResult.confidence > 0.75) {
                return {
                    ...aiResult,
                    nigerianFlags: nigerianContext.nigerianFlags,
                    taxImplications: nigerianContext.taxImplications,
                    transactionType: nigerianContext.transactionTypeDescription
                };
            }

            // If confidence is low, try fallback
            console.log('Low confidence from primary AI, trying fallback...');
            const fallbackResult = await this.fallbackAI(txn, nigerianContext);
            if (fallbackResult.confidence > aiResult.confidence) {
                return {
                    ...fallbackResult,
                    nigerianFlags: nigerianContext.nigerianFlags,
                    taxImplications: nigerianContext.taxImplications,
                    transactionType: nigerianContext.transactionTypeDescription
                };
            }

            return {
                ...aiResult,
                nigerianFlags: nigerianContext.nigerianFlags,
                taxImplications: nigerianContext.taxImplications,
                transactionType: nigerianContext.transactionTypeDescription
            };
        } catch (error) {
            console.warn('Primary AI failed, switching to fallback:', error);
            try {
                // Tier 3: Fallback AI
                const fallbackResult = await this.fallbackAI(txn, nigerianContext);
                return {
                    ...fallbackResult,
                    nigerianFlags: nigerianContext.nigerianFlags,
                    taxImplications: nigerianContext.taxImplications,
                    transactionType: nigerianContext.transactionTypeDescription
                };
            } catch (fallbackError) {
                console.error('All AI classification failed:', fallbackError);
                // Tier 4: Human review
                return {
                    classification: 'needs_review',
                    confidence: 0,
                    reason: 'AI systems failed',
                    nigerianFlags: nigerianContext.nigerianFlags,
                    taxImplications: nigerianContext.taxImplications,
                    transactionType: nigerianContext.transactionTypeDescription
                };
            }
        }
    }

    private ruleBasedClassification(txn: any, nigerianFlags: NigerianFlags) {
        const narration = (txn.narration || txn.description || '').toLowerCase();

        // EMTL/Stamp Duty - always expense
        if (nigerianFlags.is_emtl) {
            return {
                classification: 'expense',
                confidence: 0.98,
                reason: 'EMTL levy detected',
                needsConfirmation: false
            };
        }
        if (nigerianFlags.is_stamp_duty) {
            return {
                classification: 'expense',
                confidence: 0.98,
                reason: 'Stamp duty detected',
                needsConfirmation: false
            };
        }

        // Bank charges
        if (nigerianFlags.is_nigerian_bank_charge) {
            return {
                classification: 'expense',
                confidence: 0.95,
                reason: 'Nigerian bank charge detected',
                needsConfirmation: false
            };
        }

        // POS transactions
        if (nigerianFlags.is_pos_transaction) {
            const isCredit = txn.credit > 0 || txn.type === 'credit';
            return {
                classification: isCredit ? 'sale' : 'expense',
                confidence: 0.88,
                reason: isCredit ? 'POS terminal credit - customer payment' : 'POS terminal charge',
                needsConfirmation: txn.amount > 500000
            };
        }

        // Mobile money
        if (nigerianFlags.is_mobile_money) {
            return {
                classification: 'sale',
                confidence: 0.75,
                reason: `Mobile money payment via ${nigerianFlags.mobile_money_provider}`,
                needsConfirmation: true
            };
        }

        // Non-sale keywords
        const nonSaleKeywords = ['loan', 'disbursement', 'salary', 'atm', 'withdrawal',
            'netflix', 'dstv', 'airtime', 'transfer from self'];

        for (const keyword of nonSaleKeywords) {
            if (narration.includes(keyword)) {
                return {
                    classification: 'non_revenue',
                    confidence: 0.90,
                    reason: `Contains keyword: ${keyword}`,
                    needsConfirmation: txn.amount > 500000
                };
            }
        }

        // Sale keywords
        const saleKeywords = ['pos payment', 'pos terminal', 'invoice payment'];

        for (const keyword of saleKeywords) {
            if (narration.includes(keyword)) {
                return {
                    classification: 'sale',
                    confidence: 0.95,
                    reason: `Contains keyword: ${keyword}`,
                    needsConfirmation: txn.amount > 1000000
                };
            }
        }

        return { confidence: 0, classification: 'unknown' };
    }

    private async primaryAI(txn: any, nigerianContext: any) {
        if (this.provider === 'claude' && this.claude) {
            return this.callClaude(txn, nigerianContext);
        } else if (this.provider === 'openai' && this.openai) {
            return this.callOpenAI(txn, nigerianContext);
        }
        throw new Error('Primary provider not configured');
    }

    private async fallbackAI(txn: any, nigerianContext: any) {
        if (this.provider === 'claude' && this.openai) {
            return this.callOpenAI(txn, nigerianContext);
        } else if (this.provider === 'openai' && this.claude) {
            return this.callClaude(txn, nigerianContext);
        }
        throw new Error('No fallback provider configured');
    }

    private async callClaude(txn: any, nigerianContext: any) {
        const prompt = this.getPrompt(txn, nigerianContext);
        const response = await this.claude!.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 8000,
            messages: [{ role: 'user', content: prompt }]
        });
        const textContent = response.content[0].type === 'text' ? response.content[0].text : '';
        return JSON.parse(textContent);
    }

    private async callOpenAI(txn: any, nigerianContext: any) {
        const prompt = this.getPrompt(txn, nigerianContext);
        const response = await this.openai!.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are a helpful financial assistant for Nigerian transactions. Return only JSON." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        });
        const content = response.choices[0].message.content || '{}';
        return JSON.parse(content);
    }

    private getPrompt(txn: any, nigerianContext: any) {
        const flags = nigerianContext.nigerianFlags;
        const txnType = nigerianContext.transactionTypeDescription;
        
        return `Classify this Nigerian bank transaction for VAT purposes.

Transaction:
- Amount: ₦${(txn.amount || 0).toLocaleString()}
- Narration: "${txn.narration || txn.description}"
- Date: ${txn.date}
- Transaction Type: ${txnType}
${flags.is_foreign_currency ? `- Foreign Currency: ${flags.foreign_currency}` : ''}
${flags.is_mobile_money ? `- Mobile Money Provider: ${flags.mobile_money_provider}` : ''}

Nigerian Context:
- USSD: ${flags.is_ussd_transaction ? 'Yes' : 'No'}
- POS: ${flags.is_pos_transaction ? 'Yes' : 'No'}
- Mobile Money: ${flags.is_mobile_money ? 'Yes' : 'No'}
- Bank Charge: ${flags.is_nigerian_bank_charge ? 'Yes' : 'No'}
- EMTL: ${flags.is_emtl ? 'Yes' : 'No'}

Context: Nigerian retail/electrical business.

Classify as:
- "sale" (customer payment - VAT applies)
- "loan" (loan disbursement - no VAT)
- "capital" (investment - no VAT)
- "refund" (money back - no VAT)
- "personal" (personal transfer - no VAT)
- "expense" (business expense - input VAT)

Return ONLY JSON:
{
  "classification": "...",
  "confidence": 0.XX,
  "reasoning": "brief explanation",
  "needsConfirmation": true/false
}`;
    }
}

export const classifierService = new ClassifierService();
