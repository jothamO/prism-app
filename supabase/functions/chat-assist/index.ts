import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { generateSystemPrompt } from '../_shared/prompt-generator.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

        // Build context-aware system prompt dynamically from database
        const contextPrompt = await generateSystemPrompt(context?.userId, {
            totalIncome: context?.totalIncome,
            totalExpenses: context?.totalExpenses,
            emtlPaid: context?.emtlPaid,
            transactionCount: context?.transactionCount,
        });

        console.log('[chat-assist] Generated dynamic system prompt with DB rules');

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
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 8000,
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
