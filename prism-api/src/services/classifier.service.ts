import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

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

    async classify(txn: any) {
        // Tier 1: Rule-based (instant, free)
        const ruleResult = this.ruleBasedClassification(txn);
        if (ruleResult.confidence > 0.90) {
            return ruleResult;
        }

        // Tier 2: Primary AI
        try {
            const aiResult = await this.primaryAI(txn);
            if (aiResult.confidence > 0.75) return aiResult;

            // If confidence is low, try fallback
            console.log('Low confidence from primary AI, trying fallback...');
            const fallbackResult = await this.fallbackAI(txn);
            // If fallback is better, return it
            if (fallbackResult.confidence > aiResult.confidence) return fallbackResult;

            return aiResult;
        } catch (error) {
            console.warn('Primary AI failed, switching to fallback:', error);
            try {
                // Tier 3: Fallback AI
                return await this.fallbackAI(txn);
            } catch (fallbackError) {
                console.error('All AI classification failed:', fallbackError);
                // Tier 4: Human review
                return { classification: 'needs_review', confidence: 0, reason: 'AI systems failed' };
            }
        }
    }

    private ruleBasedClassification(txn: any) {
        const narration = (txn.narration || '').toLowerCase();

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

    private async primaryAI(txn: any) {
        if (this.provider === 'claude' && this.claude) {
            return this.callClaude(txn);
        } else if (this.provider === 'openai' && this.openai) {
            return this.callOpenAI(txn);
        }
        throw new Error('Primary provider not configured');
    }

    private async fallbackAI(txn: any) {
        // Switch provider
        if (this.provider === 'claude' && this.openai) {
            return this.callOpenAI(txn);
        } else if (this.provider === 'openai' && this.claude) {
            return this.callClaude(txn);
        }
        throw new Error('No fallback provider configured');
    }

    private async callClaude(txn: any) {
        const prompt = this.getPrompt(txn);
        const response = await this.claude!.messages.create({
            model: 'claude-3-sonnet-20240229',
            max_tokens: 300,
            messages: [{ role: 'user', content: prompt }]
        });
        const textContent = response.content[0].type === 'text' ? response.content[0].text : '';
        return JSON.parse(textContent);
    }

    private async callOpenAI(txn: any) {
        const prompt = this.getPrompt(txn);
        const response = await this.openai!.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are a helpful financial assistant. Return only JSON." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        });
        const content = response.choices[0].message.content || '{}';
        return JSON.parse(content);
    }

    private getPrompt(txn: any) {
        return `Classify this bank transaction for VAT purposes.

Transaction:
- Amount: ₦${txn.amount.toLocaleString()}
- Narration: "${txn.narration}"
- Date: ${txn.date}

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
