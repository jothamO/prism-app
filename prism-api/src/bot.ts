import { TelegramBotService } from './services/telegram-bot.service';

// Initialize Telegram bot
let telegramBot: TelegramBotService | null = null;

export function startTelegramBot() {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        console.warn('⚠️  TELEGRAM_BOT_TOKEN not set. Telegram bot disabled.');
        return;
    }

    try {
        telegramBot = new TelegramBotService();
        console.log('✅ Telegram bot initialized');
    } catch (error) {
        console.error('❌ Failed to start Telegram bot:', error);
    }
}

export function getTelegramBot() {
    return telegramBot;
}
