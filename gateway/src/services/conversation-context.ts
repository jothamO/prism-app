/**
 * Conversation Context Service
 * Tracks conversation history and entities for context-aware follow-ups
 */

import { logger } from '../utils/logger';

interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    intent?: string;
    entities?: Record<string, unknown>;
}

interface ConversationMemory {
    messages: ConversationMessage[];
    entities: Record<string, unknown>;
    lastIntent?: string;
    lastUpdated: number;
}

// Memory retention settings
const MAX_MESSAGES = 10;
const CONTEXT_TTL_MS = 30 * 60 * 1000; // 30 minutes

export class ConversationContextService {
    private memory: Map<string, ConversationMemory> = new Map();

    /**
     * Add a user message to conversation context
     */
    addUserMessage(
        userId: string,
        message: string,
        intent?: string,
        entities?: Record<string, unknown>
    ): void {
        const context = this.getOrCreateContext(userId);

        context.messages.push({
            role: 'user',
            content: message,
            timestamp: Date.now(),
            intent,
            entities
        });

        // Merge entities into context
        if (entities) {
            context.entities = { ...context.entities, ...entities };
        }

        if (intent) {
            context.lastIntent = intent;
        }

        context.lastUpdated = Date.now();
        this.trimMessages(context);
        this.memory.set(userId, context);

        logger.debug('[ConversationContext] Added user message', {
            userId,
            intent,
            entityCount: entities ? Object.keys(entities).length : 0
        });
    }

    /**
     * Add an assistant message to conversation context
     */
    addAssistantMessage(userId: string, message: string): void {
        const context = this.getOrCreateContext(userId);

        context.messages.push({
            role: 'assistant',
            content: message,
            timestamp: Date.now()
        });

        context.lastUpdated = Date.now();
        this.trimMessages(context);
        this.memory.set(userId, context);
    }

    /**
     * Get recent messages for NLU context
     */
    getRecentMessages(userId: string, limit: number = 5): Array<{ role: string; content: string }> {
        const context = this.memory.get(userId);
        if (!context) return [];

        // Check if context is stale
        if (Date.now() - context.lastUpdated > CONTEXT_TTL_MS) {
            this.clearContext(userId);
            return [];
        }

        return context.messages.slice(-limit).map(m => ({
            role: m.role,
            content: m.content
        }));
    }

    /**
     * Get stored entities for context-aware responses
     */
    getEntities(userId: string): Record<string, unknown> {
        const context = this.memory.get(userId);
        if (!context) return {};

        // Check if context is stale
        if (Date.now() - context.lastUpdated > CONTEXT_TTL_MS) {
            this.clearContext(userId);
            return {};
        }

        return context.entities;
    }

    /**
     * Get the last detected intent
     */
    getLastIntent(userId: string): string | undefined {
        const context = this.memory.get(userId);
        if (!context) return undefined;

        // Check if context is stale
        if (Date.now() - context.lastUpdated > CONTEXT_TTL_MS) {
            this.clearContext(userId);
            return undefined;
        }

        return context.lastIntent;
    }

    /**
     * Detect if current message is a follow-up to previous context
     */
    isFollowUp(userId: string, message: string): boolean {
        const context = this.memory.get(userId);
        if (!context || context.messages.length === 0) return false;

        // Check if context is stale
        if (Date.now() - context.lastUpdated > CONTEXT_TTL_MS) {
            return false;
        }

        const lower = message.toLowerCase();

        // Common follow-up patterns
        const followUpPatterns = [
            /^(what about|how about|and|also|then)\b/i,
            /^(yes|no|okay|ok|sure|please)\s*$/i,
            /^(that|this|it)\b/i,
            /\b(instead|also|too|as well)\b/i,
            /^(more|less|another)\b/i
        ];

        for (const pattern of followUpPatterns) {
            if (pattern.test(lower)) {
                return true;
            }
        }

        // Check if message references previous entities
        const lastMessage = context.messages[context.messages.length - 1];
        if (lastMessage?.entities) {
            const entityValues = Object.values(lastMessage.entities);
            for (const value of entityValues) {
                if (typeof value === 'string' && lower.includes(value.toLowerCase())) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Merge follow-up context with new message
     */
    getMergedEntities(userId: string, newEntities: Record<string, unknown>): Record<string, unknown> {
        const storedEntities = this.getEntities(userId);
        
        // New entities take precedence
        return {
            ...storedEntities,
            ...newEntities
        };
    }

    /**
     * Get context summary for debugging
     */
    getContextSummary(userId: string): {
        messageCount: number;
        entityCount: number;
        lastIntent?: string;
        ageSeconds: number;
    } | null {
        const context = this.memory.get(userId);
        if (!context) return null;

        return {
            messageCount: context.messages.length,
            entityCount: Object.keys(context.entities).length,
            lastIntent: context.lastIntent,
            ageSeconds: Math.floor((Date.now() - context.lastUpdated) / 1000)
        };
    }

    /**
     * Clear conversation context for a user
     */
    clearContext(userId: string): void {
        this.memory.delete(userId);
        logger.debug('[ConversationContext] Cleared context', { userId });
    }

    /**
     * Cleanup stale contexts (call periodically)
     */
    cleanupStaleContexts(): number {
        const now = Date.now();
        let cleaned = 0;

        for (const [userId, context] of this.memory.entries()) {
            if (now - context.lastUpdated > CONTEXT_TTL_MS) {
                this.memory.delete(userId);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.info('[ConversationContext] Cleaned stale contexts', { count: cleaned });
        }

        return cleaned;
    }

    /**
     * Get or create conversation context
     */
    private getOrCreateContext(userId: string): ConversationMemory {
        const existing = this.memory.get(userId);
        
        if (existing && Date.now() - existing.lastUpdated < CONTEXT_TTL_MS) {
            return existing;
        }

        return {
            messages: [],
            entities: {},
            lastUpdated: Date.now()
        };
    }

    /**
     * Trim messages to max limit
     */
    private trimMessages(context: ConversationMemory): void {
        if (context.messages.length > MAX_MESSAGES) {
            context.messages = context.messages.slice(-MAX_MESSAGES);
        }
    }
}

// Export singleton instance
export const conversationContext = new ConversationContextService();

// Start periodic cleanup
setInterval(() => {
    conversationContext.cleanupStaleContexts();
}, 5 * 60 * 1000); // Every 5 minutes
