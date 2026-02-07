/**
 * Heartbeat Fact Extraction
 * Autonomously extracts durable tax facts from conversation logs.
 */

import { supabase } from '../config';
import { aiClient } from '../utils/ai-client';
import { MemoryManager, PARALayer } from './memory-manager';
import { logger } from '../utils/logger';

export interface ExtractedFact {
    entity_name: string;
    fact_content: any;
    confidence: number;
    para_layer: PARALayer;
    reasoning?: string;
}

const HEARTBEAT_PROMPT = `
You are a Tax Fact Extractor for PRISM, a Nigerian tax assistant. 
Review the following user chat messages and extract "Durable Tax Facts" that should be remembered for future filings.

Durable facts include:
- TIN (Tax Identification Number)
- Business Name or Registration Date (CAC)
- Annual or Monthly Revenue/Income
- Industry or Business Sector
- Physical Location (State/LGA)
- Number of Employees
- Startup Status or Small Business Eligibility

Rules:
1. ONLY extract facts that are stated with high certainty.
2. If the user is asking a question (e.g., "What is a TIN?"), do NOT extract it as a fact.
3. If multiple facts are found, list them all.
4. Categorize facts by PARA layer:
   - "area": Durable properties (TIN, Location, Industry, Employees, CAC).
   - "project": Periodic or one-time data (Revenue for a specific year, a specific filing deadline).

Respond in JSON format ONLY:
{
  "facts": [
    {
      "entity_name": "TIN",
      "fact_content": "12345678-0001",
      "confidence": 0.95,
      "para_layer": "area",
      "reasoning": "User explicitly stated 'My TIN is...'"
    }
  ]
}
`.trim();

export class HeartbeatExtractor {
    /**
     * Run heartbeat extraction for all users with new messages.
     */
    async runGlobalHeartbeat() {
        logger.info('[Heartbeat] Starting Global Heartbeat Extraction...');

        const { data: users, error } = await supabase
            .from('users')
            .select('id, last_heartbeat_at');

        if (error) {
            logger.error('[Heartbeat] Error fetching users for heartbeat:', { error });
            return;
        }

        for (const user of users) {
            await this.processUserHeartbeat(user.id, user.last_heartbeat_at);
        }
    }

    /**
     * Process heartbeat for a single user.
     */
    async processUserHeartbeat(userId: string, lastHeartbeatAt: string | null) {
        try {
            // 1. Fetch messages since last heartbeat
            let query = supabase
                .from('messages')
                .select('id, content, created_at')
                .eq('user_id', userId)
                .eq('direction', 'incoming');

            if (lastHeartbeatAt) {
                query = query.gt('created_at', lastHeartbeatAt);
            }

            const { data: messages, error: msgError } = await query.order('created_at', { ascending: true });

            if (msgError) throw msgError;
            if (!messages || messages.length === 0) return;

            // Cap to last 20 messages to manage prompt size
            const cappedMessages = messages.slice(-20);
            logger.info(`[Heartbeat] Scanning ${cappedMessages.length} messages for user ${userId}...`);

            // 2. Extract facts using NLU
            const combinedContent = cappedMessages.map(m => m.content).join('\n---\n');
            const extractedFacts = await this.extractFactsWithAI(combinedContent);

            if (extractedFacts.length > 0) {
                logger.info(`[Heartbeat] Extracted ${extractedFacts.length} facts for user ${userId}`);

                // 3. Persist facts using MemoryManager (handles supersession)
                for (const fact of extractedFacts) {
                    try {
                        await MemoryManager.storeFact({
                            user_id: userId,
                            entity_name: fact.entity_name,
                            fact_content: fact.fact_content,
                            confidence: fact.confidence,
                            layer: fact.para_layer,
                            source_metadata: {
                                reasoning: fact.reasoning,
                                extracted_at: new Date().toISOString()
                            }
                        });
                    } catch (storeError) {
                        logger.error('[Heartbeat] Failed to store fact', { entity: fact.entity_name, storeError });
                    }
                }
            }

            // 4. Update last_heartbeat_at
            await supabase
                .from('users')
                .update({ last_heartbeat_at: new Date().toISOString() })
                .eq('id', userId);

        } catch (error) {
            logger.error(`[Heartbeat] Heartbeat failed for user ${userId}:`, { error });
        }
    }

    /**
     * Call AI (Fast Tier) to extract facts from message history.
     */
    private async extractFactsWithAI(text: string): Promise<ExtractedFact[]> {
        try {
            const prompt = `${HEARTBEAT_PROMPT}\n\nUser Messages:\n${text}\n\nExtract facts and respond with JSON only.`;

            const response = await aiClient.chat({
                tier: 'fast',
                maxTokens: 2000,
                messages: [
                    { role: 'system', content: 'You are a precise tax fact extractor. Always respond with valid JSON.' },
                    { role: 'user', content: prompt }
                ]
            });

            if (!response) return [];

            // Extract JSON from response (handling potential markdown formatting)
            const jsonText = this.extractJson(response);
            logger.info('[Heartbeat] AI RAW Response JSON:', { jsonText });
            const result = JSON.parse(jsonText);

            const facts = (result.facts || []) as ExtractedFact[];
            logger.info('[Heartbeat] AI Extracted Facts:', { count: facts.length, facts });
            return facts;

        } catch (error) {
            logger.error('[Heartbeat] AI Fact Extraction error:', { error });
            return [];
        }
    }

    private extractJson(content: string): string {
        const match = content.match(/\{[\s\S]*\}/);
        return match ? match[0] : content;
    }
}

export const heartbeatExtractor = new HeartbeatExtractor();
