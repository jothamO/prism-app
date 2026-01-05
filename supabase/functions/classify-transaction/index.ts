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

interface NigerianFlags {
    isUssdTransaction: boolean;
    isMobileMoney: boolean;
    mobileMoneyProvider?: string;
    isPosTransaction: boolean;
    isForeignCurrency: boolean;
    foreignCurrency?: string;
    isNigerianBankCharge: boolean;
    isEmtl: boolean;
    isStampDuty: boolean;
    detectedBankCode?: string;
}

interface TaxImplications {
    vatApplicable: boolean;
    whtApplicable: boolean;
    emtlCharged: boolean;
    stampDutyCharged: boolean;
    deductible: boolean;
}

const USSD_PATTERNS = [/\*737\*/, /\*919\*/, /\*901\*/, /\*945\*/, /\*966\*/, /\*770\*/];
const MOBILE_MONEY_PROVIDERS: Record<string, RegExp[]> = {
    'OPay': [/opay/i, /opera/i],
    'PalmPay': [/palmpay/i],
    'Kuda': [/kuda/i],
    'Paga': [/paga/i],
    'MTN MoMo': [/mtn\s?momo/i, /mobile\s?money/i, /momo/i],
};
const POS_PATTERNS = [/pos/i, /p\.o\.s/i, /payment\s?terminal/i, /card\s?payment/i, /terminal\s?id/i, /merchant\s?id/i, /ptsp/i];
const BANK_CHARGE_PATTERNS = [/sms\s?alert/i, /vat\s?on\s?cot/i, /commission\s?on\s?turnover/i, /account\s?maintenance/i, /atm\s?charge/i, /transfer\s?fee/i];
const EMTL_PATTERNS = [/emtl/i, /e\.m\.t\.l/i, /electronic\s?money\s?transfer\s?levy/i, /e-?levy/i, /transfer\s?levy/i];
const STAMP_DUTY_PATTERNS = [/stamp\s?duty/i, /stmp\s?dty/i, /sd\s?charge/i, /stamping/i];

function detectNigerianFlags(description: string, amount?: number): NigerianFlags {
    const desc = description || '';

    let mobileMoneyProvider: string | undefined;
    for (const [provider, patterns] of Object.entries(MOBILE_MONEY_PROVIDERS)) {
        if (patterns.some(p => p.test(desc))) {
            mobileMoneyProvider = provider;
            break;
        }
    }

  const isEmtl: boolean = EMTL_PATTERNS.some(p => p.test(desc)) ||
    Boolean(amount && amount === 50 && /levy|charge/i.test(desc));

    return {
        isUssdTransaction: USSD_PATTERNS.some(p => p.test(desc)),
        isMobileMoney: !!mobileMoneyProvider,
        mobileMoneyProvider,
        isPosTransaction: POS_PATTERNS.some(p => p.test(desc)),
        isForeignCurrency: /\$|usd|dollar|gbp|eur|euro/i.test(desc),
        foreignCurrency: /usd|\$/i.test(desc) ? 'USD' : /gbp|£/i.test(desc) ? 'GBP' : /eur|€/i.test(desc) ? 'EUR' : undefined,
        isNigerianBankCharge: BANK_CHARGE_PATTERNS.some(p => p.test(desc)),
        isEmtl,
        isStampDuty: STAMP_DUTY_PATTERNS.some(p => p.test(desc)) || (amount === 50 && /stamp/i.test(desc)),
    };
}

function getTaxImplications(flags: NigerianFlags, isCredit: boolean): TaxImplications {
    return {
        vatApplicable: isCredit && !flags.isEmtl && !flags.isStampDuty && !flags.isNigerianBankCharge,
        whtApplicable: false,
        emtlCharged: flags.isEmtl,
        stampDutyCharged: flags.isStampDuty,
        deductible: flags.isNigerianBankCharge || flags.isEmtl || flags.isStampDuty,
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

    if (flags.isEmtl) {
        return { classification: 'expense', confidence: 0.98, reason: 'EMTL levy detected (rule-based)', category: 'bank_charges', needsConfirmation: false, tier: 'rule_based' };
    }
    if (flags.isStampDuty) {
        return { classification: 'expense', confidence: 0.98, reason: 'Stamp duty detected (rule-based)', category: 'government_levy', needsConfirmation: false, tier: 'rule_based' };
    }
    if (flags.isNigerianBankCharge) {
        return { classification: 'expense', confidence: 0.95, reason: 'Nigerian bank charge (rule-based)', category: 'bank_charges', needsConfirmation: false, tier: 'rule_based' };
    }
    if (flags.isPosTransaction) {
        return { classification: isCredit ? 'income' : 'expense', confidence: 0.88, reason: isCredit ? 'POS credit (rule-based)' : 'POS charge (rule-based)', category: isCredit ? 'sales_revenue' : 'operating_expense', needsConfirmation: amount > 500000, tier: 'rule_based' };
    }
    if (flags.isMobileMoney && isCredit) {
        return { classification: 'income', confidence: 0.75, reason: `Mobile money via ${flags.mobileMoneyProvider} (rule-based)`, category: 'sales_revenue', needsConfirmation: true, tier: 'rule_based' };
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
- USSD: ${flags.isUssdTransaction ? 'Yes' : 'No'}
- POS: ${flags.isPosTransaction ? 'Yes' : 'No'}
- Mobile Money: ${flags.isMobileMoney ? `Yes (${flags.mobileMoneyProvider})` : 'No'}
- Bank Charge: ${flags.isNigerianBankCharge ? 'Yes' : 'No'}
- EMTL: ${flags.isEmtl ? 'Yes' : 'No'}
- Foreign Currency: ${flags.isForeignCurrency ? `Yes (${flags.foreignCurrency})` : 'No'}

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
                    is_ussd_transaction: nigerianFlags.isUssdTransaction,
                    is_mobile_money: nigerianFlags.isMobileMoney,
                    mobile_money_provider: nigerianFlags.mobileMoneyProvider,
                    is_pos_transaction: nigerianFlags.isPosTransaction,
                    is_foreign_currency: nigerianFlags.isForeignCurrency,
                    foreign_currency: nigerianFlags.foreignCurrency,
                    is_nigerian_bank_charge: nigerianFlags.isNigerianBankCharge,
                    is_emtl: nigerianFlags.isEmtl,
                    is_stamp_duty: nigerianFlags.isStampDuty,
                    vat_applicable: taxImplications.vatApplicable,
                    is_tax_relevant: taxImplications.deductible,
                    metadata: {
                        classification_reason: result.reason,
                        needs_confirmation: result.needsConfirmation,
                        nigerian_flags: nigerianFlags,
                        tax_implications: taxImplications,
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
