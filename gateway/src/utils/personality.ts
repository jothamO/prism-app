/**
 * PRISM Personality Layer
 * Adds warmth and Nigerian context to skill responses
 */

export class PersonalityFormatter {
    /**
     * Format success messages with personality
     */
    static success(message: string, context?: { savings?: number; type?: string }): string {
        if (context?.savings && context.savings > 10000) {
            return `🎯 ${message}\n\nThat's ₦${context.savings.toLocaleString()} you just saved! Money well kept is money earned.`;
        }

        return `✅ ${message}`;
    }

    /**
     * Format learning/pattern messages
     */
    static learned(pattern: string, category: string): string {
        return `Got it! I'll remember that "${pattern}" is a ${category}. Next time I see it, I'll classify it automatically - no AI needed! 🎯`;
    }

    /**
     * Format error with empathy
     */
    static error(error: string, recoverable: boolean = true): string {
        if (recoverable) {
            return `Oops, my bad! ${error}\n\nLet me try that again...`;
        }
        return `❌ ${error}`;
    }

    /**
     * Format onboarding questions warmly
     */
    static onboardingQuestion(question: string, options: string[], context?: string): string {
        let msg = question;

        if (context) {
            msg += `\n\n💡 *${context}*`;
        }

        msg += '\n\n' + options.join('\n');
        msg += '\n\nJust type the number!';

        return msg;
    }

    /**
     * Add Nigerian context to messages
     */
    static addNigerianContext(transactionType: string): string {
        const contexts: Record<string, string> = {
            'ussd': 'That USSD charge? That\'s mobile banking - totally a business expense!',
            'opay': 'OPay transfer detected! If it\'s for business, I\'ll count it.',
            'palmpay': 'Using PalmPay for business? Smart move - low fees!',
            'generator': 'Generator fuel? NEPA strikes again. Definitely business expense!',
            'data': 'Internet/data bundles keep the business running - valid expense!',
            'capital_family': 'Family support is real! This isn\'t revenue, so no tax on it.',
            'informal_threshold': 'You\'re getting close to ₦25M - registration territory o!'
        };

        return contexts[transactionType] || '';
    }

    /**
     * Generate encouraging messages for milestones
     */
    static milestone(type: 'first_upload' | 'first_correction' | 'patterns_10' | 'saved_100k'): string {
        const messages = {
            'first_upload': '🎊 Great! Your first statement uploaded. Let me analyze this for you...',
            'first_correction': 'Thanks for that correction! I learn from every fix you make. Keep them coming!',
            'patterns_10': 'Wow! I\'ve learned 10 patterns from you already. You\'re training me well! 🚀',
            'saved_100k': '🎉 Congrats! We\'ve found over ₦100K in tax savings for you this month. That\'s the power of good bookkeeping!'
        };

        return messages[type];
    }

    /**
     * Format capital detection messages
     */
    static capitalDetected(amount: number, source: string, confidence: number): string {
        const confidentPhrases = [
            'I\'m pretty sure',
            'This looks like',
            'I think',
            'Seems like'
        ];

        const phrase = confidence > 0.90 ? 'I notice' : confidentPhrases[Math.floor(Math.random() * confidentPhrases.length)];

        let sourceText = source;
        if (source.toLowerCase().includes('mother') || source.toLowerCase().includes('father') || source.toLowerCase().includes('family')) {
            sourceText = 'family support';
        }

        return `${phrase} this ₦${(amount / 1000).toFixed(0)}K from "${source}" looks like ${sourceText}, not revenue. I've marked it as capital so you don't pay tax on it. Sound right?`;
    }

    /**
     * Format informal sector alerts with urgency but no panic
     */
    static informalAlert(revenue: number, threshold: number): string {
        const remaining = threshold - revenue;
        const percentToThreshold = (revenue / threshold) * 100;

        if (percentToThreshold >= 100) {
            return `🚨 Heads up! Your turnover (₦${(revenue / 1_000_000).toFixed(1)}M) has crossed the ₦25M threshold. CAC registration is now mandatory o.\n\nDon't worry - I can guide you through it. It's not as scary as it sounds!`;
        } else if (percentToThreshold >= 92) {
            return `⚠️ Almost there! Your turnover is ₦${(revenue / 1_000_000).toFixed(1)}M - just ₦${(remaining / 1_000_000).toFixed(1)}M away from ₦25M threshold.\n\nTime to start the CAC registration process. Want me to explain what's needed?`;
        } else if (percentToThreshold >= 80) {
            return `💡 FYI: Your turnover just hit ₦${(revenue / 1_000_000).toFixed(1)}M. You've still got ₦${(remaining / 1_000_000).toFixed(1)}M buffer before the ₦25M threshold.\n\nNo rush, but keep it in mind!`;
        }

        return '';
    }

    /**
     * Add conversational opening
     */
    static greet(userName?: string, timeOfDay?: 'morning' | 'afternoon' | 'evening'): string {
        const greetings = {
            morning: ['Good morning', 'Morning', 'Oya, let\'s start the day'],
            afternoon: ['Hey', 'Good afternoon', 'How far'],
            evening: ['Evening', 'Good evening', 'Welcome back']
        };

        const greeting = timeOfDay
            ? greetings[timeOfDay][Math.floor(Math.random() * greetings[timeOfDay].length)]
            : 'Hey';

        const name = userName ? ` ${userName}` : '';

        return `${greeting}${name}! What can I help with today?`;
    }
}
