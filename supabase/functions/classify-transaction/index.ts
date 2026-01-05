import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { callClaude, CLAUDE_MODELS } from '../_shared/claude-client.ts';

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

    // Detect mobile money provider
    let mobileMoneyProvider: string | undefined;
    for (const [provider, patterns] of Object.entries(MOBILE_MONEY_PROVIDERS)) {
        if (patterns.some(p => p.test(desc))) {
            mobileMoneyProvider = provider;
            break;
        }
    }

    // EMTL threshold check (₦10,000+)
    const isEmtl = EMTL_PATTERNS.some(p => p.test(desc)) ||
        (amount && amount === 50 && /levy|charge/i.test(desc));

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
        whtApplicable: false, // TODO: Add WHT detection
        emtlCharged: flags.isEmtl,
        stampDutyCharged: flags.isStampDuty,
        deductible: flags.isNigerianBankCharge || flags.isEmtl || flags.isStampDuty,
    };
}

// ============================================
// RULE-BASED CLASSIFICATION (TIER 1)
// ============================================

interface ClassificationResult {
    classification: string;
    confidence: number;
    reason: string;
    category?: string;
    needsConfirmation: boolean;
}

function ruleBasedClassification(
    narration: string,
    amount: number,
    isCredit: boolean,
    flags: NigerianFlags
): ClassificationResult | null {
    const desc = narration.toLowerCase();

    // EMTL/Stamp Duty - always expense
    if (flags.isEmtl) {
        return {
            classification: 'expense',
            confidence: 0.98,
            reason: 'EMTL levy detected',
            category: 'bank_charges',
            needsConfirmation: false,
        };
    }
    if (flags.isStampDuty) {
        return {
            classification: 'expense',
            confidence: 0.98,
            reason: 'Stamp duty detected',
            category: 'government_levy',
            needsConfirmation: false,
        };
    }

    // Bank charges
    if (flags.isNigerianBankCharge) {
        return {
            classification: 'expense',
            confidence: 0.95,
            reason: 'Nigerian bank charge detected',
            category: 'bank_charges',
            needsConfirmation: false,
        };
    }

    // POS transactions
    if (flags.isPosTransaction) {
        return {
            classification: isCredit ? 'income' : 'expense',
            confidence: 0.88,
            reason: isCredit ? 'POS terminal credit - customer payment' : 'POS terminal charge',
            category: isCredit ? 'sales_revenue' : 'operating_expense',
            needsConfirmation: amount > 500000,
        };
    }

    // Mobile money
    if (flags.isMobileMoney && isCredit) {
        return {
            classification: 'income',
            confidence: 0.75,
            reason: `Mobile money payment via ${flags.mobileMoneyProvider}`,
            category: 'sales_revenue',
            needsConfirmation: true,
        };
    }

    // Non-revenue keywords
    const nonRevenueKeywords = ['loan', 'disbursement', 'salary', 'atm', 'withdrawal', 'netflix', 'dstv', 'airtime', 'transfer from self'];
    for (const keyword of nonRevenueKeywords) {
        if (desc.includes(keyword)) {
            return {
                classification: 'non_revenue',
                confidence: 0.90,
                reason: `Contains keyword: ${keyword}`,
                category: keyword === 'salary' ? 'salary_income' : 'personal',
                needsConfirmation: amount > 500000,
            };
        }
    }

    // Sale keywords
    const saleKeywords = ['pos payment', 'pos terminal', 'invoice payment', 'customer payment'];
    for (const keyword of saleKeywords) {
        if (desc.includes(keyword)) {
            return {
                classification: 'income',
                confidence: 0.95,
                reason: `Contains keyword: ${keyword}`,
                category: 'sales_revenue',
                needsConfirmation: amount > 1000000,
            };
        }
    }

    // Confidence too low for rule-based
    return null;
}

// ============================================
// AI CLASSIFICATION (TIER 2)
// ============================================

async function classifyWithAI(
    narration: string,
    amount: number,
    isCredit: boolean,
    date: string,
    flags: NigerianFlags
): Promise<ClassificationResult> {
    const prompt = `Classify this Nigerian bank transaction for tax purposes.

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

Classify as ONE of:
- "income" (customer payment, sales revenue - VAT applies)
- "expense" (business expense - deductible)
- "transfer" (internal transfer - no tax)
- "personal" (personal spending - not deductible)
- "loan" (loan disbursement/repayment)
- "investment" (capital investment)

Return ONLY valid JSON:
{
  "classification": "income|expense|transfer|personal|loan|investment",
  "confidence": 0.XX,
  "reason": "brief explanation",
  "category": "specific category like 'sales_revenue', 'office_supplies', etc.",
  "needsConfirmation": true/false
}`;

    try {
        const response = await callClaude(prompt, {
            model: CLAUDE_MODELS.HAIKU,
            maxTokens: 300,
            systemPrompt: 'You are a Nigerian tax classification expert. Return only valid JSON.',
        });

        const parsed = JSON.parse(response);
        return {
            classification: parsed.classification || 'needs_review',
            confidence: parsed.confidence || 0.5,
            reason: parsed.reason || 'AI classification',
            category: parsed.category,
            needsConfirmation: parsed.needsConfirmation ?? true,
        };
    } catch (error) {
        console.error('[classify-transaction] AI classification failed:', error);
        return {
            classification: 'needs_review',
            confidence: 0,
            reason: 'AI classification failed',
            needsConfirmation: true,
        };
    }
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

        // Step 1: Detect Nigerian-specific flags
        const nigerianFlags = detectNigerianFlags(narration, amount);
        const taxImplications = getTaxImplications(nigerianFlags, isCredit);

        // Step 2: Try rule-based classification first
        let result = ruleBasedClassification(narration, amount, isCredit, nigerianFlags);

        // Step 3: If rule-based confidence is low, use AI
        if (!result || result.confidence < 0.75) {
            console.log('[classify-transaction] Rule-based insufficient, calling AI...');
            result = await classifyWithAI(narration, amount, isCredit, txnDate, nigerianFlags);
        }

        // Step 4: Optionally save to database
        if (saveResult && transactionId) {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabase = createClient(supabaseUrl, supabaseServiceKey);

            await supabase
                .from('transactions')
                .update({
                    classification: result.classification,
                    classification_confidence: result.confidence,
                    classification_reason: result.reason,
                    category: result.category,
                    needs_confirmation: result.needsConfirmation,
                    nigerian_flags: nigerianFlags,
                    tax_implications: taxImplications,
                    classified_at: new Date().toISOString(),
                })
                .eq('id', transactionId);

            console.log('[classify-transaction] Classification saved for:', transactionId);
        }

        return new Response(
            JSON.stringify({
                success: true,
                classification: result.classification,
                confidence: result.confidence,
                reason: result.reason,
                category: result.category,
                needsConfirmation: result.needsConfirmation,
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
