/**
 * Shared Chat History Service
 * Centralized message storage for all channels (Web, Telegram, WhatsApp, API)
 */

import { getSupabaseAdmin } from './supabase.ts';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    created_at?: string;
}

export interface StoredMessage {
    id: string;
    user_id: string;
    platform: string;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
}

/**
 * Get recent chat history for a user
 * @param userId - Internal user ID (from users table)
 * @param limit - Number of messages to retrieve (default: 6)
 * @param platform - Optional platform filter (telegram, whatsapp, web, api)
 */
export async function getChatHistory(
    userId: string,
    limit: number = 6,
    platform?: string
): Promise<ChatMessage[]> {
    const supabase = getSupabaseAdmin();

    let query = supabase
        .from('chat_messages')
        .select('role, content, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (platform) {
        query = query.eq('platform', platform);
    }

    const { data, error } = await query;

    if (error) {
        console.error('[history-service] Error fetching history:', error);
        return [];
    }

    // Reverse to get chronological order (oldest first)
    return (data || []).reverse().map((m: { role: string; content: string; created_at: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        created_at: m.created_at
    }));
}

/**
 * Store a message to chat history
 * @param userId - Internal user ID
 * @param platform - Source platform (telegram, whatsapp, web, api)
 * @param role - Message role (user or assistant)
 * @param content - Message content
 */
export async function storeMessage(
    userId: string,
    platform: string,
    role: 'user' | 'assistant',
    content: string
): Promise<void> {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase.from('chat_messages').insert({
        user_id: userId,
        platform,
        role,
        content
    });

    if (error) {
        console.error('[history-service] Error storing message:', error);
    }
}

/**
 * Store both user message and assistant response
 * Convenience function for full conversation turn
 */
export async function storeConversationTurn(
    userId: string,
    platform: string,
    userMessage: string,
    assistantResponse: string
): Promise<void> {
    await storeMessage(userId, platform, 'user', userMessage);
    await storeMessage(userId, platform, 'assistant', assistantResponse);
}

/**
 * Build message array for Claude conversation
 * Includes history plus optional current message
 */
export function buildConversationMessages(
    history: ChatMessage[],
    currentMessage?: string
): Array<{ role: 'user' | 'assistant'; content: string }> {
    const messages = history.map(m => ({
        role: m.role,
        content: m.content
    }));

    if (currentMessage) {
        messages.push({
            role: 'user' as const,
            content: currentMessage
        });
    }

    return messages;
}

/**
 * Clear chat history for a user
 * Optional: filter by platform
 */
export async function clearHistory(
    userId: string,
    platform?: string
): Promise<number> {
    const supabase = getSupabaseAdmin();

    let query = supabase
        .from('chat_messages')
        .delete()
        .eq('user_id', userId);

    if (platform) {
        query = query.eq('platform', platform);
    }

    const { data, error } = await query.select('id');

    if (error) {
        console.error('[history-service] Error clearing history:', error);
        return 0;
    }

    return data?.length || 0;
}
