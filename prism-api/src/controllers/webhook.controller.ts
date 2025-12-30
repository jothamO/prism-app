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
                return res.status(401).send('Unauthorized');
            }

            const event = req.body;
            console.log('Mono Webhook Event:', event.event);

            res.sendStatus(200);

            if (event.event === 'reauthorization.required') {
                console.log('Reauthorization required for account:', event.data.account._id);
            } else if (event.event === 'mono.events.account_updated') {
                const accountId = event.data.account._id;

                const { data: accountData } = await supabase
                    .from('user_accounts')
                    .select('user_id')
                    .eq('mono_account_id', accountId)
                    .single();

                if (accountData && event.data.meta && event.data.meta.data_status === 'AVAILABLE') {
                    const { monoService } = await import('../services/mono.service');
                    await monoService.syncAccount(accountData.user_id, accountId);
                }
            }
        } catch (error) {
            console.error('Mono Webhook error:', error);
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
        const lowerText = text.toLowerCase();

        if (lowerText.includes('vat') || lowerText.includes('summary')) {
            await this.sendVATSummary(userId);
        } else if (lowerText.includes('help')) {
            await this.sendHelp(userId);
        } else if (lowerText === 'paid') {
            await this.handlePaymentConfirmation(userId);
        } else {
            // AI-powered response placeholder
            await whatsappService.sendMessage(userId, "I'm not sure how to help with that yet. Try 'help' or 'vat'.");
        }
    }

    private async handleMediaMessage(userId: string, message: any, user: any) {
        await whatsappService.sendMessage(userId, 'Processing your invoice... ⏳');

        try {
            const mediaBuffer = await whatsappService.downloadMedia(message.media.id);
            const invoiceData = await ocrService.extractInvoice(mediaBuffer);

            const { vatAmount } = vatCalculatorService.calculateVAT(invoiceData.subtotal);
            const vat = invoiceData.vatAmount || vatAmount;

            await invoiceService.create({
                user_id: user.id,
                ...invoiceData,
                vat_amount: vat,
                period: new Date().toISOString().slice(0, 7),
                source: 'manual_upload'
            });

            await whatsappService.sendMessage(userId, `
✅ Invoice processed!

Invoice #: ${invoiceData.invoiceNumber}
Customer: ${invoiceData.customerName}
Amount: ₦${invoiceData.subtotal.toLocaleString()}
VAT: ₦${vat.toLocaleString()}

Current month total: ₦${await this.getMonthlyTotal(user.id)}
      `);

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

What's your name?
    `);

        // Create a temporary user or partial record
        const { data: user } = await supabase.from('users').insert({
            whatsapp_number: userId,
            onboarding_step: 1,
            business_name: 'Pending', // Placeholder
            tin: 'Pending' // Placeholder
        }).select().single();

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
