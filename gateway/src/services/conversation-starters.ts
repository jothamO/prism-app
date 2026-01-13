/**
 * Conversation Starters
 * Contextual suggestions for user questions
 */

export interface ConversationStarter {
    text: string;
    emoji: string;
    command: string;
    category: 'tax' | 'vat' | 'filing' | 'business' | 'personal';
}

const STARTERS_BY_ENTITY: Record<string, ConversationStarter[]> = {
    individual: [
        { text: 'Calculate my income tax', emoji: '💰', command: 'tax help', category: 'tax' },
        { text: 'What reliefs can I claim?', emoji: '📋', command: 'reliefs', category: 'tax' },
        { text: 'When is my tax due?', emoji: '📅', command: 'deadlines', category: 'filing' },
        { text: 'How does PAYE work?', emoji: '❓', command: 'explain paye', category: 'tax' },
    ],
    self_employed: [
        { text: 'Calculate freelancer tax', emoji: '💻', command: 'freelance tax help', category: 'tax' },
        { text: 'What expenses can I deduct?', emoji: '📝', command: 'deductible expenses', category: 'business' },
        { text: 'Calculate VAT on my services', emoji: '🧾', command: 'vat help', category: 'vat' },
        { text: 'Small company status', emoji: '🏢', command: 'small company threshold', category: 'business' },
    ],
    company: [
        { text: 'Calculate corporate tax', emoji: '🏢', command: 'corporate tax help', category: 'tax' },
        { text: 'Withholding tax rates', emoji: '🏛️', command: 'wht help', category: 'tax' },
        { text: 'Development levy breakdown', emoji: '📊', command: 'development levy help', category: 'tax' },
        { text: 'VAT filing requirements', emoji: '📄', command: 'vat filing', category: 'filing' },
    ],
    default: [
        { text: 'What can you help with?', emoji: '🤔', command: 'help', category: 'personal' },
        { text: 'Calculate my tax', emoji: '💰', command: 'tax help', category: 'tax' },
        { text: 'Explain VAT', emoji: '🧾', command: 'explain vat', category: 'vat' },
        { text: 'Tax deadlines', emoji: '📅', command: 'deadlines', category: 'filing' },
    ],
};

/**
 * Get conversation starters for a user
 */
export function getConversationStarters(
    entityType?: string,
    recentTopics?: string[]
): ConversationStarter[] {
    const baseStarters = STARTERS_BY_ENTITY[entityType || 'default'] || STARTERS_BY_ENTITY.default;

    // Filter out recently used topics if provided
    if (recentTopics && recentTopics.length > 0) {
        const filtered = baseStarters.filter(s =>
            !recentTopics.some(t => s.command.toLowerCase().includes(t.toLowerCase()))
        );
        return filtered.length >= 2 ? filtered : baseStarters;
    }

    return baseStarters;
}

/**
 * Format starters for Telegram inline keyboard
 */
export function formatStartersForTelegram(starters: ConversationStarter[]): { text: string; callback_data: string }[][] {
    // Show 4 starters in 2 rows of 2
    const buttons: { text: string; callback_data: string }[][] = [];

    for (let i = 0; i < Math.min(starters.length, 4); i += 2) {
        const row: { text: string; callback_data: string }[] = [];
        row.push({
            text: `${starters[i].emoji} ${starters[i].text}`,
            callback_data: `starter_${starters[i].command}`
        });
        if (starters[i + 1]) {
            row.push({
                text: `${starters[i + 1].emoji} ${starters[i + 1].text}`,
                callback_data: `starter_${starters[i + 1].command}`
            });
        }
        buttons.push(row);
    }

    return buttons;
}

/**
 * Format starters for chat text display
 */
export function formatStartersForChat(starters: ConversationStarter[]): string {
    let text = '💡 *Quick Actions:*\n\n';

    starters.slice(0, 4).forEach((s, i) => {
        text += `${s.emoji} ${s.text}\n`;
    });

    return text;
}
