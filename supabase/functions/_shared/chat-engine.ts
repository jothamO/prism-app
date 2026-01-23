/**
 * Centralized Chat Engine - V10/V11
 * 
 * Single entry point for ALL chat channels (Web, Telegram, WhatsApp, API).
 * Provides consistent:
 * - Fact extraction and profile learning (V11: structured fields)
 * - Conversation history
 * - System prompt generation
 * - AI response generation
 */

import { generateSystemPrompt } from './prompt-generator.ts';
import { callClaudeConversation, CLAUDE_MODELS } from './claude-client.ts';
import { buildConversationMessages, storeConversationTurn } from './history-service.ts';
import { updateProfileField, addRememberedFact, type Channel } from './memory-service.ts';

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
}

// ============= Profile Extraction (V11 Structured) =============

/**
 * Extract profile data from user message and store in structured fields
 * V11: Uses memory-service for structured profile updates with learning log
 */
async function extractAndStoreProfile(userId: string, message: string, channel: ChatChannel): Promise<string[]> {
    const updates: string[] = [];

    try {
        if (!userId) return [];

        const lowerMessage = message.toLowerCase();
        const memoryChannel = channel as Channel;

        // ============= Entity Type Detection =============
        let entityType: string | null = null;

        if (lowerMessage.includes("i'm a freelancer") || lowerMessage.includes("i am a freelancer")) {
            entityType = 'self_employed';
        }
        if (lowerMessage.includes("i'm self-employed") || lowerMessage.includes("i am self-employed")) {
            entityType = 'self_employed';
        }
        if (lowerMessage.includes("i run a business") || lowerMessage.includes("i own a business")) {
            entityType = 'sme';
        }
        if (lowerMessage.includes("i own a company") || lowerMessage.includes("my company")) {
            entityType = 'company';
        }
        if (lowerMessage.includes("i'm employed") || lowerMessage.includes("i work for")) {
            entityType = 'individual';
        }

        if (entityType) {
            await updateProfileField(userId, 'entity_type', entityType, 'chat', memoryChannel, 0.9);
            updates.push(`entity_type: ${entityType}`);
        }

        // ============= Income Detection =============
        const incomeMatch = message.match(/(?:i\s+(?:earn|make|get)\s+)?[₦n]?([\d,]+)\s*(?:k|m|million|thousand)?\s*(?:per\s+)?(?:month|monthly|annually|yearly|year|per\s+year)/i);
        if (incomeMatch) {
            let amount = parseInt(incomeMatch[1].replace(/,/g, ''));

            // Handle k/m suffixes
            if (lowerMessage.includes('million') || lowerMessage.match(/[\d,]+\s*m\s/)) {
                amount = amount * 1000000;
            } else if (lowerMessage.includes('thousand') || lowerMessage.match(/[\d,]+\s*k\s/)) {
                amount = amount * 1000;
            }

            const isMonthly = lowerMessage.includes('month');
            const annualIncome = isMonthly ? amount * 12 : amount;

            await updateProfileField(userId, 'annual_income', String(annualIncome), 'chat', memoryChannel, 0.8);
            updates.push(`annual_income: ₦${annualIncome.toLocaleString()}`);
        }

        // ============= Name Detection =============
        const nameMatch = message.match(/(?:call\s+me|my\s+name\s+is)\s+([a-z]+)/i);
        if (nameMatch) {
            const preferredName = nameMatch[1];
            await updateProfileField(userId, 'preferred_name', preferredName, 'chat', memoryChannel, 1.0);
            updates.push(`preferred_name: ${preferredName}`);
        }

        // ============= Industry Detection =============
        const industryPatterns: Record<string, string[]> = {
            'technology': ['tech', 'software', 'developer', 'programmer', 'IT', 'startup'],
            'consulting': ['consultant', 'consulting', 'advisory'],
            'trading': ['trader', 'trading', 'import', 'export', 'merchandise'],
            'manufacturing': ['factory', 'manufacturing', 'production'],
            'agriculture': ['farmer', 'farming', 'agriculture', 'agribusiness'],
            'healthcare': ['doctor', 'hospital', 'medical', 'pharmacy'],
            'education': ['teacher', 'school', 'training', 'tutoring'],
            'real_estate': ['real estate', 'property', 'landlord', 'rent'],
        };

        for (const [industry, keywords] of Object.entries(industryPatterns)) {
            if (keywords.some(kw => lowerMessage.includes(kw))) {
                await updateProfileField(userId, 'industry', industry, 'chat', memoryChannel, 0.7);
                updates.push(`industry: ${industry}`);
                break;
            }
        }

        // ============= Tax Registration Detection =============
        const taxTypes: string[] = [];
        if (lowerMessage.includes('vat registered') || lowerMessage.includes('registered for vat')) {
            taxTypes.push('VAT');
        }
        if (lowerMessage.includes('pay paye') || lowerMessage.includes('paye tax')) {
            taxTypes.push('PAYE');
        }
        if (lowerMessage.includes('company income tax') || lowerMessage.includes('cit')) {
            taxTypes.push('CIT');
        }

        if (taxTypes.length > 0) {
            await updateProfileField(userId, 'registered_taxes', JSON.stringify(taxTypes), 'chat', memoryChannel, 0.85);
            updates.push(`registered_taxes: ${taxTypes.join(', ')}`);
        }

        // ============= Free-form "Remember" Requests =============
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
        profileUpdates: profileUpdates.length > 0 ? profileUpdates : undefined,
    };
}
