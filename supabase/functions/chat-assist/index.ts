import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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

/**
 * Extract durable facts from user message (Clawd-inspired)
 * Only stores facts that are explicitly stated or requested
 */
async function extractAndStoreFacts(userId: string, message: string): Promise<void> {
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !supabaseKey || !userId) return;

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Resolve auth_user_id to internal users.id (same fix as prompt-generator)
        let internalUserId = userId;
        const { data: userByAuthId } = await supabase
            .from('users')
            .select('id')
            .eq('auth_user_id', userId)
            .single();

        if (userByAuthId) {
            internalUserId = userByAuthId.id;
            console.log('[chat-assist] Resolved auth_user_id to internal id:', internalUserId);
        } else {
            // Try direct lookup in case userId is already an internal ID
            const { data: userDirect } = await supabase
                .from('users')
                .select('id')
                .eq('id', userId)
                .single();

            if (!userDirect) {
                console.log('[chat-assist] User not found for fact extraction:', userId);
                return;
            }
        }

        const lowerMessage = message.toLowerCase();
        const factsToAdd: string[] = [];
        let entityType: string | null = null;
        let incomeEstimate: number | null = null;
        let preferredName: string | null = null;

        // Detect entity type statements
        if (lowerMessage.includes("i'm a freelancer") || lowerMessage.includes("i am a freelancer")) {
            entityType = 'self_employed';
            factsToAdd.push('User is a freelancer');
        }
        if (lowerMessage.includes("i'm self-employed") || lowerMessage.includes("i am self-employed")) {
            entityType = 'self_employed';
        }
        if (lowerMessage.includes("i run a business") || lowerMessage.includes("i own a business")) {
            entityType = 'company';
            factsToAdd.push('User is a business owner');
        }
        if (lowerMessage.includes("i'm employed") || lowerMessage.includes("i work for")) {
            entityType = 'individual';
            factsToAdd.push('User is employed (PAYE)');
        }

        // Detect income mentions
        const incomeMatch = message.match(/(?:i\s+(?:earn|make|get)\s+)?[₦n]?([\d,]+)\s*(?:per\s+)?(?:month|monthly|annually|yearly|year|per\s+year)/i);
        if (incomeMatch) {
            let amount = parseInt(incomeMatch[1].replace(/,/g, ''));
            const isMonthly = lowerMessage.includes('month');
            incomeEstimate = isMonthly ? amount * 12 : amount;
            factsToAdd.push(`Annual income: approximately ₦${incomeEstimate.toLocaleString()}`);
        }

        // Detect explicit "remember" requests
        const rememberMatch = message.match(/remember\s+(?:that\s+)?(.+)/i);
        if (rememberMatch) {
            factsToAdd.push(rememberMatch[1].trim());
        }

        // Detect name preferences
        const nameMatch = message.match(/(?:call\s+me|my\s+name\s+is)\s+([a-z]+)/i);
        if (nameMatch) {
            preferredName = nameMatch[1];
        }

        // Only update if we have something to store
        if (factsToAdd.length === 0 && !entityType && !incomeEstimate && !preferredName) {
            return;
        }

        // Get existing preferences using resolved internal ID
        const { data: existing } = await supabase
            .from('user_preferences')
            .select('remembered_facts')
            .eq('user_id', internalUserId)
            .single();

        const existingFacts: string[] = existing?.remembered_facts || [];
        const newFacts = [...new Set([...existingFacts, ...factsToAdd])]; // Dedupe

        // Upsert preferences using internal ID
        const updates: Record<string, unknown> = {
            user_id: internalUserId,
            remembered_facts: newFacts,
            updated_at: new Date().toISOString(),
        };

        if (preferredName) updates.preferred_name = preferredName;
        if (incomeEstimate) updates.income_estimate = incomeEstimate;

        await supabase
            .from('user_preferences')
            .upsert(updates, { onConflict: 'user_id' });

        // Also update entity_type in users table if detected
        if (entityType) {
            await supabase
                .from('users')
                .update({ entity_type: entityType })
                .eq('id', internalUserId);
        }

        console.log('[chat-assist] Stored facts for user', internalUserId, ':', factsToAdd);
    } catch (error) {
        console.error('[chat-assist] Fact extraction error:', error);
        // Don't fail the request if fact storage fails
    }
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

        // Extract and store facts from user message (async, non-blocking)
        if (context?.userId) {
            extractAndStoreFacts(context.userId, message).catch(console.error);
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
