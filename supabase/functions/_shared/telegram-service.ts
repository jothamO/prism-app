/**
 * Telegram Service - V15
 * 
 * Centralized Telegram API calls to eliminate duplicated patterns.
 * Used by: telegram-bot-gateway, mono-webhook, admin-bot-messaging
 */

// ============= Configuration =============

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');

function getTelegramUrl(method: string): string {
    if (!TELEGRAM_BOT_TOKEN) {
        throw new Error('TELEGRAM_BOT_TOKEN not configured');
    }
    return `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;
}

// ============= Types =============

export interface TelegramButton {
    text: string;
    callback_data?: string;
    url?: string;
}

export interface SendMessageOptions {
    parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    buttons?: TelegramButton[][];
    disablePreview?: boolean;
}

// ============= Core Functions =============

/**
 * Send a text message to a Telegram chat
 */
export async function sendTelegramMessage(
    chatId: number | string,
    text: string,
    options?: SendMessageOptions
): Promise<{ ok: boolean; result?: any; error?: string }> {
    const body: Record<string, unknown> = {
        chat_id: chatId,
        text: text,
        parse_mode: options?.parseMode || 'HTML',
        disable_web_page_preview: options?.disablePreview ?? true,
    };

    if (options?.buttons && options.buttons.length > 0) {
        body.reply_markup = {
            inline_keyboard: options.buttons,
        };
    }

    try {
        const response = await fetch(getTelegramUrl('sendMessage'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('[telegram-service] sendMessage failed:', data);
            return { ok: false, error: data.description };
        }

        return { ok: true, result: data.result };
    } catch (error) {
        console.error('[telegram-service] sendMessage error:', error);
        return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Send typing indicator (chat action)
 */
export async function sendTypingIndicator(chatId: number | string): Promise<void> {
    try {
        await fetch(getTelegramUrl('sendChatAction'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                action: 'typing',
            }),
        });
    } catch (error) {
        console.error('[telegram-service] sendChatAction error:', error);
    }
}

/**
 * Answer a callback query (button click acknowledgment)
 */
export async function answerCallbackQuery(
    callbackQueryId: string,
    text?: string
): Promise<void> {
    try {
        await fetch(getTelegramUrl('answerCallbackQuery'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callback_query_id: callbackQueryId,
                text: text,
            }),
        });
    } catch (error) {
        console.error('[telegram-service] answerCallbackQuery error:', error);
    }
}

/**
 * Remove inline keyboard from a message
 */
export async function removeButtons(
    chatId: number | string,
    messageId: number
): Promise<void> {
    try {
        await fetch(getTelegramUrl('editMessageReplyMarkup'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                message_id: messageId,
                reply_markup: { inline_keyboard: [] },
            }),
        });
    } catch (error) {
        console.error('[telegram-service] removeButtons error:', error);
    }
}

/**
 * Get file info for downloading
 */
export async function getFileInfo(fileId: string): Promise<{ filePath: string; fileSize: number } | null> {
    try {
        const response = await fetch(getTelegramUrl('getFile'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_id: fileId }),
        });

        const data = await response.json();

        if (!data.ok || !data.result?.file_path) {
            return null;
        }

        return {
            filePath: data.result.file_path,
            fileSize: data.result.file_size || 0,
        };
    } catch (error) {
        console.error('[telegram-service] getFile error:', error);
        return null;
    }
}

/**
 * Download a file from Telegram servers
 */
export async function downloadTelegramFile(filePath: string): Promise<ArrayBuffer | null> {
    if (!TELEGRAM_BOT_TOKEN) {
        throw new Error('TELEGRAM_BOT_TOKEN not configured');
    }

    try {
        const url = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.error('[telegram-service] downloadFile failed:', response.status);
            return null;
        }

        return await response.arrayBuffer();
    } catch (error) {
        console.error('[telegram-service] downloadFile error:', error);
        return null;
    }
}

/**
 * Convert Markdown to Telegram HTML format
 */
export function toTelegramHTML(markdown: string): string {
    return markdown
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.+?)\*/g, '<i>$1</i>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}
