/**
 * Centralized Chat Engine - V10/V11/V23
 * 
 * Single entry point for ALL chat channels (Web, Telegram, WhatsApp, API).
 * Provides consistent:
 * - Fact extraction and profile learning (V11: structured fields)
 * - Conversation history
 * - System prompt generation
 * - AI response generation
 * - Action execution (V23: AI-triggered actions)
 */

import { generateSystemPrompt } from './context-builder.ts';
import { callClaudeConversation, CLAUDE_MODELS } from './claude-client.ts';
import { buildConversationMessages, storeConversationTurn } from './history-service.ts';
import { updateProfileField, addRememberedFact, type Channel } from './memory-service.ts';
import { executeAction, extractActionsFromResponse, cleanResponseActions, type ActionResult } from './action-service.ts';
import { extractProfileSignals } from './nlu-service.ts';

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
    profileUpdates?: string[];
    actionResults?: ActionResult[];
}

// ============= Profile Extraction (V11 Structured) =============

/**
 * Extract profile data from user message and store in structured fields.
 * V11: Uses memory-service for structured profile updates with learning log.
 */
async function extractAndStoreProfile(userId: string, message: string, channel: ChatChannel): Promise<string[]> {
    const updates: string[] = [];
    if (!userId) return [];

    try {
        const signals = extractProfileSignals(message);
        const memoryChannel = channel as Channel;

        for (const signal of signals) {
            await updateProfileField(userId, signal.field, signal.value, 'chat', memoryChannel, signal.confidence);
            updates.push(`${signal.field}: ${signal.value}`);
        }

        // ============= Free-form "Remember" Requests (Special Case) =============
        const rememberMatch = message.match(/remember\s+(?:that\s+)?(.+)/i);
        if (rememberMatch) {
            const fact = rememberMatch[1].trim();
            await addRememberedFact(userId, fact, 'chat', memoryChannel);
            updates.push(`fact: "${fact}"`);
        }

        if (updates.length > 0) {
            console.log(`[chat-engine] Updated profile for user ${userId} via ${channel}:`, updates);
        }

        return updates;
    } catch (error) {
        console.error('[chat-engine] Profile extraction error:', error);
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

    // 1. Extract and store profile data (V11 structured)
    let profileUpdates: string[] = [];
    if (userId) {
        profileUpdates = await extractAndStoreProfile(userId, message, channel);
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

    // 5. Execute actions from AI response (V23)
    let actionResults: ActionResult[] = [];
    let cleanedResponse = result.response;

    if (userId) {
        const actions = extractActionsFromResponse(result.response);
        if (actions.length > 0) {
            console.log(`[chat-engine] Found ${actions.length} actions to execute`);
            actionResults = await Promise.all(
                actions.map(action => executeAction({
                    ...action,
                    userId,
                    channel
                }))
            );
            cleanedResponse = cleanResponseActions(result.response);

            // Append action results to response
            const successActions = actionResults.filter(r => r.success);
            if (successActions.length > 0) {
                cleanedResponse += '\n\n' + successActions.map(r => `✅ ${r.message}`).join('\n');
            }
        }
    }

    // 6. Store conversation turn for persistency across platforms
    if (userId) {
        try {
            await storeConversationTurn(userId, channel, message, cleanedResponse);
        } catch (err) {
            console.error('[chat-engine] Failed to store conversation:', err);
        }
    }

    return {
        response: cleanedResponse,
        usage: result.usage,
        profileUpdates: profileUpdates.length > 0 ? profileUpdates : undefined,
        actionResults: actionResults.length > 0 ? actionResults : undefined,
    };
}
