import { supabase } from '../config/supabase';
import { nluService, Intent } from './nlu.service';
import { whatsappService } from './whatsapp.service';
import { whatsappInteractiveService } from './whatsapp-interactive.service';
import { TaxIDResolverService } from './tax-id-resolver.service';
import { MonoService } from './mono.service';

type Platform = 'telegram' | 'whatsapp';

interface MessageResponse {
    message: string;
    buttons?: any[];
    useInteractiveButtons?: boolean; // For WhatsApp buttons
}

export class IntentRouterService {
    private taxIDResolver: TaxIDResolverService;
    private monoService: MonoService;

    constructor() {
        this.taxIDResolver = new TaxIDResolverService();
        this.monoService = new MonoService();
    }

    /**
     * Route message to appropriate handler based on intent
     */
    async routeMessage(
        userId: string,
        message: string,
        platform: Platform
    ): Promise<MessageResponse> {
        // Get conversation state
        const state = await this.getConversationState(userId, platform);

        // If in structured flow (onboarding), handle via state
        if (state?.expecting) {
            return await this.handleStructuredFlow(userId, message, state, platform);
        }

        // Otherwise, use NLU to understand intent
        const intent = await nluService.classifyIntent(message, {
            userId,
            conversationState: state?.expecting
        });

        console.log(`[Intent Router] Detected: ${intent.name} (confidence: ${intent.confidence})`);

        // Route to appropriate handler
        return await this.handleIntent(userId, intent, message, platform);
    }

    /**
     * Handle structured onboarding flow (state-based)
     */
    private async handleStructuredFlow(
        userId: string,
        message: string,
        state: any,
        platform: Platform
    ): Promise<MessageResponse> {
        // Delegate to existing message-handler logic
        // This preserves the onboarding flow
        switch (state.expecting) {
            case 'nin':
                return await this.handleNINInput(userId, message, platform);
            case 'cac':
                return await this.handleCACInput(userId, message, platform);
            case 'business_name':
                return await this.handleBusinessNameInput(userId, message, platform);
            default:
                // Fallback to NLU
                const intent = await nluService.classifyIntent(message);
                return await this.handleIntent(userId, intent, message, platform);
        }
    }

    /**
     * Route intent to handler
     */
    private async handleIntent(
        userId: string,
        intent: Intent,
        originalMessage: string,
        platform: Platform
    ): Promise<MessageResponse> {
        switch (intent.name) {
            case 'get_transaction_summary':
                return await this.handleTransactionQuery(userId, intent, platform);

            case 'get_tax_relief_info':
                return await this.handleTaxReliefQuery(userId, intent, platform);

            case 'upload_receipt':
                return await this.handleReceiptUploadPrompt(userId, platform);

            case 'categorize_expense':
                return await this.handleExpenseCategorizationQuery(userId, intent, platform);

            case 'get_tax_calculation':
                return await this.handleTaxCalculationQuery(userId, intent, platform);

            case 'set_reminder':
                return await this.handleReminderRequest(userId, intent, platform);

            case 'connect_bank':
                return await this.handleBankConnectionRequest(userId, platform);

            case 'artificial_transaction_warning':
                return await this.handleArtificialTransactionWarning(userId, intent);

            case 'general_query':
            default:
                return await this.handleGeneralQuery(userId, originalMessage, platform);
        }
    }

    /**
     * Handle transaction query with NLU-extracted entities
     */
    private async handleTransactionQuery(
        userId: string,
        intent: Intent,
        platform: Platform
    ): Promise<MessageResponse> {
        const { timeframe, category, project } = intent.entities;

        // TODO: Query transactions from database
        // For now, return mock message with interactive buttons

        if (platform === 'whatsapp') {
            // Use WhatsApp List Message for follow-up actions
            return {
                message: '', // Will be sent separately
                useInteractiveButtons: true,
                buttons: [
                    {
                        type: 'list',
                        options: {
                            header: 'Transaction Options',
                            body: `📊 Found transactions${timeframe ? ` for ${timeframe}` : ''}${project ? ` in ${project}` : ''}\n\nWhat would you like to do?`,
                            buttonText: 'Select Action',
                            sections: [
                                {
                                    title: 'Actions',
                                    rows: [
                                        { id: 'view_receipts', title: 'View Receipts', description: 'See scanned documents' },
                                        { id: 'export_report', title: 'Export Report', description: 'Download CSV/PDF' },
                                        { id: 'tax_impact', title: 'Tax Impact', description: 'See tax savings' }
                                    ]
                                }
                            ]
                        }
                    }
                ]
            };
        }

        return {
            message: `📊 *Transaction Summary*\n\nLet me fetch your transactions${timeframe ? ` for ${timeframe}` : ''}${project ? ` in ${project}` : ''}...\n\n_Feature coming soon!_`
        };
    }

    /**
     * Handle tax relief query with interactive buttons
     */
    private async handleTaxReliefQuery(
        userId: string,
        intent: Intent,
        platform: Platform
    ): Promise<MessageResponse> {
        if (platform === 'whatsapp') {
            return {
                message: '',
                useInteractiveButtons: true,
                buttons: [
                    {
                        type: 'list',
                        options: {
                            header: 'Tax Reliefs (NTA 2025)',
                            body: "I've calculated your available tax reliefs. Which would you like to explore?",
                            footer: 'Section 21 - Tax Act 2025',
                            buttonText: 'View Reliefs',
                            sections: [
                                {
                                    title: 'Personal Reliefs',
                                    rows: [
                                        { id: 'relief_rent', title: 'Rent Relief (20%)', description: 'Max ₦500K/year' },
                                        { id: 'relief_mortgage', title: 'Mortgage Interest', description: 'Full deduction' },
                                        { id: 'relief_pension', title: 'Pension (8%)', description: 'Mandatory contribution' }
                                    ]
                                },
                                {
                                    title: 'Business Reliefs',
                                    rows: [
                                        { id: 'relief_small_biz', title: 'Small Business 0%', description: 'Revenue < ₦50M' },
                                        { id: 'relief_startup', title: 'Startup Exemption', description: '3-4 years tax-free' }
                                    ]
                                }
                            ]
                        }
                    }
                ]
            };
        }

        return {
            message: `💰 *Tax Reliefs Available*\n\n` +
                `Under Tax Act 2025, you may qualify for:\n\n` +
                `1. Rent Relief (20%, max ₦500K)\n` +
                `2. Mortgage Interest (full deduction)\n` +
                `3. Pension Contributions (8%)\n` +
                `4. Small Business 0% CIT (< ₦50M revenue)\n` +
                `5. Startup Exemption (3-4 years)\n\n` +
                `Which would you like to know more about?`
        };
    }

    /**
     * Handle bank connection request
     */
    private async handleBankConnectionRequest(
        userId: string,
        platform: Platform
    ): Promise<MessageResponse> {
        const connectUrl = await this.monoService.generateConnectUrl(userId);

        const message = `🏦 *Connect Your Bank*\n\n` +
            `Click the link below to securely connect:\n\n` +
            `${connectUrl}\n\n` +
            `✅ Encrypted end-to-end\n` +
            `✅ Never shared\n` +
            `✅ Deletable anytime`;

        if (platform === 'whatsapp') {
            return {
                message,
                useInteractiveButtons: true,
                buttons: [
                    {
                        type: 'reply',
                        options: [
                            { id: 'link_clicked', title: 'Done!' },
                            { id: 'help_connect', title: 'Need Help' },
                            { id: 'skip_bank', title: 'Skip for Now' }
                        ]
                    }
                ]
            };
        }

        return { message };
    }

    /**
     * Artificial transaction warning (Section 191 compliance)
     */
    private async handleArtificialTransactionWarning(
        userId: string,
        intent: Intent
    ): Promise<MessageResponse> {
        const { item, claimed_category } = intent.entities;

        return {
            message: `⚠️ *Tax Compliance Warning*\n\n` +
                `Section 191 (Artificial Transactions):\n\n` +
                `Claiming "${item}" as "${claimed_category}" may be viewed as an artificial transaction by FIRS.\n\n` +
                `This could result in penalties. Are you sure?`,
            useInteractiveButtons: true,
            buttons: [
                {
                    type: 'reply',
                    options: [
                        { id: 'proceed_anyway', title: 'Yes, Proceed' },
                        { id: 'recategorize', title: 'Recategorize' },
                        { id: 'cancel', title: 'Cancel' }
                    ]
                }
            ]
        };
    }

    /**
     * Placeholder handlers (to be implemented)
     */
    private async handleReceiptUploadPrompt(userId: string, platform: Platform): Promise<MessageResponse> {
        return {
            message: `📸 *Upload Receipt*\n\nSend me a photo of your receipt and I'll extract the details automatically!`
        };
    }

    private async handleExpenseCategorizationQuery(userId: string, intent: Intent, platform: Platform): Promise<MessageResponse> {
        return {
            message: `🏷️ *Categorize Expense*\n\nI can help you categorize this expense. Which project or category should I tag it to?`
        };
    }

    private async handleTaxCalculationQuery(userId: string, intent: Intent, platform: Platform): Promise<MessageResponse> {
        return {
            message: `🧮 *Tax Calculation*\n\nI'll calculate your tax. Feature coming soon!`
        };
    }

    private async handleReminderRequest(userId: string, intent: Intent, platform: Platform): Promise<MessageResponse> {
        return {
            message: `⏰ *Tax Filing Reminder*\n\nI'll remind you about tax deadlines. Feature coming soon!`
        };
    }

    private async handleGeneralQuery(userId: string, message: string, platform: Platform): Promise<MessageResponse> {
        return {
            message: `I'm not sure how to help with that yet.\n\nType "help" to see what I can do!`
        };
    }

    /**
     * Existing handlers (from message-handler.service.ts)
     */
    private async handleNINInput(userId: string, nin: string, platform: Platform): Promise<MessageResponse> {
        // Validate format
        if (!/^\d{11}$/.test(nin.trim())) {
            return {
                message: `❌ Invalid NIN format.\n\nNIN must be exactly 11 digits.\n\nPlease try again:`
            };
        }

        try {
            // Verify via Mono
            const resolution = await this.taxIDResolver.resolveTaxID(nin.trim(), 'nin');

            // Update user
            await this.updateUser(userId, platform, {
                nin: nin.trim(),
                full_name: resolution.name,
                entity_type: 'individual',
                verification_status: 'verified'
            });

            await this.setConversationState(userId, platform, null); // Clear state

            if (platform === 'whatsapp') {
                return {
                    message: `✅ *Identity Confirmed!*\n\n• Name: ${resolution.name}\n• Tax ID: ${nin}\n• Type: Individual`,
                    useInteractiveButtons: true,
                    buttons: [
                        {
                            type: 'reply',
                            options: [
                                { id: 'connect_bank', title: '🏦 Connect Bank' },
                                { id: 'skip_bank', title: 'Skip for Now' }
                            ]
                        }
                    ]
                };
            }

            return {
                message: `✅ *Identity Confirmed!*\n\n• Name: ${resolution.name}\n• Tax ID: ${nin}\n• Type: Individual\n\nNext: Connect your bank`
            };
        } catch (error) {
            return {
                message: `❌ Could not verify NIN.\n\nPlease check and try again:`
            };
        }
    }

    private async handleCACInput(userId: string, cac: string, platform: Platform): Promise<MessageResponse> {
        if (!/^(RC|BN)\d{6,7}$/i.test(cac.trim())) {
            return {
                message: `❌ Invalid CAC format.\n\nFormat: RC1234567 or BN1234567\n\nPlease try again:`
            };
        }

        try {
            const resolution = await this.taxIDResolver.resolveTaxID(cac.trim().toUpperCase(), 'cac');

            await this.updateUser(userId, platform, {
                cac_number: cac.trim().toUpperCase(),
                company_name: resolution.name,
                entity_type: 'company',
                verification_status: 'verified'
            });

            await this.setConversationState(userId, platform, null);

            return {
                message: `✅ *Business Verified!*\n\n• Company: ${resolution.name}\n• CAC: ${cac.toUpperCase()}\n• Type: Company`
            };
        } catch (error) {
            return {
                message: `❌ Could not verify CAC number.\n\nPlease check and try again:`
            };
        }
    }

    private async handleBusinessNameInput(userId: string, name: string, platform: Platform): Promise<MessageResponse> {
        await this.updateUser(userId, platform, { business_name: name });
        await this.setConversationState(userId, platform, 'cac');

        return {
            message: `Thanks! What's your *CAC registration number*?\n\nFormat: RC1234567 or BN1234567\n\nReply "skip" if you don't have it handy.`
        };
    }

    /**
     * Helper methods
     */
    private async getConversationState(userId: string, platform: Platform) {
        const { data } = await supabase
            .from('conversation_state')
            .select('*')
            .eq(platform === 'telegram' ? 'telegram_id' : 'whatsapp_id', userId)
            .single();
        return data;
    }

    private async setConversationState(userId: string, platform: Platform, expecting: string | null) {
        await supabase
            .from('conversation_state')
            .upsert({
                [platform === 'telegram' ? 'telegram_id' : 'whatsapp_id']: userId,
                expecting,
                updated_at: new Date().toISOString()
            });
    }

    private async updateUser(userId: string, platform: Platform, updates: any) {
        await supabase
            .from('users')
            .update(updates)
            .eq(platform === 'telegram' ? 'telegram_id' : 'whatsapp_id', userId);
    }
}

export const intentRouterService = new IntentRouterService();
