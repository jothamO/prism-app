import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { callClaudeJSON, CLAUDE_MODELS } from '../_shared/claude-client.ts';
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";

// ============================================
// BATCH CLASSIFICATION - Process multiple transactions in one AI call
// Reduces API calls by 10x (10 transactions per call)
// ============================================


interface TransactionInput {
    id: string;
    narration: string;
    amount: number;
    type: 'credit' | 'debit';
    date: string;
}

interface ClassificationOutput {
    id: string;
    classification: string;
    confidence: number;
    reason: string;
    category?: string;
    needsConfirmation: boolean;
}

interface BatchRequest {
    transactions: TransactionInput[];
    userId?: string;
    saveResults?: boolean;
}

// Nigerian context detection (simplified for batch)
function detectNigerianContext(narration: string): string {
    const lower = narration.toLowerCase();
    const flags: string[] = [];

    if (/ussd|\*737\*|\*919\*|\*901\*/.test(lower)) flags.push('USSD');
    if (/pos|terminal|paypoint/.test(lower)) flags.push('POS');
    if (/emtl|e\.m\.t\.l|transfer\s?levy/.test(lower)) flags.push('EMTL');
    if (/stamp\s?duty|sd\s?charge/.test(lower)) flags.push('Stamp Duty');
    if (/opay|palmpay|kuda|moniepoint/.test(lower)) flags.push('Mobile Money');
    if (/charge|fee|commission/.test(lower)) flags.push('Bank Charge');

    return flags.length > 0 ? flags.join(', ') : 'None detected';
}

// Build batch prompt for multiple transactions
function buildBatchPrompt(transactions: TransactionInput[]): string {
    const txnList = transactions.map((t, i) => {
        const context = detectNigerianContext(t.narration);
        return `${i + 1}. ID: ${t.id}
   Amount: ₦${t.amount.toLocaleString()}
   Narration: "${t.narration}"
   Date: ${t.date}
   Type: ${t.type === 'credit' ? 'Credit (money in)' : 'Debit (money out)'}
   Nigerian Context: ${context}`;
    }).join('\n\n');

    return `Classify these Nigerian bank transactions for tax purposes.

TRANSACTIONS:
${txnList}

Classify each as ONE of:
- "income" (customer payment, sales revenue - VAT applies)
- "expense" (business expense - deductible)
- "transfer" (internal transfer - no tax)
- "personal" (personal spending - not deductible)
- "bank_charges" (bank fees, EMTL, stamp duty)
- "salary" (salary/wage)
- "loan" (loan disbursement/repayment)
- "investment" (capital investment)

Return ONLY valid JSON array:
[
  {
    "id": "transaction_id",
    "classification": "category",
    "confidence": 0.XX,
    "reason": "brief explanation",
    "category": "specific_category",
    "needsConfirmation": true/false
  },
  ...
]`;
}

serve(async (req) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { transactions, userId, saveResults = false }: BatchRequest = await req.json();

        if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
            return new Response(
                JSON.stringify({ error: 'transactions array required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Limit batch size to 10
        const batch = transactions.slice(0, 10);
        console.log(`[classify-batch] Processing ${batch.length} transactions`);

        const prompt = buildBatchPrompt(batch);

        // Call Claude with batch prompt
        const results = await callClaudeJSON<ClassificationOutput[]>(
            'You are an expert Nigerian tax accountant. Classify bank transactions accurately for tax purposes. Always respond with a valid JSON array.',
            prompt,
            { model: CLAUDE_MODELS.SONNET, maxTokens: 2000 }
        );

        if (!results || !Array.isArray(results)) {
            console.error('[classify-batch] Invalid response from Claude');
            return new Response(
                JSON.stringify({ error: 'Classification failed', results: [] }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log(`[classify-batch] Classified ${results.length} transactions`);

        // Optionally save results to database
        if (saveResults && userId) {
            const supabase = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            );

            for (const result of results) {
                if (result.id && result.classification) {
                    await supabase
                        .from('bank_transactions')
                        .update({
                            classification: result.classification,
                            category: result.category || result.classification,
                            confidence_score: result.confidence,
                            needs_review: result.needsConfirmation || result.confidence < 0.7,
                            classified_at: new Date().toISOString(),
                        })
                        .eq('id', result.id)
                        .eq('user_id', userId);
                }
            }
            console.log(`[classify-batch] Saved ${results.length} classifications`);
        }

        return new Response(
            JSON.stringify({
                success: true,
                batchSize: batch.length,
                results,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('[classify-batch] Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return new Response(
            JSON.stringify({ error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
