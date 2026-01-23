/**
 * Chat Assist - V10 Refactored
 * 
 * Now a thin wrapper around the centralized chat-engine.
 * All fact extraction and AI logic moved to _shared/chat-engine.ts
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, jsonResponse, handleCors } from '../_shared/cors.ts';
import { processMessage } from '../_shared/chat-engine.ts';

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
    // Handle CORS preflight
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
        const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
        if (!anthropicApiKey) {
            return jsonResponse({ error: 'AI service not configured' }, 500);
        }

        const { message, history = [], context }: ChatRequest = await req.json();

        if (!message) {
            return jsonResponse({ error: 'Message is required' }, 400);
        }

        // Use centralized chat engine
        const result = await processMessage({
            userId: context?.userId || '',
            message,
            channel: 'web',
            context: {
                totalIncome: context?.totalIncome,
                totalExpenses: context?.totalExpenses,
                emtlPaid: context?.emtlPaid,
                transactionCount: context?.transactionCount,
            },
            history,
        });

        console.log('[chat-assist] Response via chat-engine:', result.response.substring(0, 50));

        return jsonResponse({
            response: result.response,
            usage: result.usage,
        });

    } catch (error) {
        console.error('[chat-assist] Error:', error);
        return jsonResponse({ error: 'Internal server error' }, 500);
    }
});
