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
    // Fast, cheap - ideal for profile extraction, simple classification
    HAIKU: 'claude-haiku-4-5-20251001',
    // Powerful - for complex NLU, document analysis
    SONNET: 'claude-sonnet-4-5-20250929',
} as const;

export type ClaudeModel = typeof CLAUDE_MODELS[keyof typeof CLAUDE_MODELS];

/**
 * Call Claude API
 */
export async function callClaude(
    systemPrompt: string,
    userMessage: string,
    options: {
        model?: ClaudeModel;
        maxTokens?: number;
        temperature?: number;
    } = {}
): Promise<string> {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!apiKey) {
        console.warn('[claude-client] No ANTHROPIC_API_KEY, using fallback');
        throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const {
        model = CLAUDE_MODELS.HAIKU,
        maxTokens = 1024,
        temperature = 0.3,
    } = options;

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

        if (!response.ok) {
            const error = await response.text();
            console.error('[claude-client] API error:', error);
            throw new Error(`Claude API error: ${response.status}`);
        }

        const data: ClaudeResponse = await response.json();

        console.log(`[claude-client] ${model} used ${data.usage.input_tokens}+${data.usage.output_tokens} tokens`);

        return data.content[0]?.text || '';
    } catch (error) {
        console.error('[claude-client] Error calling Claude:', error);
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
        // Try to extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]) as T;
        }
        return JSON.parse(response) as T;
    } catch (error) {
        console.error('[claude-client] Failed to parse JSON:', response);
        return null;
    }
}
