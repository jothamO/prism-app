/**
 * AI Client Utility
 * Handles tiered model routing via OpenRouter with production-grade resilience
 * 
 * Features:
 * - Tiered routing (fast/reasoning)
 * - Exponential backoff retry
 * - Request timeout via AbortController
 * - Fast-tier fallback
 * - Token usage logging for cost monitoring
 * - Multimodal-aware Anthropic fallback
 */

import { config } from '../config';
import { logger } from './logger';

export type ModelTier = 'fast' | 'reasoning';

export interface MessageContent {
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
        url: string;
    };
}

export interface AIMessage {
    role: 'user' | 'assistant' | 'system';
    content: string | MessageContent[];
}

export interface AIRequest {
    tier: ModelTier;
    messages: AIMessage[];
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
}

interface OpenRouterResponse {
    id: string;
    choices: Array<{
        message: {
            role: string;
            content: string;
        };
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export class AIClient {
    private static instance: AIClient;
    private apiKey: string;
    private baseUrl: string;
    private timeoutMs: number;
    private maxRetries: number;

    private constructor() {
        this.apiKey = config.ai.openRouter.apiKey;
        this.baseUrl = config.ai.openRouter.baseUrl;
        this.timeoutMs = config.ai.openRouter.timeoutMs;
        this.maxRetries = config.ai.openRouter.maxRetries;
    }

    public static getInstance(): AIClient {
        if (!AIClient.instance) {
            AIClient.instance = new AIClient();
        }
        return AIClient.instance;
    }

    /**
     * Send request to OpenRouter with tier-based routing and retry logic
     */
    async chat(request: AIRequest): Promise<string> {
        const primaryModel = request.tier === 'fast'
            ? config.ai.tiers.fast
            : config.ai.tiers.reasoning;

        const fallbackModel = request.tier === 'fast'
            ? config.ai.tiers.fastFallback
            : null; // Reasoning fallback handled separately

        try {
            return await this.sendWithRetry(request, primaryModel);
        } catch (primaryError) {
            logger.warn('[AIClient] Primary model failed', {
                model: primaryModel,
                error: (primaryError as Error).message
            });

            // Try fast-tier fallback if available
            if (fallbackModel) {
                try {
                    logger.info('[AIClient] Attempting fast-tier fallback', { model: fallbackModel });
                    return await this.sendWithRetry(request, fallbackModel);
                } catch (fallbackError) {
                    logger.error('[AIClient] Fast-tier fallback also failed', {
                        model: fallbackModel,
                        error: (fallbackError as Error).message
                    });
                }
            }

            // Final fallback to direct Anthropic for reasoning tier
            if (request.tier === 'reasoning' && config.anthropic.apiKey) {
                logger.warn('[AIClient] Attempting direct Anthropic fallback...');
                return this.fallbackToAnthropic(request);
            }

            throw primaryError;
        }
    }

    /**
     * Send request with exponential backoff retry
     */
    private async sendWithRetry(request: AIRequest, model: string): Promise<string> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                return await this.sendRequest(request, model);
            } catch (error) {
                lastError = error as Error;
                const isRetryable = this.isRetryableError(error);

                if (!isRetryable || attempt === this.maxRetries - 1) {
                    throw error;
                }

                // Exponential backoff: 1s, 2s, 4s
                const delay = Math.pow(2, attempt) * 1000;
                logger.warn('[AIClient] Retrying after error', {
                    attempt: attempt + 1,
                    delayMs: delay,
                    error: lastError.message
                });
                await this.sleep(delay);
            }
        }

        throw lastError;
    }

    /**
     * Send individual request with timeout
     */
    private async sendRequest(request: AIRequest, model: string): Promise<string> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            logger.info('[AIClient] Routing request', {
                tier: request.tier,
                model,
                msgCount: request.messages.length
            });

            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': config.ai.openRouter.siteUrl,
                    'X-Title': config.ai.openRouter.siteName,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages: request.messages,
                    temperature: request.temperature ?? 0.7,
                    max_tokens: request.maxTokens ?? 4000
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`OpenRouter ${response.status}: ${errorBody}`);
            }

            const data = await response.json() as OpenRouterResponse;
            const content = data.choices[0]?.message?.content;

            // Log token usage for cost monitoring
            if (data.usage) {
                logger.info('[AIClient] Token usage', {
                    model,
                    promptTokens: data.usage.prompt_tokens,
                    completionTokens: data.usage.completion_tokens,
                    totalTokens: data.usage.total_tokens
                });
            }

            if (!content) {
                throw new Error('Empty response from OpenRouter');
            }

            return content;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Check if error is retryable (rate limit, server errors)
     */
    private isRetryableError(error: unknown): boolean {
        if (error instanceof Error) {
            const msg = error.message;
            // Retry on rate limits (429) and server errors (5xx)
            return msg.includes('429') ||
                msg.includes('500') ||
                msg.includes('502') ||
                msg.includes('503') ||
                msg.includes('504') ||
                msg.includes('ECONNRESET') ||
                msg.includes('ETIMEDOUT');
        }
        return false;
    }

    /**
     * Emergency fallback to direct Anthropic API with multimodal support
     */
    private async fallbackToAnthropic(request: AIRequest): Promise<string> {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

        const systemMessage = request.messages.find(m => m.role === 'system')?.content;
        const userMessages = request.messages
            .filter(m => m.role !== 'system')
            .map(m => {
                // Handle multimodal content
                if (Array.isArray(m.content)) {
                    const anthropicContent = m.content.map(c => {
                        if (c.type === 'text') {
                            return { type: 'text' as const, text: c.text || '' };
                        } else if (c.type === 'image_url' && c.image_url?.url) {
                            // Parse base64 data URL
                            const match = c.image_url.url.match(/^data:(.+);base64,(.+)$/);
                            if (match) {
                                return {
                                    type: 'image' as const,
                                    source: {
                                        type: 'base64' as const,
                                        media_type: match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                                        data: match[2]
                                    }
                                };
                            }
                        }
                        return { type: 'text' as const, text: '' };
                    });
                    return { role: m.role as 'user' | 'assistant', content: anthropicContent };
                }
                return { role: m.role as 'user' | 'assistant', content: m.content as string };
            });

        const response = await anthropic.messages.create({
            model: config.anthropic.model,
            max_tokens: request.maxTokens || 8000,
            system: typeof systemMessage === 'string' ? systemMessage : undefined,
            messages: userMessages
        });

        const content = response.content[0];
        if (content.type !== 'text') throw new Error('Non-text response from fallback');

        return content.text;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export const aiClient = AIClient.getInstance();
