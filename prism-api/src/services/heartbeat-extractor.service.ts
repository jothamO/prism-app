import { supabase } from '../config/database';
import fetch from 'node-fetch';

export interface ExtractedFact {
    entity_name: string;
    fact_content: any;
    confidence: number;
    para_layer: 'project' | 'area' | 'resource' | 'archive';
    source_message_id?: string;
}

const HEARTBEAT_PROMPT = `You are a Tax Fact Extractor for PRISM, a Nigerian tax assistant. 
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
}`;

export class HeartbeatExtractorService {
    private get anthropicApiKey() {
        return process.env.ANTHROPIC_API_KEY;
    }

    /**
     * Run heartbeat extraction for all users who have new messages
     */
    async runGlobalHeartbeat() {
        console.log('💓 Starting Global Heartbeat Extraction...');

        // Fetch users who have messages created AFTER their last_heartbeat_at
        // We use a subquery to find users with recent messages
        const { data: users, error } = await supabase
            .from('users')
            .select('id, last_heartbeat_at');

        if (error) {
            console.error('❌ Error fetching users for heartbeat:', error);
            return;
        }

        for (const user of users) {
            await this.processUserHeartbeat(user.id, user.last_heartbeat_at);
        }
    }

    /**
     * Process heartbeat for a single user
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

            console.log(`🔍 Scanning ${messages.length} messages for user ${userId}...`);

            // 2. Extract facts using NLU
            const combinedContent = messages.map(m => m.content).join('\n---\n');
            const extractedFacts = await this.extractFactsWithAI(combinedContent);

            if (extractedFacts.length > 0) {
                console.log(`✅ Extracted ${extractedFacts.length} facts for user ${userId}`);

                // 3. Persist facts with supersession logic
                for (const fact of extractedFacts) {
                    await this.persistFact(userId, fact);
                }
            }

            // 4. Update last_heartbeat_at
            await supabase
                .from('users')
                .update({ last_heartbeat_at: new Date().toISOString() })
                .eq('id', userId);

        } catch (error) {
            console.error(`❌ Heartbeat failed for user ${userId}:`, error);
        }
    }

    /**
     * Call AI to extract facts from message history
     */
    private async extractFactsWithAI(text: string): Promise<ExtractedFact[]> {
        if (!this.anthropicApiKey) {
            console.warn('⚠️ ANTHROPIC_API_KEY not set, skipping AI extraction');
            return [];
        }

        try {
            const prompt = `${HEARTBEAT_PROMPT}\n\nUser Messages:\n${text}\n\nExtract facts and respond with JSON only.`;

            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.anthropicApiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: 2000,
                    system: 'You are a precise tax fact extractor. Always respond with valid JSON.',
                    messages: [{ role: 'user', content: prompt }]
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error(`❌ AI API error: ${response.status}`, {
                    body: errorBody,
                    model: 'claude-haiku-4-5-20251001',
                    keyPreview: this.anthropicApiKey ? `${this.anthropicApiKey.substring(0, 10)}...` : 'MISSING'
                });
                throw new Error(`AI API error: ${response.status}`);
            }

            const data: any = await response.json();
            const content = data.content?.[0]?.text;
            if (!content) return [];

            const result = JSON.parse(content);
            return (result.facts || []) as ExtractedFact[];

        } catch (error) {
            console.error('AI Fact Extraction error:', error);
            return [];
        }
    }

    /**
     * Save fact to atomic_facts and handle supersession
     */
    private async persistFact(userId: string, fact: ExtractedFact) {
        // 1. Mark existing facts of the SAME entity_name as superseded
        const { error: superError } = await supabase
            .from('atomic_facts')
            .update({ is_superseded: true })
            .eq('user_id', userId)
            .eq('entity_name', fact.entity_name)
            .eq('is_superseded', false);

        if (superError) console.error('Supersession error:', superError);

        // 2. Insert new fact
        const { error: insError } = await supabase
            .from('atomic_facts')
            .insert({
                user_id: userId,
                entity_name: fact.entity_name,
                fact_content: fact.fact_content,
                confidence: fact.confidence,
                layer: fact.para_layer,
                is_superseded: false,
                source_metadata: {
                    reasoning: (fact as any).reasoning,
                    extracted_at: new Date().toISOString()
                }
            });

        if (insError) console.error('Fact insertion error:', insError);
    }
}

export const heartbeatExtractorService = new HeartbeatExtractorService();
