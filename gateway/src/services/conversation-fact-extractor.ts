/**
 * Conversation Fact Extractor for Gateway (Telegram/WhatsApp)
 * Mirrors the fact extraction logic from Web chat-assist
 * Extracts durable facts from user messages and stores them
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import config from '../config';

interface ExtractedFacts {
    entityType: string | null;
    incomeEstimate: number | null;
    preferredName: string | null;
    rememberedFacts: string[];
}

export class ConversationFactExtractor {
    private supabase: ReturnType<typeof createClient>;

    constructor() {
        this.supabase = createClient(config.supabase.url, config.supabase.serviceKey);
    }

    /**
     * Extract facts from a message and store them
     * @param userId - Internal users.id (UUID)
     * @param message - User's message text
     */
    async extractAndStore(userId: string, message: string): Promise<void> {
        try {
            if (!userId || !message?.trim()) return;

            const extracted = this.extractFacts(message);

            // Only proceed if we found something
            if (
                extracted.rememberedFacts.length === 0 &&
                !extracted.entityType &&
                !extracted.incomeEstimate &&
                !extracted.preferredName
            ) {
                return;
            }

            logger.info('[FactExtractor] Extracted facts from message', {
                userId,
                factsCount: extracted.rememberedFacts.length,
                entityType: extracted.entityType,
                hasIncome: !!extracted.incomeEstimate,
                hasName: !!extracted.preferredName
            });

            // Get existing preferences
            const { data: existing } = await this.supabase
                .from('user_preferences')
                .select('remembered_facts')
                .eq('user_id', userId)
                .single();

            const existingFacts: string[] = existing?.remembered_facts || [];
            const newFacts = [...new Set([...existingFacts, ...extracted.rememberedFacts])];

            // Upsert preferences
            const updates: Record<string, unknown> = {
                user_id: userId,
                remembered_facts: newFacts,
                updated_at: new Date().toISOString(),
            };

            if (extracted.preferredName) updates.preferred_name = extracted.preferredName;
            if (extracted.incomeEstimate) updates.income_estimate = extracted.incomeEstimate;

            await this.supabase
                .from('user_preferences')
                .upsert(updates, { onConflict: 'user_id' });

            // Update entity_type in users table if detected
            if (extracted.entityType) {
                await this.supabase
                    .from('users')
                    .update({ entity_type: extracted.entityType })
                    .eq('id', userId);
            }

            logger.info('[FactExtractor] Stored facts for user', {
                userId,
                facts: extracted.rememberedFacts
            });
        } catch (error) {
            logger.error('[FactExtractor] Error storing facts:', error);
            // Don't throw - fact storage shouldn't break the conversation
        }
    }

    /**
     * Extract facts from message text (pure function)
     */
    private extractFacts(message: string): ExtractedFacts {
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
            if (!factsToAdd.includes('User is a freelancer')) {
                factsToAdd.push('User is self-employed');
            }
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
        const incomeMatch = message.match(
            /(?:i\s+(?:earn|make|get)\s+)?[₦n]?([\d,]+)\s*(?:per\s+)?(?:month|monthly|annually|yearly|year|per\s+year)/i
        );
        if (incomeMatch) {
            const amount = parseInt(incomeMatch[1].replace(/,/g, ''));
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

        // Detect industry/profession mentions
        if (lowerMessage.includes("i'm a developer") || lowerMessage.includes("i am a developer")) {
            factsToAdd.push('User works in software/tech');
        }
        if (lowerMessage.includes("i'm a doctor") || lowerMessage.includes("i am a doctor")) {
            factsToAdd.push('User is a medical professional');
        }
        if (lowerMessage.includes("i'm a lawyer") || lowerMessage.includes("i am a lawyer")) {
            factsToAdd.push('User is a legal professional');
        }
        if (lowerMessage.includes("i sell") || lowerMessage.includes("i trade")) {
            factsToAdd.push('User is involved in trading/sales');
        }

        return {
            entityType,
            incomeEstimate,
            preferredName,
            rememberedFacts: factsToAdd
        };
    }
}

// Singleton instance
let factExtractorInstance: ConversationFactExtractor | null = null;

export function getFactExtractor(): ConversationFactExtractor {
    if (!factExtractorInstance) {
        factExtractorInstance = new ConversationFactExtractor();
    }
    return factExtractorInstance;
}
