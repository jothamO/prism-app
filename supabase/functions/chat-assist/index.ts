import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are PRISM, a friendly Nigerian tax assistant. Your role is to help users understand their taxes, transactions, and financial obligations under Nigerian law.

PERSONALITY:
- Friendly, approachable, and conversational
- Use simple language, avoid jargon when possible
- Reference Nigerian context (Naira, FIRS/NRS, local examples)
- Be helpful but always recommend consulting a tax professional for complex matters

KNOWLEDGE AREAS:
1. Nigeria Tax Act 2025 - Personal income tax, corporate tax, VAT (7.5%), CGT
2. EMTL - Electronic Money Transfer Levy (₦50 per transfer ≥₦10,000)
3. Tax Categories: Employed, Self-employed, Business owner, Freelancer
4. Deductions: Pension (8%), NHF (2.5%), Life insurance, Rent relief
5. Filing deadlines: Monthly VAT (21st), Annual returns (March 31)
6. Tax bands: ₦0-800k (0%), ₦800k-3M (15%), ₦3M-5.6M (19%), ₦5.6M-11.2M (21%), Above ₦11.2M (24%)

FORMATTING:
- Use emojis sparingly to be friendly 💡📊
- Format currency as ₦X,XXX
- Keep responses concise (2-3 paragraphs max)
- For calculations, show the math briefly
- End with a helpful tip or next action when relevant

LIMITATIONS:
- You cannot access external websites or databases
- For specific account questions, refer to their transaction history
- For complex legal matters, recommend a tax professional`;

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface ChatRequest {
    message: string;
    history?: Message[];
    context?: {
        userId?: string;
        totalIncome?: number;
        totalExpenses?: number;
        emtlPaid?: number;
        transactionCount?: number;
    };
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
        if (!anthropicApiKey) {
            return new Response(
                JSON.stringify({ error: 'AI service not configured' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { message, history = [], context }: ChatRequest = await req.json();

        if (!message) {
            return new Response(
                JSON.stringify({ error: 'Message is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Build context-aware system prompt
        let contextPrompt = SYSTEM_PROMPT;
        if (context) {
            contextPrompt += `\n\nUSER FINANCIAL CONTEXT (use this to personalize answers):`;
            if (context.totalIncome !== undefined) {
                contextPrompt += `\n- Total income this period: ₦${context.totalIncome.toLocaleString()}`;
            }
            if (context.totalExpenses !== undefined) {
                contextPrompt += `\n- Total expenses this period: ₦${context.totalExpenses.toLocaleString()}`;
            }
            if (context.emtlPaid !== undefined) {
                contextPrompt += `\n- EMTL paid this period: ₦${context.emtlPaid.toLocaleString()}`;
            }
            if (context.transactionCount !== undefined) {
                contextPrompt += `\n- Number of transactions: ${context.transactionCount}`;
            }
        }

        // Build messages array with history
        const messages = [
            ...history.map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            })),
            { role: 'user' as const, content: message },
        ];

        console.log('[chat-assist] Processing message:', message.substring(0, 50));

        // Call Claude
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': anthropicApiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 500,
                system: contextPrompt,
                messages,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[chat-assist] Claude API error:', errorText);
            return new Response(
                JSON.stringify({ error: 'AI service unavailable' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const data = await response.json();
        const assistantMessage = data.content[0]?.text || 'I apologize, but I could not generate a response.';

        console.log('[chat-assist] Response generated:', assistantMessage.substring(0, 50));

        return new Response(
            JSON.stringify({
                response: assistantMessage,
                usage: {
                    input_tokens: data.usage?.input_tokens,
                    output_tokens: data.usage?.output_tokens,
                },
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[chat-assist] Error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
