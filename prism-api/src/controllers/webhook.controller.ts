import { Request, Response } from 'express';
import { whatsappService } from '../services/whatsapp.service';
import { ocrService } from '../services/ocr.service';
import { supabase } from '../config/database';
import { invoiceService } from '../services/invoice.service';
import { vatCalculatorService } from '../services/vat-calculator.service';
import { conversationService } from '../services/conversation.service';

export class WebhookController {
    async handleWhatsApp(req: Request, res: Response) {
        try {
            const message = req.body;
            res.sendStatus(200);

            await this.processMessage(message);
        } catch (error) {
            console.error('Webhook error:', error);
            res.sendStatus(500);
        }
    }

    async handleMonoWebhook(req: Request, res: Response) {
        try {
            const secret = req.headers['x-mono-webhook-secret'];
            if (secret !== process.env.MONO_WEBHOOK_SECRET) {
                // In production, you might want to return 401, but sometimes 200 to avoid retries if confident it's junk.
                // For security, 401 is better.
                return res.status(401).send('Unauthorized');
            }

            const event = req.body;
            console.log('Mono Webhook Event:', event.event);

            // Respond immediately to acknowledge receipt
            res.sendStatus(200);

            if (event.event === 'reauthorization.required') {
                // Handle re-auth notifications (notify user)
                console.log('Reauthorization required for account:', event.data.account._id);
                // logic to finding user and notifying them can go here
            } else if (event.event === 'mono.events.account_updated') {
                // This event might contain new transactions
                const accountId = event.data.account._id;

                // Lookup user by accountId
                const { data: accountData } = await supabase
                    .from('user_accounts')
                    .select('user_id')
                    .eq('mono_account_id', accountId)
                    .single();

                if (accountData && event.data.meta && event.data.meta.data_status === 'AVAILABLE') {
                    // Ideally we fetch recent transactions or use the ones in payload if available.
                    // Mono usually says "data_status: AVAILABLE" meaning we can fetch.
                    // Or sometimes they send the transaction in the payload.
                    // For this implementation, we'll trigger a sync.

                    // Importing monoService here to avoid circular dependency issues if any, 
                    // but standard import at top is fine.
                    const { monoService } = await import('../services/mono.service');
                    await monoService.syncAccount(accountData.user_id, accountId);
                }
            }
        } catch (error) {
            console.error('Mono Webhook error:', error);
            // Don't crash the server
            if (!res.headersSent) res.sendStatus(500);
        }
    }

    private async processMessage(message: any) {
        const userId = message.from;
        const messageType = message.type;

        await supabase.from('messages').insert({
            user_id: userId, // Note: This assumes user_id is the phone number or we have a mapping. 
            // In reality we'd look up the user UUID by phone number.
            // For this snippet I'll assume we handle user lookup.
            direction: 'inbound',
            message_type: messageType,
            content: message.text?.body,
            whatsapp_message_id: message.id
        });

        // Lookup user by phone number
        let { data: user } = await supabase.from('users').select('*').eq('whatsapp_number', userId).single();

        if (!user) {
            user = await this.startOnboarding(userId);
            return;
        }

        switch (messageType) {
            case 'text':
                await this.handleTextMessage(userId, message.text.body, user);
                break;

            case 'image':
            case 'document':
                await this.handleMediaMessage(userId, message, user);
                break;

            case 'interactive':
                await this.handleInteractiveResponse(userId, message, user);
                break;
        }
    }

    private async handleTextMessage(userId: string, text: string, user: any) {
        // Check for active conversation state
        const state = await conversationService.getState(userId);

        if (state) {
            await this.handleStatefulMessage(userId, text, user, state);
            return;
        }

        const lowerText = text.toLowerCase();

        if (lowerText.includes('vat') || lowerText.includes('summary')) {
            await this.sendVATSummary(userId);
        } else if (lowerText.includes('help')) {
            await this.sendHelp(userId);
        } else if (lowerText === 'paid') {
            await this.handlePaymentConfirmation(userId);
        } else if (lowerText.startsWith('switch')) {
            const businessNamePart = lowerText.replace('switch', '').trim();
            await this.handleBusinessSwitch(userId, businessNamePart, user);
        } else if (lowerText === 'businesses') {
            await this.listBusinesses(userId, user);
        } else {
            // General AI assistant or semantic router could go here
            await whatsappService.sendMessage(userId, "I'm not sure how to help with that yet. Try 'help', 'vat', or 'switch [business]'.");
        }
    }

    private async handleBusinessSwitch(userId: string, namePart: string, user: any) {
        if (!namePart) {
            await whatsappService.sendMessage(userId, "Please specify a business name. e.g. 'switch My Shop'");
            return;
        }

        const { data: businesses } = await supabase
            .from('businesses')
            .select('*')
            .eq('user_id', user.id)
            .ilike('name', `%${namePart}%`);

        if (!businesses || businesses.length === 0) {
            await whatsappService.sendMessage(userId, `No business found matching "${namePart}". Try 'businesses' to see your list.`);
        } else if (businesses.length > 1) {
            await whatsappService.sendMessage(userId, `Multiple businesses found. Please be more specific:\n${businesses.map(b => `• ${b.name}`).join('\n')}`);
        } else {
            const business = businesses[0];
            await conversationService.updateState(userId, {
                businessId: business.id,
                currentBusinessName: business.name
            });
            await whatsappService.sendMessage(userId, `✅ Switched to **${business.name}**.`);
        }
    }

    private async listBusinesses(userId: string, user: any) {
        const { data: businesses } = await supabase
            .from('businesses')
            .select('*')
            .eq('user_id', user.id);

        if (!businesses || businesses.length === 0) {
            await whatsappService.sendMessage(userId, "You don't have any businesses set up yet.");
        } else {
            await whatsappService.sendMessage(userId, `🏢 **Your Businesses**:\n\n${businesses.map(b => `• ${b.name}`).join('\n')}\n\nReply 'switch [name]' to change active business.`);
        }
    }

    private async handleStatefulMessage(userId: string, text: string, user: any, state: any) {
        // Example: Onboarding Flow
        if (state.flow === 'onboarding') {
            if (state.step === 'ask_name') {
                // Save name and move to next step
                await supabase.from('users').update({ business_name: text }).eq('id', user.id);
                await conversationService.updateState(userId, { step: 'ask_tin' });
                await whatsappService.sendMessage(userId, `Nice to meet you, ${text}! What is your Tax Identification Number (TIN)?`);
            } else if (state.step === 'ask_tin') {
                // Save TIN and finish
                await supabase.from('users').update({ tin: text }).eq('id', user.id);
                await conversationService.clearState(userId);
                await whatsappService.sendMessage(userId, `Perfect! Your profile is set up. You can now send me invoices.`);
            }
        }
    }

    private async handleMediaMessage(userId: string, message: any, user: any) {
        await whatsappService.sendMessage(userId, 'Processing your invoice... ⏳');

        try {
            const mediaBuffer = await whatsappService.downloadMedia(message.media.id);
            const invoiceData = await ocrService.extractInvoice(mediaBuffer);

            const { vatAmount } = vatCalculatorService.calculateVAT(invoiceData.subtotal);
            const vat = invoiceData.vatAmount || vatAmount;

            const state = await conversationService.getState(userId);
            const businessId = state?.businessId; // Use active business if set

            // If no active business, try to find primary or default
            let finalBusinessId = businessId;
            if (!finalBusinessId) {
                const { data: businesses } = await supabase.from('businesses').select('id').eq('user_id', user.id).eq('is_primary', true).limit(1);
                if (businesses && businesses.length > 0) finalBusinessId = businesses[0].id;
            }

            const needsReview = (invoiceData.ocrConfidence || 1) < 0.8;

            await invoiceService.create({
                user_id: user.id,
                business_id: finalBusinessId,
                ...invoiceData,
                vat_amount: vat,
                period: new Date().toISOString().slice(0, 7),
                source: 'manual_upload',
                confidence_score: invoiceData.ocrConfidence,
                needs_review: needsReview,
                review_reasons: needsReview ? ['Low OCR confidence'] : []
            });

            const confirmationMessage = needsReview
                ? `⚠️ Invoice processed (low scan quality - please verify)!\n\nInvoice #: ${invoiceData.invoiceNumber}\nCustomer: ${invoiceData.customerName}\nAmount: ₦${invoiceData.subtotal.toLocaleString()}\nVAT: ₦${vat.toLocaleString()}\n\nPlease double-check the details are correct.`
                : `✅ Invoice processed!\n\nInvoice #: ${invoiceData.invoiceNumber}\nCustomer: ${invoiceData.customerName}\nAmount: ₦${invoiceData.subtotal.toLocaleString()}\nVAT: ₦${vat.toLocaleString()}\n\nCurrent month total: ₦${await this.getMonthlyTotal(user.id)}`;

            await whatsappService.sendMessage(userId, confirmationMessage);

        } catch (error) {
            await whatsappService.sendMessage(userId, `
❌ Failed to process invoice.

Please try:
• Taking a clearer photo
• Sending as PDF
• Or reply "HELP" for support
      `);
        }
    }

    private async startOnboarding(userId: string) {
        await whatsappService.sendMessage(userId, `
👋 Welcome to PRISM!

I'm your AI tax assistant. I automate VAT filing so you never miss a deadline.

Let's get started!

What's your Business Name?
    `);

        // Create user record
        const { data: user } = await supabase.from('users').insert({
            whatsapp_number: userId,
            onboarding_step: 1,
            business_name: 'Pending',
            tin: 'Pending'
        }).select().single();

        // Set conversation state
        await conversationService.setState(userId, {
            flow: 'onboarding',
            step: 'ask_name',
            data: {}
        });

        return user;
    }

    private async handleInteractiveResponse(userId: string, message: any, user: any) {
        // Handle button clicks
        console.log('Interactive response:', message);
    }

    private async sendVATSummary(userId: string) {
        // Implementation
        await whatsappService.sendMessage(userId, "Here is your VAT summary...");
    }

    private async sendHelp(userId: string) {
        await whatsappService.sendMessage(userId, "Here are some commands you can use...");
    }

    private async handlePaymentConfirmation(userId: string) {
        await whatsappService.sendMessage(userId, "Checking payment status...");
    }

    private async getMonthlyTotal(userId: string) {
        // Implementation
        return 0;
    }
}

export const webhookController = new WebhookController();
