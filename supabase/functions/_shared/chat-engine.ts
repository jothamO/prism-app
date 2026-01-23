/**
 * Centralized Chat Engine - V10
 * 
 * Single entry point for ALL chat channels (Web, Telegram, WhatsApp, API).
 * Provides consistent:
 * - Fact extraction and profile learning
 * - Conversation history
 * - System prompt generation
 * - AI response generation
 */

import { getSupabaseAdmin } from './supabase.ts';
import { generateSystemPrompt } from './prompt-generator.ts';
import { callClaudeConversation, CLAUDE_MODELS } from './claude-client.ts';
import { buildConversationMessages, getChatHistory, storeConversationTurn } from './history-service.ts';

// ============= Types =============

export type ChatChannel = 'web' | 'telegram' | 'whatsapp' | 'api';

export interface ChatRequest {
    userId: string;
    message: string;
    channel: ChatChannel;
    context?: {
        totalIncome?: number;
        totalExpenses?: number;
        emtlPaid?: number;
        transactionCount?: number;
    };
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface ChatResponse {
    response: string;
    usage?: {
        input_tokens: number;
        output_tokens: number;
    };
    factsExtracted?: string[];
}

// ============= Fact Extraction =============

/**
 * Extract durable facts from user message (Clawd-inspired)
 * Only stores facts that are explicitly stated or requested
 */
async function extractAndStoreFacts(userId: string, message: string, channel: ChatChannel): Promise<string[]> {
    const factsExtracted: string[] = [];

    try {
        if (!userId) return [];

        const supabase = getSupabaseAdmin();

        // Resolve auth_user_id to internal users.id
        let internalUserId = userId;
        const { data: userByAuthId } = await supabase
            .from('users')
            .select('id')
            .eq('auth_user_id', userId)
            .single();

        if (userByAuthId) {
            internalUserId = userByAuthId.id;
        } else {
            // Try direct lookup
            const { data: userDirect } = await supabase
                .from('users')
                .select('id')
                .eq('id', userId)
                .single();

            if (!userDirect) {
                console.log(`[chat-engine] User not found for fact extraction: ${userId}`);
                return [];
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
            factsToAdd.push('User is self-employed');
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
            return [];
        }

        // Get existing preferences
        const { data: existing } = await supabase
            .from('user_preferences')
            .select('remembered_facts')
            .eq('user_id', internalUserId)
            .single();

        const existingFacts: string[] = existing?.remembered_facts || [];
        const newFacts = [...new Set([...existingFacts, ...factsToAdd])];

        // Upsert preferences
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

        // Update entity_type in users table if detected
        if (entityType) {
            await supabase
                .from('users')
                .update({ entity_type: entityType })
                .eq('id', internalUserId);
        }

        console.log(`[chat-engine] Stored facts for user ${internalUserId} via ${channel}:`, factsToAdd);
        return factsToAdd;
    } catch (error) {
        console.error('[chat-engine] Fact extraction error:', error);
        return [];
    }
}

// ============= Main Entry Point =============

/**
 * Process a chat message from any channel.
 * This is the SINGLE entry point for all chat interactions.
 */
export async function processMessage(request: ChatRequest): Promise<ChatResponse> {
    const { userId, message, channel, context, history = [] } = request;

    console.log(`[chat-engine] Processing message from ${channel} for user ${userId || 'anonymous'}`);

    // 1. Extract and store facts (async, non-blocking for response but we capture result)
    let factsExtracted: string[] = [];
    if (userId) {
        factsExtracted = await extractAndStoreFacts(userId, message, channel);
    }

    // 2. Build context-aware system prompt from database
    const systemPrompt = await generateSystemPrompt(userId, {
        totalIncome: context?.totalIncome,
        totalExpenses: context?.totalExpenses,
        emtlPaid: context?.emtlPaid,
        transactionCount: context?.transactionCount,
    });

    console.log(`[chat-engine] Generated system prompt for ${channel}`);

    // 3. Build conversation messages
    const messages = buildConversationMessages(history, message);

    console.log(`[chat-engine] Processing with ${messages.length} message turns`);

    // 4. Call Claude
    const result = await callClaudeConversation(
        systemPrompt,
        messages,
        { model: CLAUDE_MODELS.SONNET }
    );

    console.log(`[chat-engine] Response generated (${result.response.length} chars)`);

    // 5. Store conversation turn (for channels that support DB history)
    if (userId && (channel === 'telegram' || channel === 'whatsapp')) {
        try {
            await storeConversationTurn(userId, message, result.response, channel);
        } catch (err) {
            console.error('[chat-engine] Failed to store conversation:', err);
        }
    }

    return {
        response: result.response,
        usage: result.usage,
        factsExtracted: factsExtracted.length > 0 ? factsExtracted : undefined,
    };
}
