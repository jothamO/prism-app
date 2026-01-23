/**
 * Shared Claude AI Client for Supabase Edge Functions
 * Uses Anthropic API for LLM-powered extraction and classification
 */

interface ClaudeMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface ClaudeResponse {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    model: string;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
}

// Model configurations
export const CLAUDE_MODELS = {
    // Fast, cheap - ideal for NLU, intent classification
    HAIKU: 'claude-haiku-4-5-20251001',
    // Balanced - for chat, document analysis, OCR
    SONNET: 'claude-sonnet-4-5-20250929',
    // Powerful - for complex code generation, ML training
    OPUS: 'claude-opus-4-5-20251101',
} as const;

export type ClaudeModel = typeof CLAUDE_MODELS[keyof typeof CLAUDE_MODELS];

/**
 * Multi-turn conversation result
 */
export interface ConversationResult {
    response: string;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
}

/**
 * Call Claude API (single-turn) with automatic retry for rate limits
 */
export async function callClaude(
    systemPrompt: string,
    userMessage: string,
    options: {
        model?: ClaudeModel;
        maxTokens?: number;
        temperature?: number;
        maxRetries?: number;
    } = {}
): Promise<string> {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!apiKey) {
        console.warn('[claude-client] No ANTHROPIC_API_KEY, using fallback');
        throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const {
        model = CLAUDE_MODELS.HAIKU,
        maxTokens = 8000,
        temperature = 0.3,
        maxRetries = 3,
    } = options;

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model,
                    max_tokens: maxTokens,
                    temperature,
                    system: systemPrompt,
                    messages: [
                        { role: 'user', content: userMessage }
                    ],
                }),
            });

            if (response.status === 429) {
                // Rate limited - extract retry-after or use exponential backoff
                const retryAfter = response.headers.get('retry-after');
                const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt) * 30000; // 30s, 60s, 120s
                console.warn(`[claude-client] Rate limited (429). Retrying in ${delay/1000}s (attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                lastError = new Error(`Claude API rate limited: 429`);
                continue;
            }

            if (!response.ok) {
                const error = await response.text();
                console.error('[claude-client] API error:', error);
                throw new Error(`Claude API error: ${response.status}`);
            }

            const data: ClaudeResponse = await response.json();

            console.log(`[claude-client] ${model} used ${data.usage.input_tokens}+${data.usage.output_tokens} tokens`);

            return data.content[0]?.text || '';
        } catch (error) {
            if (error instanceof Error && error.message.includes('429')) {
                lastError = error;
                // Already handled above, but in case of network errors during retry
                const delay = Math.pow(2, attempt) * 30000;
                console.warn(`[claude-client] Retrying after error in ${delay/1000}s (attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            console.error('[claude-client] Error calling Claude:', error);
            throw error;
        }
    }
    
    // Max retries exceeded
    console.error(`[claude-client] Max retries (${maxRetries}) exceeded for rate limiting`);
    throw lastError || new Error('Max retries exceeded for Claude API rate limiting');
}

/**
 * Call Claude API with multi-turn conversation history
 * Use this for chat interfaces where context from previous turns matters
 */
export async function callClaudeConversation(
    systemPrompt: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    options: {
        model?: ClaudeModel;
        maxTokens?: number;
        temperature?: number;
    } = {}
): Promise<ConversationResult> {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!apiKey) {
        console.warn('[claude-client] No ANTHROPIC_API_KEY');
        throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const {
        model = CLAUDE_MODELS.SONNET,  // Default to Sonnet for conversations
        maxTokens = 8000,
        temperature = 0.5,  // Slightly higher for more natural conversation
    } = options;

    // Validate messages array
    if (!messages || messages.length === 0) {
        throw new Error('Messages array cannot be empty');
    }

    // Ensure last message is from user
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') {
        throw new Error('Last message must be from user');
    }

    console.log(`[claude-client] Conversation with ${messages.length} turns`);

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model,
                max_tokens: maxTokens,
                temperature,
                system: systemPrompt,
                messages: messages.map(m => ({
                    role: m.role,
                    content: m.content
                })),
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[claude-client] Conversation API error:', error);
            throw new Error(`Claude API error: ${response.status}`);
        }

        const data: ClaudeResponse = await response.json();

        console.log(`[claude-client] Conversation ${model} used ${data.usage.input_tokens}+${data.usage.output_tokens} tokens`);

        return {
            response: data.content[0]?.text || '',
            usage: {
                input_tokens: data.usage.input_tokens,
                output_tokens: data.usage.output_tokens,
            }
        };
    } catch (error) {
        console.error('[claude-client] Error in conversation:', error);
        throw error;
    }
}

/**
 * Extract structured JSON from Claude response
 */
export async function callClaudeJSON<T>(
    systemPrompt: string,
    userMessage: string,
    options: {
        model?: ClaudeModel;
        maxTokens?: number;
    } = {}
): Promise<T | null> {
    const response = await callClaude(
        systemPrompt + '\n\nRespond ONLY with valid JSON, no markdown or explanation.',
        userMessage,
        { ...options, temperature: 0.1 }
    );

    try {
        // Strip markdown code blocks if present
        let cleaned = response.trim();
        if (cleaned.startsWith('```json')) {
            cleaned = cleaned.slice(7);
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.slice(3);
        }
        if (cleaned.endsWith('```')) {
            cleaned = cleaned.slice(0, -3);
        }
        cleaned = cleaned.trim();

        // Try to extract JSON array [...] or object {...} from response
        const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
        const objectMatch = cleaned.match(/\{[\s\S]*\}/);

        if (arrayMatch && (!objectMatch || arrayMatch.index! <= objectMatch.index!)) {
            return JSON.parse(arrayMatch[0]) as T;
        }
        if (objectMatch) {
            return JSON.parse(objectMatch[0]) as T;
        }
        return JSON.parse(cleaned) as T;
    } catch (error) {
        console.error('[claude-client] Failed to parse JSON:', response.slice(0, 500));

        // Try to recover partial JSON by closing unclosed brackets/braces
        try {
            let partial = response.trim();
            // Remove markdown if present
            if (partial.startsWith('```json')) partial = partial.slice(7);
            else if (partial.startsWith('```')) partial = partial.slice(3);
            if (partial.endsWith('```')) partial = partial.slice(0, -3);
            partial = partial.trim();

            // Extract the JSON-like content
            const jsonStart = partial.indexOf('[') !== -1 ? partial.indexOf('[') : partial.indexOf('{');
            if (jsonStart !== -1) {
                partial = partial.slice(jsonStart);
            }

            // Count unclosed brackets
            const openBrackets = (partial.match(/\[/g) || []).length;
            const closeBrackets = (partial.match(/\]/g) || []).length;
            const openBraces = (partial.match(/\{/g) || []).length;
            const closeBraces = (partial.match(/\}/g) || []).length;

            // Close unclosed structures
            for (let i = 0; i < openBraces - closeBraces; i++) partial += '}';
            for (let i = 0; i < openBrackets - closeBrackets; i++) partial += ']';

            const recovered = JSON.parse(partial);
            console.warn('[claude-client] Recovered partial JSON with', Array.isArray(recovered) ? recovered.length : 1, 'items');
            return recovered as T;
        } catch {
            console.error('[claude-client] JSON recovery failed');
            return null;
        }
    }
}

