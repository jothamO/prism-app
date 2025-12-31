import TelegramBot, { Message, CallbackQuery } from 'node-telegram-bot-api';
import { MessageHandlerService } from './message-handler.service';
import { supabase } from '../config/supabase';

export class TelegramBotService {
    private bot: TelegramBot;
    private messageHandler: MessageHandlerService;

    constructor() {
        const token = process.env.TELEGRAM_BOT_TOKEN;

        if (!token) {
            throw new Error('TELEGRAM_BOT_TOKEN is not set in environment variables');
        }

        this.bot = new TelegramBot(token, { polling: true });
        this.messageHandler = new MessageHandlerService('telegram');

        this.setupHandlers();
        console.log('✅ Telegram bot started successfully');
    }

    private setupHandlers() {
        // Text messages
        this.bot.on('message', async (msg: Message) => {
            try {
                if (msg.text) {
                    await this.handleTextMessage(msg);
                }

                if (msg.photo) {
                    await this.handlePhoto(msg);
                }

                if (msg.document) {
                    await this.handleDocument(msg);
                }
            } catch (error) {
                console.error('Error handling message:', error);
                await this.sendMessage(
                    msg.chat.id,
                    '❌ Sorry, something went wrong. Please try again.'
                );
            }
        });

        // Inline keyboard callbacks
        this.bot.on('callback_query', async (query: CallbackQuery) => {
            try {
                await this.handleCallback(query);
            } catch (error) {
                console.error('Error handling callback:', error);
                await this.bot.answerCallbackQuery(query.id, {
                    text: '❌ Error processing action'
                });
            }
        });

        // Error handling
        this.bot.on('polling_error', (error) => {
            console.error('Telegram polling error:', error);
        });
    }

    private async handleTextMessage(msg: Message) {
        const userId = msg.from!.id.toString();
        const text = msg.text!;

        console.log(`[Telegram] User ${userId}: ${text}`);

        // Get or create user record
        await this.ensureUser(userId, msg.from!);

        // Handle message
        const response = await this.messageHandler.handleText(userId, text);

        // Send response
        await this.sendMessage(msg.chat.id, response.message, response.buttons);
    }

    private async handlePhoto(msg: Message) {
        const userId = msg.from!.id.toString();
        const photo = msg.photo![msg.photo!.length - 1]; // Highest resolution

        console.log(`[Telegram] User ${userId} sent photo`);

        // Get file URL
        const file = await this.bot.getFile(photo.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

        // Send processing message
        await this.sendMessage(msg.chat.id, '📄 Processing receipt...');

        // Handle photo
        const response = await this.messageHandler.handlePhoto(userId, fileUrl);

        // Send response
        await this.sendMessage(msg.chat.id, response.message, response.buttons);
    }

    private async handleDocument(msg: Message) {
        const userId = msg.from!.id.toString();
        const document = msg.document!;

        console.log(`[Telegram] User ${userId} sent document: ${document.file_name}`);

        // Get file URL
        const file = await this.bot.getFile(document.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

        // Send processing message
        await this.sendMessage(msg.chat.id, '📄 Processing document...');

        // Handle document
        const response = await this.messageHandler.handleDocument(
            userId,
            fileUrl,
            document.file_name || 'document'
        );

        // Send response
        await this.sendMessage(msg.chat.id, response.message, response.buttons);
    }

    private async handleCallback(query: CallbackQuery) {
        const userId = query.from.id.toString();
        const data = query.data!;

        console.log(`[Telegram] User ${userId} clicked: ${data}`);

        // Answer callback immediately (removes loading state)
        await this.bot.answerCallbackQuery(query.id);

        // Handle callback
        const response = await this.messageHandler.handleCallback(userId, data);

        // Send response
        if (query.message) {
            await this.sendMessage(query.message.chat.id, response.message, response.buttons);
        }
    }

    async sendMessage(chatId: number, message: string, buttons?: any[][]) {
        const options: any = {
            parse_mode: 'Markdown'
        };

        if (buttons && buttons.length > 0) {
            options.reply_markup = {
                inline_keyboard: buttons
            };
        }

        return await this.bot.sendMessage(chatId, message, options);
    }

    async sendPhoto(chatId: number, photoUrl: string, caption?: string) {
        return await this.bot.sendPhoto(chatId, photoUrl, {
            caption,
            parse_mode: 'Markdown'
        });
    }

    async sendDocument(chatId: number, fileUrl: string, options?: any) {
        return await this.bot.sendDocument(chatId, fileUrl, options);
    }

    private async ensureUser(telegramId: string, telegramUser: any) {
        // Check if user exists
        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('telegram_id', telegramId)
            .single();

        if (existing) {
            return existing;
        }

        // Create new user
        const { data: newUser } = await supabase
            .from('users')
            .insert({
                telegram_id: telegramId,
                telegram_username: telegramUser.username,
                first_name: telegramUser.first_name,
                last_name: telegramUser.last_name,
                platform: 'telegram'
            })
            .select()
            .single();

        console.log(`✅ Created new user: ${telegramId}`);

        return newUser;
    }
}
