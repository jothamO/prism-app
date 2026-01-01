import { supabase } from '../config/supabase';
import { TaxIDResolverService } from './tax-id-resolver.service';
import { MonoService } from './mono.service';
import { OCRService } from './ocr.service';
import { InsightsGeneratorService } from './insights-generator.service';

type Platform = 'telegram' | 'whatsapp';

interface MessageResponse {
    message: string;
    buttons?: any[][];
}

export class MessageHandlerService {
    private taxIDResolver: TaxIDResolverService;
    private monoService: MonoService;
    private ocrService: OCRService;
    private insightsGenerator: InsightsGeneratorService;

    constructor(private platform: Platform) {
        this.taxIDResolver = new TaxIDResolverService();
        this.monoService = new MonoService();
        this.ocrService = new OCRService();
        this.insightsGenerator = new InsightsGeneratorService();
    }

    /**
     * Handle text message (platform-agnostic)
     */
    async handleText(userId: string, text: string): Promise<MessageResponse> {
        // Get conversation state
        const state = await this.getConversationState(userId);

        // Command routing
        if (text.toLowerCase() === '/start' || text.toLowerCase() === 'hi') {
            return await this.handleOnboarding(userId);
        }

        if (text.toLowerCase().includes('export audit')) {
            return await this.handleAuditExport(userId);
        }

        if (text.toLowerCase() === 'help') {
            return await this.handleHelp();
        }

        // State-based routing
        if (state?.expecting === 'entity_type') {
            return await this.handleEntityTypeSelection(userId, text);
        }

        if (state?.expecting === 'nin') {
            return await this.handleNINInput(userId, text);
        }

        if (state?.expecting === 'cac') {
            return await this.handleCACInput(userId, text);
        }

        if (state?.expecting === 'business_name') {
            return await this.handleBusinessNameInput(userId, text);
        }

        if (state?.expecting === 'tin') {
            return await this.handleTINInput(userId, text);
        }

        if (state?.expecting === 'bvn') {
            return await this.handleBVNInput(userId, text);
        }

        // Default: general query
        return await this.handleGeneralQuery(userId, text);
    }

    /**
     * Handle photo upload (receipts)
     */
    async handlePhoto(userId: string, photoUrl: string): Promise<MessageResponse> {
        try {
            // Extract receipt data using OCR
            const receiptData = await this.ocrService.extractReceipt(photoUrl);

            // Save to database
            await supabase.from('receipts').insert({
                user_id: userId,
                image_url: photoUrl,
                merchant: receiptData.merchant,
                amount: receiptData.amount,
                date: receiptData.date,
                category: receiptData.category,
                confidence: receiptData.confidence
            });

            return {
                message: `✅ *Receipt Saved*\n\n` +
                    `📄 *Merchant:* ${receiptData.merchant}\n` +
                    `💰 *Amount:* ₦${receiptData.amount.toLocaleString()}\n` +
                    `📅 *Date:* ${receiptData.date}\n` +
                    `🏷️ *Category:* ${receiptData.category}\n\n` +
                    `Confidence: ${(receiptData.confidence * 100).toFixed(0)}%`,
                buttons: [
                    [
                        { text: '✅ Correct', callback_data: `confirm_receipt:${receiptData.id}` },
                        { text: '✏️ Edit', callback_data: `edit_receipt:${receiptData.id}` }
                    ]
                ]
            };
        } catch (error) {
            return {
                message: '❌ Could not process receipt. Please try again with a clearer image.'
            };
        }
    }

    /**
     * Handle document upload
     */
    async handleDocument(userId: string, fileUrl: string, filename: string): Promise<MessageResponse> {
        return {
            message: `📄 Document received: ${filename}\n\nFeature coming soon!`
        };
    }

    /**
     * Handle button callback
     */
    async handleCallback(userId: string, data: string): Promise<MessageResponse> {
        const [action, ...params] = data.split(':');

        switch (action) {
            case 'entity_type':
                return await this.handleEntityTypeSelection(userId, params[0]);

            case 'confirm_receipt':
                return await this.confirmReceipt(userId, params[0]);

            case 'connect_bank':
                return await this.startMonoConnection(userId);

            case 'discover_bvn':
                await this.setConversationState(userId, 'bvn');
                return {
                    message: `🔍 *Discover Your Bank Accounts*\n\n` +
                        `Enter your *BVN* (11 digits) to find all linked accounts:`
                };

            default:
                return { message: '❌ Unknown action' };
        }
    }

    /**
     * Onboarding flow
     */
    private async handleOnboarding(userId: string): Promise<MessageResponse> {
        // Check if user already onboarded
        const { data: user } = await supabase
            .from('users')
            .select('nin, cac_number, mono_account_id')
            .eq(this.platform === 'telegram' ? 'telegram_id' : 'whatsapp_id', userId)
            .single();

        if (user?.nin || user?.cac_number) {
            return {
                message: `👋 *Welcome back to PRISM!*\n\n` +
                    `Your account is active.\n\n` +
                    `💡 *Quick Commands:*\n` +
                    `• Send a receipt photo for auto-categorization\n` +
                    `• Type "insights" for tax-saving tips\n` +
                    `• Type "help" for all commands`
            };
        }

        // Start onboarding
        await this.setConversationState(userId, 'entity_type');

        return {
            message: `👋 *Welcome to PRISM!*\n\n` +
                `I'm your AI tax assistant for Nigeria.\n\n` +
                `I help you:\n` +
                `✅ Track expenses automatically\n` +
                `✅ Save money on taxes (avg ₦264K/year)\n` +
                `✅ Stay 100% compliant with Tax Act 2025\n\n` +
                `*To get started, tell me:*`,
            buttons: [
                [
                    { text: '👤 Individual (use NIN)', callback_data: 'entity_type:individual' }
                ],
                [
                    { text: '🏢 Business (use CAC)', callback_data: 'entity_type:business' }
                ],
                [
                    { text: '📋 I have my TIN', callback_data: 'entity_type:tin' }
                ]
            ]
        };
    }

    /**
     * Entity type selection
     */
    private async handleEntityTypeSelection(userId: string, choice: string): Promise<MessageResponse> {
        if (choice === '1' || choice === 'individual') {
            await this.setConversationState(userId, 'nin');

            return {
                message: `Great! What's your *NIN*?\n\n` +
                    `(11-digit National Identification Number)\n\n` +
                    `Example: 12345678901`
            };
        }

        if (choice === '2' || choice === 'business') {
            await this.setConversationState(userId, 'business_name');

            return {
                message: `Perfect! Let's set up your business.\n\n` +
                    `What's your *business name*?`
            };
        }

        if (choice === '3' || choice === 'tin') {
            await this.setConversationState(userId, 'tin');

            return {
                message: `Great! What's your *TIN*?\n\n` +
                    `(Tax Identification Number - usually 10-14 digits)\n\n` +
                    `This works for both individuals and businesses.`
            };
        }

        return {
            message: `Please select 1, 2, or 3, or tap a button above.`
        };
    }

    /**
     * NIN input handler
     */
    private async handleNINInput(userId: string, nin: string): Promise<MessageResponse> {
        // Validate NIN format
        if (!/^\d{11}$/.test(nin.trim())) {
            return {
                message: `❌ Invalid NIN format.\n\n` +
                    `NIN must be exactly 11 digits.\n\n` +
                    `Please try again:`
            };
        }

        try {
            // Verify NIN
            const resolution = await this.taxIDResolver.resolveTaxID(nin.trim(), 'nin');

            // Save to user record with verification metadata
            await this.updateUser(userId, {
                nin: nin.trim(),
                full_name: resolution.name,
                entity_type: 'individual',
                tax_regime: 'PIT',
                verification_status: 'verified',
                verification_source: resolution.verification_source,
                verified_at: new Date().toISOString()
            });

            await this.setConversationState(userId, 'bank_connection');

            return {
                message: `✅ *Identity Confirmed!*\n\n` +
                    `• Name: ${resolution.name}\n` +
                    `• Tax ID: ${nin}\n` +
                    `• Type: Individual\n\n` +
                    `*Next: Connect your bank*`,
                buttons: [
                    [{ text: '🏦 Connect Bank (Mono)', callback_data: 'connect_bank' }]
                ]
            };
        } catch (error) {
            return {
                message: `❌ Could not verify NIN.\n\n` +
                    `Please check and try again:`
            };
        }
    }

    /**
     * CAC input handler
     */
    private async handleCACInput(userId: string, cac: string): Promise<MessageResponse> {
        // Validate CAC format
        if (!/^(RC|BN)\d{6,7}$/i.test(cac.trim())) {
            return {
                message: `❌ Invalid CAC format.\n\n` +
                    `Format: RC1234567 or BN1234567\n\n` +
                    `Please try again:`
            };
        }

        try {
            // Verify CAC
            const resolution = await this.taxIDResolver.resolveTaxID(cac.trim().toUpperCase(), 'cac');

            // Save to user record with verification metadata
            await this.updateUser(userId, {
                cac_number: cac.trim().toUpperCase(),
                company_name: resolution.name,
                entity_type: 'company',
                tax_regime: 'CIT',
                verification_status: 'verified',
                verification_source: resolution.verification_source,
                verified_at: new Date().toISOString()
            });

            await this.setConversationState(userId, 'bank_connection');

            return {
                message: `✅ *Business Verified!*\n\n` +
                    `• Company: ${resolution.name}\n` +
                    `• CAC: ${cac.toUpperCase()}\n` +
                    `• Type: Company\n\n` +
                    `*Next: Connect your bank*`,
                buttons: [
                    [{ text: '🏦 Connect Bank (Mono)', callback_data: 'connect_bank' }]
                ]
            };
        } catch (error) {
            return {
                message: `❌ Could not verify CAC number.\n\n` +
                    `Please check and try again:`
            };
        }
    }

    /**
     * Business name input
     */
    private async handleBusinessNameInput(userId: string, name: string): Promise<MessageResponse> {
        await this.updateUser(userId, { business_name: name });
        await this.setConversationState(userId, 'cac');

        return {
            message: `Thanks! What's your *CAC registration number*?\n\n` +
                `Format: RC1234567 or BN1234567\n\n` +
            `Reply "skip" if you don't have it handy.`
        };
    }

    /**
     * TIN input handler
     */
    private async handleTINInput(userId: string, tin: string): Promise<MessageResponse> {
        // Validate TIN format
        const cleanTIN = tin.replace(/\s/g, '').trim();
        if (!/^[\d-]{8,15}$/.test(cleanTIN)) {
            return {
                message: `❌ Invalid TIN format.\n\n` +
                    `TIN should be 8-15 digits (with optional hyphens).\n\n` +
                    `Please try again:`
            };
        }

        try {
            // Verify TIN via Mono
            const resolution = await this.taxIDResolver.resolveTaxID(cleanTIN, 'tin');

            // Save to user record
            await this.updateUser(userId, {
                tin: cleanTIN,
                full_name: resolution.name,
                entity_type: resolution.entity_type,
                tax_regime: resolution.tax_rules,
                verification_status: 'verified',
                verification_source: resolution.verification_source,
                verified_at: new Date().toISOString()
            });

            await this.setConversationState(userId, 'bank_connection');

            const entityLabel = resolution.entity_type === 'individual' ? 'Individual' : 'Company';

            return {
                message: `✅ *TIN Verified!*\n\n` +
                    `• Name: ${resolution.name}\n` +
                    `• TIN: ${cleanTIN}\n` +
                    `• Type: ${entityLabel}\n` +
                    `• Tax Rules: ${resolution.tax_rules}\n\n` +
                    `*Next: Connect your bank*`,
                buttons: [
                    [{ text: '🏦 Connect Bank (Mono)', callback_data: 'connect_bank' }],
                    [{ text: '🔍 Discover Accounts (BVN)', callback_data: 'discover_bvn' }]
                ]
            };
        } catch (error: any) {
            const errorMsg = error.message || 'Could not verify TIN';
            return {
                message: `❌ ${errorMsg}\n\n` +
                    `Please check and try again, or use NIN/CAC instead:`
            };
        }
    }

    /**
     * BVN input handler - discover linked bank accounts
     */
    private async handleBVNInput(userId: string, bvn: string): Promise<MessageResponse> {
        // Validate BVN format (11 digits)
        const cleanBVN = bvn.replace(/\s/g, '').trim();
        if (!/^\d{11}$/.test(cleanBVN)) {
            return {
                message: `❌ Invalid BVN format.\n\n` +
                    `BVN should be 11 digits.\n\n` +
                    `Please try again:`
            };
        }

        try {
            // Discover bank accounts via Mono
            const accounts = await this.taxIDResolver.discoverBankAccounts(cleanBVN);

            if (accounts.length === 0) {
                return {
                    message: `ℹ️ No bank accounts found linked to this BVN.\n\n` +
                        `You can connect a bank manually:`,
                    buttons: [
                        [{ text: '🏦 Connect Bank Manually', callback_data: 'connect_bank' }]
                    ]
                };
            }

            // Format account list
            const accountList = accounts.map((a, i) => 
                `${i + 1}. ${a.bank_name} - ****${a.account_number.slice(-4)} (${a.account_type})`
            ).join('\n');

            await this.setConversationState(userId, 'select_account');

            return {
                message: `🔍 *Bank Accounts Found:*\n\n` +
                    `${accountList}\n\n` +
                    `Would you like to connect any of these accounts?`,
                buttons: [
                    [{ text: '🏦 Connect All', callback_data: 'connect_all_accounts' }],
                    [{ text: '📝 Choose Specific', callback_data: 'select_accounts' }],
                    [{ text: '⏭️ Skip for Now', callback_data: 'skip_bank' }]
                ]
            };
        } catch (error: any) {
            return {
                message: `❌ Could not lookup BVN.\n\n` +
                    `Please try again or connect your bank manually:`,
                buttons: [
                    [{ text: '🏦 Connect Bank Manually', callback_data: 'connect_bank' }]
                ]
            };
        }
    }

    /**
     * Start Mono bank connection
     */
    private async startMonoConnection(userId: string): Promise<MessageResponse> {
        // Generate Mono connect URL
        const connectUrl = await this.monoService.generateConnectUrl(userId);

        return {
            message: `🔗 *Connect Your Bank*\n\n` +
                `Click the link below to securely connect your bank account:\n\n` +
                `${connectUrl}\n\n` +
                `Your data is:\n` +
                `🔒 Encrypted end-to-end\n` +
                `👁️ Never shared\n` +
                `🗑️ Deletable anytime`
        };
    }

    /**
     * Help command
     */
    private async handleHelp(): Promise<MessageResponse> {
        return {
            message: `💡 *PRISM Help*\n\n` +
                `*Commands:*\n` +
                `• Send receipt photo → Auto-categorize\n` +
                `• \`insights\` → Tax-saving tips\n` +
                `• \`export audit [year]\` → Download FIRS package\n` +
                `• \`help\` → This message\n\n` +
                `*Features:*\n` +
                `✅ Auto tax calculations\n` +
                `✅ Receipt OCR\n` +
                `✅ EMTL detection\n` +
                `✅ VAT reconciliation\n` +
                `✅ Monthly insights`
        };
    }

    /**
     * General query handler
     */
    private async handleGeneralQuery(userId: string, text: string): Promise<MessageResponse> {
        return {
            message: `I'm not sure how to help with that.\n\n` +
                `Type "help" to see what I can do!`
        };
    }

    /**
     * Audit export
     */
    private async handleAuditExport(userId: string): Promise<MessageResponse> {
        return {
            message: `📦 Export feature coming soon!\n\n` +
                `This will generate a complete FIRS-compliant audit package.`
        };
    }

    /**
     * Confirm receipt
     */
    private async confirmReceipt(userId: string, receiptId: string): Promise<MessageResponse> {
        await supabase
            .from('receipts')
            .update({ confirmed: true })
            .eq('id', receiptId);

        return {
            message: `✅ Receipt confirmed and saved to your records!`
        };
    }

    /**
     * Get conversation state
     */
    private async getConversationState(userId: string): Promise<any> {
        const { data } = await supabase
            .from('conversation_state')
            .select('*')
            .eq(this.platform === 'telegram' ? 'telegram_id' : 'whatsapp_id', userId)
            .single();

        return data;
    }

    /**
     * Set conversation state
     */
    private async setConversationState(userId: string, expecting: string) {
        await supabase
            .from('conversation_state')
            .upsert({
                [this.platform === 'telegram' ? 'telegram_id' : 'whatsapp_id']: userId,
                expecting,
                updated_at: new Date().toISOString()
            });
    }

    /**
     * Update user record
     */
    private async updateUser(userId: string, updates: any) {
        await supabase
            .from('users')
            .update(updates)
            .eq(this.platform === 'telegram' ? 'telegram_id' : 'whatsapp_id', userId);
    }
}
