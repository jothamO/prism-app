import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { callClaudeJSON, CLAUDE_MODELS } from '../_shared/claude-client.ts';

// Expected structure from AI classification
interface ClassificationParsed {
    classification: string;
    confidence: number;
    reason?: string;
    category?: string;
    needsConfirmation?: boolean;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// NIGERIAN TRANSACTION DETECTION
// ============================================

// ============================================
// NIGERIAN FLAGS INTERFACE (snake_case for DB compatibility)
// ============================================

interface NigerianFlags {
    is_ussd_transaction: boolean;
    is_mobile_money: boolean;
    mobile_money_provider?: string;
    is_pos_transaction: boolean;
    is_foreign_currency: boolean;
    foreign_currency?: string;
    is_nigerian_bank_charge: boolean;
    is_emtl: boolean;
    is_stamp_duty: boolean;
    detected_bank_code?: string;
    // Capital injection detection (aligned with Gateway)
    is_capital_injection?: boolean;
    capital_type?: string;
}

interface TaxImplications {
    vat_applicable: boolean;
    wht_applicable: boolean;
    emtl_charged: boolean;
    stamp_duty_charged: boolean;
    deductible: boolean;
}

const USSD_PATTERNS = [/ussd/i, /\*737\*/, /\*919\*/, /\*901\*/, /\*945\*/, /\*966\*/, /\*770\*/];
const MOBILE_MONEY_PROVIDERS: Record<string, RegExp[]> = {
    'OPay': [/opay/i, /opera/i],
    'PalmPay': [/palmpay/i],
    'Kuda': [/kuda/i],
    'Paga': [/paga/i],
    'MTN MoMo': [/mtn\s?momo/i, /mobile\s?money/i, /momo/i],
};
const POS_PATTERNS = [/pos/i, /p\.o\.s/i, /payment\s?terminal/i, /card\s?payment/i, /terminal\s?id/i, /merchant\s?id/i, /ptsp/i];
const BANK_CHARGE_PATTERNS = [/sms[\s\-_]?alert/i, /vat[\s\-_]?on/i, /commission\s?on\s?turnover/i, /account\s?maintenance/i, /atm\s?charge/i, /transfer\s?fee/i, /bank[\s\-_]?charge/i, /cot\s?charge/i, /maintenance\s?fee/i];
const EMTL_PATTERNS = [/emtl/i, /e\.m\.t\.l/i, /electronic\s?money\s?transfer\s?levy/i, /e-?levy/i, /transfer\s?levy/i];
const STAMP_DUTY_PATTERNS = [/stamp\s?duty/i, /stmp\s?dty/i, /sd\s?charge/i, /stamping/i];

// Capital injection patterns (from Gateway's capital-detector.ts)
const CAPITAL_PATTERNS = [
    /capital\s*(injection|infusion|contribution)/i,
    /shareholder\s*(loan|funding|contribution)/i,
    /director'?s?\s*(loan|funding|contribution)/i,
    /equity\s*(injection|contribution|funding)/i,
    /investment\s*from\s*(owner|shareholder|director)/i,
    /owner'?s?\s*(draw|contribution)/i,
    /personal\s*funds?\s*(transfer|contribution)/i
];

function detectCapitalInjection(description: string): boolean {
    return CAPITAL_PATTERNS.some(p => p.test(description));
}

function detectCapitalType(description: string): string | undefined {
    if (/shareholder/i.test(description)) return 'shareholder_loan';
    if (/director/i.test(description)) return 'director_loan';
    if (/equity/i.test(description)) return 'equity_contribution';
    if (/personal\s*funds/i.test(description)) return 'personal_contribution';
    return undefined;
}

function detectNigerianFlags(description: string, amount?: number): NigerianFlags {
    const desc = description || '';

    let mobile_money_provider: string | undefined;
    for (const [provider, patterns] of Object.entries(MOBILE_MONEY_PROVIDERS)) {
        if (patterns.some(p => p.test(desc))) {
            mobile_money_provider = provider;
            break;
        }
    }

    const is_emtl: boolean = EMTL_PATTERNS.some(p => p.test(desc)) ||
        Boolean(amount && amount === 50 && /levy|charge/i.test(desc));

    return {
        is_ussd_transaction: USSD_PATTERNS.some(p => p.test(desc)),
        is_mobile_money: !!mobile_money_provider,
        mobile_money_provider,
        is_pos_transaction: POS_PATTERNS.some(p => p.test(desc)),
        is_foreign_currency: /\$|usd|dollar|gbp|eur|euro/i.test(desc),
        foreign_currency: /usd|\$/i.test(desc) ? 'USD' : /gbp|£/i.test(desc) ? 'GBP' : /eur|€/i.test(desc) ? 'EUR' : undefined,
        is_nigerian_bank_charge: BANK_CHARGE_PATTERNS.some(p => p.test(desc)),
        is_emtl,
        is_stamp_duty: STAMP_DUTY_PATTERNS.some(p => p.test(desc)) || (amount === 50 && /stamp/i.test(desc)),
        is_capital_injection: detectCapitalInjection(desc),
        capital_type: detectCapitalType(desc),
    };
}

function getTaxImplications(flags: NigerianFlags, isCredit: boolean): TaxImplications {
    return {
        vat_applicable: isCredit && !flags.is_emtl && !flags.is_stamp_duty && !flags.is_nigerian_bank_charge,
        wht_applicable: false,
        emtl_charged: flags.is_emtl,
        stamp_duty_charged: flags.is_stamp_duty,
        deductible: flags.is_nigerian_bank_charge || flags.is_emtl || flags.is_stamp_duty,
    };
}

// ============================================
// CLASSIFICATION RESULT
// ============================================

interface ClassificationResult {
    classification: string;
    confidence: number;
    reason: string;
    category?: string;
    needsConfirmation: boolean;
    tier: 'ai_primary' | 'ai_fallback' | 'rule_based' | 'human_review';
}

// ============================================
// TIER 1: AI PRIMARY (Claude Sonnet)
// ============================================

async function classifyWithSonnet(
    narration: string,
    amount: number,
    isCredit: boolean,
    date: string,
    flags: NigerianFlags
): Promise<ClassificationResult | null> {
    const prompt = buildClassificationPrompt(narration, amount, isCredit, date, flags);

    try {
        console.log('[classify-transaction] Tier 1: Calling Claude Sonnet...');
        const parsed = await callClaudeJSON<ClassificationParsed>(
            'You are an expert Nigerian tax accountant. Classify bank transactions accurately for tax purposes.',
            prompt,
            { model: CLAUDE_MODELS.SONNET, maxTokens: 400 }
        );

        if (parsed && parsed.classification && parsed.confidence >= 0.70) {
            return {
                classification: parsed.classification,
                confidence: parsed.confidence,
                reason: parsed.reason || 'AI classification (Sonnet)',
                category: parsed.category,
                needsConfirmation: parsed.needsConfirmation ?? (parsed.confidence < 0.85),
                tier: 'ai_primary',
            };
        }
        console.log('[classify-transaction] Sonnet confidence too low:', parsed?.confidence);
        return null;
    } catch (error) {
        console.error('[classify-transaction] Sonnet failed:', error);
        return null;
    }
}

// ============================================
// TIER 2: AI FALLBACK (Claude Haiku)
// ============================================

async function classifyWithHaiku(
    narration: string,
    amount: number,
    isCredit: boolean,
    date: string,
    flags: NigerianFlags
): Promise<ClassificationResult | null> {
    const prompt = buildClassificationPrompt(narration, amount, isCredit, date, flags);

    try {
        console.log('[classify-transaction] Tier 2: Calling Claude Haiku...');
        const parsed = await callClaudeJSON<ClassificationParsed>(
            'You are a Nigerian tax classification expert.',
            prompt,
            { model: CLAUDE_MODELS.HAIKU, maxTokens: 300 }
        );

        if (parsed && parsed.classification && parsed.confidence >= 0.60) {
            return {
                classification: parsed.classification,
                confidence: parsed.confidence,
                reason: parsed.reason || 'AI classification (Haiku)',
                category: parsed.category,
                needsConfirmation: parsed.needsConfirmation ?? true,
                tier: 'ai_fallback',
            };
        }
        console.log('[classify-transaction] Haiku confidence too low:', parsed?.confidence);
        return null;
    } catch (error) {
        console.error('[classify-transaction] Haiku failed:', error);
        return null;
    }
}

// ============================================
// TIER 3: RULE-BASED CLASSIFICATION
// ============================================

function ruleBasedClassification(
    narration: string,
    amount: number,
    isCredit: boolean,
    flags: NigerianFlags
): ClassificationResult | null {
    const desc = narration.toLowerCase();

    if (flags.is_emtl) {
        return { classification: 'expense', confidence: 0.98, reason: 'EMTL levy detected (rule-based)', category: 'bank_charges', needsConfirmation: false, tier: 'rule_based' };
    }
    if (flags.is_stamp_duty) {
        return { classification: 'expense', confidence: 0.98, reason: 'Stamp duty detected (rule-based)', category: 'government_levy', needsConfirmation: false, tier: 'rule_based' };
    }
    if (flags.is_nigerian_bank_charge) {
        return { classification: 'expense', confidence: 0.95, reason: 'Nigerian bank charge (rule-based)', category: 'bank_charges', needsConfirmation: false, tier: 'rule_based' };
    }
    if (flags.is_pos_transaction) {
        return { classification: isCredit ? 'income' : 'expense', confidence: 0.88, reason: isCredit ? 'POS credit (rule-based)' : 'POS charge (rule-based)', category: isCredit ? 'sales_revenue' : 'operating_expense', needsConfirmation: amount > 500000, tier: 'rule_based' };
    }
    if (flags.is_mobile_money && isCredit) {
        return { classification: 'income', confidence: 0.75, reason: `Mobile money via ${flags.mobile_money_provider} (rule-based)`, category: 'sales_revenue', needsConfirmation: true, tier: 'rule_based' };
    }

    const nonRevenueKeywords = ['loan', 'disbursement', 'salary', 'atm', 'withdrawal', 'netflix', 'dstv', 'airtime', 'transfer from self'];
    for (const keyword of nonRevenueKeywords) {
        if (desc.includes(keyword)) {
            return { classification: 'non_revenue', confidence: 0.90, reason: `Contains "${keyword}" (rule-based)`, category: keyword === 'salary' ? 'salary_income' : 'personal', needsConfirmation: amount > 500000, tier: 'rule_based' };
        }
    }

    const saleKeywords = ['pos payment', 'pos terminal', 'invoice payment', 'customer payment'];
    for (const keyword of saleKeywords) {
        if (desc.includes(keyword)) {
            return { classification: 'income', confidence: 0.95, reason: `Contains "${keyword}" (rule-based)`, category: 'sales_revenue', needsConfirmation: amount > 1000000, tier: 'rule_based' };
        }
    }

    return null;
}

// ============================================
// TIER 4: HUMAN REVIEW
// ============================================

function humanReviewFallback(): ClassificationResult {
    return { classification: 'needs_review', confidence: 0, reason: 'All tiers failed - requires human review', needsConfirmation: true, tier: 'human_review' };
}

// ============================================
// SHARED PROMPT BUILDER
// ============================================

function buildClassificationPrompt(narration: string, amount: number, isCredit: boolean, date: string, flags: NigerianFlags): string {
    return `Classify this Nigerian bank transaction for tax purposes.

Transaction:
- Amount: ₦${amount.toLocaleString()}
- Narration: "${narration}"
- Date: ${date}
- Type: ${isCredit ? 'Credit (money in)' : 'Debit (money out)'}

Nigerian Context:
- USSD: ${flags.is_ussd_transaction ? 'Yes' : 'No'}
- POS: ${flags.is_pos_transaction ? 'Yes' : 'No'}
- Mobile Money: ${flags.is_mobile_money ? `Yes (${flags.mobile_money_provider})` : 'No'}
- Bank Charge: ${flags.is_nigerian_bank_charge ? 'Yes' : 'No'}
- EMTL: ${flags.is_emtl ? 'Yes' : 'No'}
- Foreign Currency: ${flags.is_foreign_currency ? `Yes (${flags.foreign_currency})` : 'No'}
- Capital Injection: ${flags.is_capital_injection ? `Yes (${flags.capital_type})` : 'No'}

Classify as ONE of:
- "income" (customer payment, sales revenue - VAT applies)
- "expense" (business expense - deductible)
- "transfer" (internal transfer - no tax)
- "personal" (personal spending - not deductible)
- "loan" (loan disbursement/repayment)
- "investment" (capital investment)
- "salary" (salary/wage payment)

Return ONLY valid JSON:
{
  "classification": "income|expense|transfer|personal|loan|investment|salary",
  "confidence": 0.XX,
  "reason": "brief explanation",
  "category": "specific category like 'sales_revenue', 'office_supplies', 'bank_charges', etc.",
  "needsConfirmation": true/false
}`;
}

// ============================================
// MAIN HANDLER
// ============================================

interface ClassifyRequest {
    transactionId?: string;
    narration: string;
    amount: number;
    type: 'credit' | 'debit';
    date?: string;
    userId?: string;
    saveResult?: boolean;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const body: ClassifyRequest = await req.json();
        const { transactionId, narration, amount, type, date, userId, saveResult } = body;

        console.log('[classify-transaction] Processing:', { narration, amount, type });

        if (!narration || amount === undefined || !type) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing required fields: narration, amount, type' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const isCredit = type === 'credit';
        const txnDate = date || new Date().toISOString();

        const nigerianFlags = detectNigerianFlags(narration, amount);
        const taxImplications = getTaxImplications(nigerianFlags, isCredit);

        let result: ClassificationResult | null = null;

        // ============================================
        // 4-TIER CLASSIFICATION PIPELINE
        // Order: AI Primary (Sonnet) → AI Fallback (Haiku) → Rule-based → Human Review
        // ============================================

        // TIER 1: AI Primary (Claude Sonnet - claude-sonnet-4-5-20250929)
        result = await classifyWithSonnet(narration, amount, isCredit, txnDate, nigerianFlags);

        // TIER 2: AI Fallback (Claude Haiku)
        if (!result) {
            result = await classifyWithHaiku(narration, amount, isCredit, txnDate, nigerianFlags);
        }

        // TIER 3: Rule-based classification
        if (!result) {
            console.log('[classify-transaction] Tier 3: Trying rule-based...');
            result = ruleBasedClassification(narration, amount, isCredit, nigerianFlags);
        }

        // TIER 4: Human review fallback
        if (!result) {
            console.log('[classify-transaction] Tier 4: Human review required');
            result = humanReviewFallback();
        }

        console.log('[classify-transaction] Result:', result.classification, 'via', result.tier);

        if (saveResult && transactionId) {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabase = createClient(supabaseUrl, supabaseServiceKey);

            const { error: updateError } = await supabase
                .from('bank_transactions')
                .update({
                    classification: result.classification,
                    confidence: result.confidence,
                    category: result.category,
                    classification_source: result.tier,
                    is_ussd_transaction: nigerianFlags.is_ussd_transaction,
                    is_mobile_money: nigerianFlags.is_mobile_money,
                    mobile_money_provider: nigerianFlags.mobile_money_provider,
                    is_pos_transaction: nigerianFlags.is_pos_transaction,
                    is_foreign_currency: nigerianFlags.is_foreign_currency,
                    foreign_currency: nigerianFlags.foreign_currency,
                    is_nigerian_bank_charge: nigerianFlags.is_nigerian_bank_charge,
                    is_emtl: nigerianFlags.is_emtl,
                    is_stamp_duty: nigerianFlags.is_stamp_duty,
                    is_capital_injection: nigerianFlags.is_capital_injection,
                    vat_applicable: taxImplications.vat_applicable,
                    is_tax_relevant: taxImplications.deductible,
                    metadata: {
                        classification_reason: result.reason,
                        needs_confirmation: result.needsConfirmation,
                        nigerian_flags: nigerianFlags,
                        tax_implications: taxImplications,
                        capital_type: nigerianFlags.capital_type,
                        classified_at: new Date().toISOString()
                    }
                })
                .eq('id', transactionId);

            if (updateError) {
                console.error('[classify-transaction] Save error:', updateError);
            } else {
                console.log('[classify-transaction] Saved for:', transactionId);
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                classification: result.classification,
                confidence: result.confidence,
                reason: result.reason,
                category: result.category,
                needsConfirmation: result.needsConfirmation,
                tier: result.tier,
                nigerianFlags,
                taxImplications,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[classify-transaction] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
