/**
 * AI Personality Helper
 * Uses Claude Haiku for fast, conversational personality polish
 * Makes Telegram Gateway messages match Web Chat's warmth
 */

import config from '../config';
import { logger } from './logger';

// Model settings - consistent with claude-client.ts
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 8000;

interface PersonalityContext {
    userName?: string;
    timeOfDay?: 'morning' | 'afternoon' | 'evening';
    messageType: 'welcome' | 'onboarding' | 'skill_response' | 'error' | 'general';
    entityType?: 'business' | 'individual' | 'self_employed' | 'student' | 'retiree' | 'corper';
}

/**
 * Get time of day for Nigeria (GMT+1)
 */
export function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
}

/**
 * Add AI-powered personality to a message using Claude Haiku
 * Fast and cheap (~200ms) for quick personality polish
 */
export async function addAIPersonality(
    message: string,
    context: PersonalityContext
): Promise<string> {
    // Skip if no API key - return original message
    if (!config.anthropic.apiKey) {
        logger.debug('[AIPersonality] No API key, returning original message');
        return message;
    }

    // Skip if personality mode is disabled
    if (config.personalityMode === 'template') {
        logger.debug('[AIPersonality] Template mode, returning original message');
        return message;
    }

    try {
        const systemPrompt = buildPersonalitySystemPrompt(context);

        logger.info('[AIPersonality] Polishing message with Claude Haiku', {
            messageType: context.messageType,
            userName: context.userName || 'anonymous',
            originalLength: message.length
        });

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.anthropic.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: HAIKU_MODEL,
                max_tokens: MAX_TOKENS,
                temperature: 0.7, // More creative for personality
                system: systemPrompt,
                messages: [{ role: 'user', content: message }]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error('[AIPersonality] Claude error', { status: response.status, error: errorText });
            return message; // Return original on error
        }

        const data = await response.json() as { content?: Array<{ text?: string }> };
        const polishedMessage = data.content?.[0]?.text;

        if (!polishedMessage) {
            logger.warn('[AIPersonality] Empty response, returning original');
            return message;
        }

        logger.info('[AIPersonality] Message polished', {
            originalLength: message.length,
            polishedLength: polishedMessage.length
        });

        return polishedMessage;
    } catch (error) {
        logger.error('[AIPersonality] Error polishing message:', error);
        return message; // Return original on error
    }
}

/**
 * Generate a personalized welcome message using AI
 */
export async function generateWelcomeMessage(context: PersonalityContext): Promise<string> {
    if (!config.anthropic.apiKey || config.personalityMode === 'template') {
        return getStaticWelcome(context);
    }

    try {
        const systemPrompt = buildPersonalitySystemPrompt({
            ...context,
            messageType: 'welcome'
        });

        const userPrompt = context.userName
            ? `Generate a warm, personalized welcome-back greeting for ${context.userName} in the ${context.timeOfDay || getTimeOfDay()}. They're a returning user of PRISM tax assistant. Keep it to 2-3 sentences. Include one Nigerian expression naturally.`
            : `Generate a warm welcome-back greeting for a returning user in the ${context.timeOfDay || getTimeOfDay()}. Keep it to 2-3 sentences. Include one Nigerian expression naturally.`;

        logger.info('[AIPersonality] Generating AI welcome message', {
            userName: context.userName || 'anonymous',
            timeOfDay: context.timeOfDay
        });

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.anthropic.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: HAIKU_MODEL,
                max_tokens: MAX_TOKENS,
                temperature: 0.8, // More creative for greetings
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }]
            })
        });

        if (!response.ok) {
            throw new Error(`Claude error: ${response.status}`);
        }

        const data = await response.json() as { content?: Array<{ text?: string }> };
        const greeting = data.content?.[0]?.text;

        if (!greeting) {
            throw new Error('Empty response');
        }

        logger.info('[AIPersonality] AI welcome generated', { length: greeting.length });
        return greeting;
    } catch (error) {
        logger.error('[AIPersonality] Error generating welcome:', error);
        return getStaticWelcome(context);
    }
}

/**
 * Generate personalized onboarding welcome using AI
 */
export async function generateOnboardingWelcome(context: PersonalityContext): Promise<string> {
    if (!config.anthropic.apiKey || config.personalityMode === 'template') {
        return getStaticOnboardingWelcome(context);
    }

    try {
        const systemPrompt = buildPersonalitySystemPrompt({
            ...context,
            messageType: 'onboarding'
        });

        const timeOfDay = context.timeOfDay || getTimeOfDay();
        const userPrompt = context.userName
            ? `Generate a warm welcome for ${context.userName} who is starting onboarding with PRISM tax assistant in the ${timeOfDay}. Welcome them, briefly explain you'll help with Nigerian taxes, and express excitement to learn about them. Keep it to 2-3 sentences. Include one Nigerian expression naturally.`
            : `Generate a warm welcome for a new user starting onboarding with PRISM tax assistant in the ${timeOfDay}. Welcome them, briefly explain you'll help with Nigerian taxes, and express excitement to learn about them. Keep it to 2-3 sentences. Include one Nigerian expression naturally.`;

        logger.info('[AIPersonality] Generating AI onboarding welcome', {
            userName: context.userName || 'anonymous',
            timeOfDay
        });

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.anthropic.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: HAIKU_MODEL,
                max_tokens: MAX_TOKENS,
                temperature: 0.8,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }]
            })
        });

        if (!response.ok) {
            throw new Error(`Claude error: ${response.status}`);
        }

        const data = await response.json() as { content?: Array<{ text?: string }> };
        const welcome = data.content?.[0]?.text;

        if (!welcome) {
            throw new Error('Empty response');
        }

        logger.info('[AIPersonality] AI onboarding welcome generated', { length: welcome.length });
        return welcome;
    } catch (error) {
        logger.error('[AIPersonality] Error generating onboarding welcome:', error);
        return getStaticOnboardingWelcome(context);
    }
}

/**
 * Build system prompt for personality AI
 */
function buildPersonalitySystemPrompt(context: PersonalityContext): string {
    const timeContext = context.timeOfDay || getTimeOfDay();

    return `You are PRISM, a friendly Nigerian tax assistant chatbot.

PERSONALITY:
- Warm and conversational like a knowledgeable friend who happens to be great at tax
- Use Nigerian context naturally (Naira, FIRS, local examples like generator fuel, danfo fare)
- Celebrate wins, empathize with challenges ("I know NEPA wahala makes fuel expenses high!")
- Be clear and direct, avoid jargon
- Naturally use Nigerian expressions (but don't overdo it):
  * "o" for gentle emphasis ("make sure you file on time o")
  * "sha" for "anyway/though" ("I'll help you sha")
  * "oya" for "let's go/come on"
  * "wahala" for trouble/problem
  * "na so" for "that's right"
  * "E don tey!" for "It's been a while!"
  * "How body?" for "How are you?"
- Keep responses natural - not every message needs pidgin

CONTEXT:
- Time of day: ${timeContext}
${context.userName ? `- User's name: ${context.userName} (use first name naturally)` : '- Anonymous user'}
${context.entityType ? `- User type: ${context.entityType}` : ''}
- Message type: ${context.messageType}

FORMATTING:
- Use markdown for structure when helpful
- Keep messages concise and punchy
- Use emojis sparingly but effectively
- For welcomes/greetings: 2-3 sentences max
- Sound like a real person, not a corporate bot

IMPORTANT:
- Generate natural, conversational Nigerian-style messages
- Match the warmth and personality of a friendly tax advisor
- Never sound robotic or generic`;
}

/**
 * Static welcome fallback (matches current behavior)
 */
function getStaticWelcome(context: PersonalityContext): string {
    const timeOfDay = context.timeOfDay || getTimeOfDay();
    const greetings: Record<string, string[]> = {
        morning: ['Good morning', 'Morning'],
        afternoon: ['Good afternoon', 'Afternoon'],
        evening: ['Good evening', 'Evening']
    };

    const greeting = greetings[timeOfDay][Math.floor(Math.random() * 2)];
    const name = context.userName ? ` ${context.userName.split(' ')[0]}` : '';

    const messages = [
        `${greeting}${name}! 👋 Ready to crush some tax admin? 💪`,
        `${greeting}${name}! Oya, what can I help you sort out today?`,
        `${greeting}${name}! Back for more tax magic? Let's go! 🚀`,
        `${greeting}${name}! Welcome back! Your books are calling. 📊`,
        `${greeting}${name}! E don tey! What are we tackling today?`,
    ];

    return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Static onboarding welcome fallback
 */
function getStaticOnboardingWelcome(context: PersonalityContext): string {
    const timeOfDay = context.timeOfDay || getTimeOfDay();
    const greetings: Record<string, string> = {
        morning: 'Good morning',
        afternoon: 'Good afternoon',
        evening: 'Good evening'
    };

    const greeting = greetings[timeOfDay];
    const name = context.userName ? ` ${context.userName.split(' ')[0]}` : '';

    return `${greeting}${name}! 👋\n\nWelcome to PRISM! 🇳🇬 I'm your personal tax assistant, built for Nigerians. Let's get you set up - it only takes a minute!`;
}
