/**
 * Skill Router
 * Routes messages to appropriate skills based on NLU intent detection and pattern matching
 */

import { logger } from '../utils/logger';
import { Session as SessionContext } from '../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../protocol';

// Import skills
import { documentProcessingSkill } from './document-processing';
import { vatCalculationSkill } from './vat-calculation';
import { taxCalculationSkill } from './tax-calculation';
import { identityVerificationSkill } from './identity-verification';
import { receiptProcessingSkill } from './receipt-processing';
import { enhancedOnboardingSkill } from './enhanced-onboarding';

// Import NLU and context services
import { nluService, NLUResult, NLUIntent } from '../services/nlu.service';
import { conversationContext } from '../services/conversation-context';
import { intentHandlers } from './intent-handlers';

// Import personality layer
import { PersonalityFormatter } from '../utils/personality';

// NLU confidence threshold for routing
const NLU_CONFIDENCE_THRESHOLD = 0.6;

export class SkillRouter {
    /**
     * Route message to appropriate skill using NLU + pattern matching
     */
    async route(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            const lowerMessage = message.toLowerCase();
            const userId = context.userId;

            // ===== PRIORITY 1: Document uploads (highest priority) =====
            if (context.metadata?.documentUrl) {
                const docType = context.metadata.documentType;
                
                if (docType === 'receipt') {
                    logger.info('[Router] Routing to receipt-processing skill', {
                        userId: context.userId,
                        documentType: docType
                    });
                    return await receiptProcessingSkill.handle(message, context);
                }
                
                logger.info('[Router] Routing to document-processing skill', {
                    userId: context.userId,
                    documentType: docType
                });
                return await documentProcessingSkill.handle(message, context);
            }

            if (context.metadata?.receiptUrl) {
                logger.info('[Router] Routing to receipt-processing skill', { userId: context.userId });
                return await receiptProcessingSkill.handle(message, context);
            }

            // ===== PRIORITY 2: Structured commands (regex patterns) =====
            // These are direct, unambiguous commands that should bypass NLU

            // VAT calculation: "vat 50000" or "vat 50000 electronics"
            if (this.matchesPattern(lowerMessage, /^vat\s+\d/i) || 
                this.matchesPattern(lowerMessage, /calculate vat|vat calc/i)) {
                logger.info('[Router] Pattern match: VAT calculation', { userId });
                return await vatCalculationSkill.handle(message, context);
            }

            // Tax calculation: "tax 1000000" or "salary 350000"
            if (this.matchesPattern(lowerMessage, /^(tax|salary|pension|freelance)\s+\d/i) ||
                this.matchesPattern(lowerMessage, /calculate.*tax|income tax|paye/i)) {
                logger.info('[Router] Pattern match: Tax calculation', { userId });
                return await taxCalculationSkill.handle(message, context);
            }

            // Identity verification: "verify NIN 12345678901"
            if (this.matchesPattern(lowerMessage, /verify|nin|cac|tin|bvn|rc\d+/i) ||
                context.metadata?.awaitingNIN || 
                context.metadata?.awaitingTIN ||
                context.metadata?.awaitingCAC ||
                context.metadata?.awaitingBVN) {
                logger.info('[Router] Pattern match: Identity verification', { userId });
                return await identityVerificationSkill.handle(message, context);
            }

            // Onboarding: "/start" or new user
            if (context.metadata?.needsOnboarding || 
                context.metadata?.isNewUser ||
                context.metadata?.awaitingOnboarding ||
                this.matchesPattern(lowerMessage, /^\/?(start|onboard|setup|get started|begin)$/i)) {
                logger.info('[Router] Pattern match: Onboarding', { userId });
                return await enhancedOnboardingSkill.handle(message, context);
            }

            // Help command
            if (this.matchesPattern(lowerMessage, /^help$/i) || this.matchesPattern(lowerMessage, /what can you do/i)) {
                return this.getHelpMessage();
            }

            // ===== PRIORITY 3: NLU-based routing =====
            // Use NLU for natural language queries
            
            const nluResult = await this.classifyWithNLU(message, userId, context);
            
            if (nluResult && nluResult.intent.confidence >= NLU_CONFIDENCE_THRESHOLD) {
                logger.info('[Router] NLU classification', {
                    userId,
                    intent: nluResult.intent.name,
                    confidence: nluResult.intent.confidence,
                    source: nluResult.source
                });

                // Update conversation context
                conversationContext.addUserMessage(
                    userId,
                    message,
                    nluResult.intent.name,
                    nluResult.intent.entities as Record<string, unknown>
                );

                // Route based on NLU intent
                const response = await this.handleNLUIntent(nluResult, message, context);
                
                // Track assistant response
                conversationContext.addAssistantMessage(userId, response.message);
                
                return response;
            }

            // ===== PRIORITY 4: Coming soon features =====
            if (this.matchesPattern(lowerMessage, /save|tax saving|deduction|claim|vat input/i)) {
                logger.info('[Router] Tax savings query detected', { userId });
                return {
                    message: "💰 Tax Savings Advisor coming soon!\n\nI'll help you identify unclaimed deductions, capital allowances, and tax optimization opportunities.\n\nFor now, try:\n• `vat 50000 electronics` - Calculate VAT\n• `tax 10000000` - Calculate income tax\n• Upload a bank statement for analysis",
                    metadata: { skill: 'tax-savings-advisor', status: 'coming_soon' }
                };
            }

            if (this.matchesPattern(lowerMessage, /forecast|predict|cash flow|projection|tax due/i)) {
                logger.info('[Router] Cash flow query detected', { userId });
                return {
                    message: "📈 Cash Flow Forecaster coming soon!\n\nI'll predict your upcoming tax liabilities and help you plan ahead.\n\nFor now, upload your bank statement for analysis.",
                    metadata: { skill: 'cash-flow-forecaster', status: 'coming_soon' }
                };
            }

            if (this.matchesPattern(lowerMessage, /file vat|submit return|vat return|filing/i)) {
                logger.info('[Router] VAT filing query detected', { userId });
                return {
                    message: "📄 Filing Automation coming soon!\n\nI'll generate FIRS-compliant VAT returns with one click.\n\nFor now, upload your bank statement to classify transactions.",
                    metadata: { skill: 'filing-automation', status: 'coming_soon' }
                };
            }

            // ===== DEFAULT: Conversational response with personality =====
            logger.info('[Router] No match, using conversational response', { userId });
            const timeOfDay = this.getTimeOfDay();
            const result = await intentHandlers.handleGeneralQuery(
                { name: 'general_query', confidence: 0.5, entities: {} },
                context,
                timeOfDay
            );

            return {
                message: result.message,
                buttons: result.buttons,
                metadata: { 
                    skill: 'conversational',
                    nlu: nluResult ? {
                        intent: nluResult.intent.name,
                        confidence: nluResult.intent.confidence,
                        source: nluResult.source
                    } : undefined
                }
            };
        } catch (error) {
            logger.error('[Router] Routing error:', error);
            return {
                message: PersonalityFormatter.error(
                    (error as Error).message || 'Something went wrong',
                    true
                ),
                metadata: { error: (error as Error).message }
            };
        }
    }

    /**
     * Classify message using NLU service
     */
    private async classifyWithNLU(
        message: string,
        userId: string,
        context: SessionContext
    ): Promise<NLUResult | null> {
        try {
            const recentMessages = conversationContext.getRecentMessages(userId, 5);
            
            return await nluService.classifyIntent(message, {
                recentMessages,
                userId,
                entityType: context.metadata?.entityType as 'business' | 'individual'
            });
        } catch (error) {
            logger.error('[Router] NLU classification error:', error);
            return null;
        }
    }

    /**
     * Handle NLU-detected intent
     */
    private async handleNLUIntent(
        nluResult: NLUResult,
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        const { intent } = nluResult;
        const timeOfDay = this.getTimeOfDay();

        switch (intent.name) {
            case 'get_transaction_summary': {
                const result = await intentHandlers.handleTransactionSummary(intent, context);
                return {
                    message: result.message,
                    buttons: result.buttons,
                    metadata: { ...result.metadata, nlu: this.formatNLUMetadata(nluResult) }
                };
            }

            case 'get_tax_relief_info': {
                const result = await intentHandlers.handleTaxReliefInfo(intent, context);
                return {
                    message: result.message,
                    buttons: result.buttons,
                    metadata: { ...result.metadata, nlu: this.formatNLUMetadata(nluResult) }
                };
            }

            case 'get_tax_calculation': {
                // If we have amount, route to tax skill
                if (intent.entities.amount) {
                    const taxType = intent.entities.tax_type as string || 'income';
                    const amount = intent.entities.amount as number;
                    
                    if (taxType === 'vat') {
                        return await vatCalculationSkill.handle(
                            `vat ${amount} ${intent.entities.description || ''}`,
                            context
                        );
                    }
                    
                    return await taxCalculationSkill.handle(
                        `tax ${amount}`,
                        context
                    );
                }
                
                // Otherwise, ask for details
                return {
                    message: "🧮 *Tax Calculator*\n\nWhat type of tax would you like to calculate?\n\n" +
                        "Reply with:\n" +
                        "• `vat 50000 electronics` - VAT calculation\n" +
                        "• `tax 10000000` - Income tax\n" +
                        "• `salary 350000` - PAYE calculation\n" +
                        "• `freelance 7200000 expenses 1800000` - Freelancer tax",
                    buttons: [[
                        { text: '📊 VAT', callback_data: 'calc_vat' },
                        { text: '💰 Income Tax', callback_data: 'calc_income' }
                    ]],
                    metadata: { skill: 'tax-calculation', nlu: this.formatNLUMetadata(nluResult) }
                };
            }

            case 'upload_receipt': {
                return {
                    message: "📤 *Upload Your Document*\n\n" +
                        "Please send me:\n" +
                        "• A bank statement (PDF or image)\n" +
                        "• An invoice or receipt photo\n\n" +
                        "I'll extract and classify the transactions automatically!",
                    buttons: [[
                        { text: '📎 Upload Now', callback_data: 'upload_now' }
                    ]],
                    metadata: { skill: 'upload', nlu: this.formatNLUMetadata(nluResult) }
                };
            }

            case 'categorize_expense': {
                // Check for Section 191 warning
                if (nluResult.artificialTransactionCheck?.isSuspicious) {
                    return {
                        message: `⚠️ *SECTION 191 ALERT*\n\n${nluResult.artificialTransactionCheck.warning}\n\n` +
                            `📖 Reference: ${nluResult.artificialTransactionCheck.actReference}\n\n` +
                            "How would you like to categorize this?",
                        buttons: [[
                            { text: '💼 Business', callback_data: 'cat_business' },
                            { text: '👤 Personal', callback_data: 'cat_personal' },
                            { text: '📋 Review', callback_data: 'cat_review' }
                        ]],
                        metadata: { 
                            skill: 'categorization',
                            section191: true,
                            nlu: this.formatNLUMetadata(nluResult)
                        }
                    };
                }
                
                return {
                    message: "🏷️ How would you like to categorize this expense?",
                    buttons: [[
                        { text: '💼 Business', callback_data: 'cat_business' },
                        { text: '👤 Personal', callback_data: 'cat_personal' }
                    ]],
                    metadata: { skill: 'categorization', nlu: this.formatNLUMetadata(nluResult) }
                };
            }

            case 'set_reminder': {
                const result = await intentHandlers.handleSetReminder(intent, context);
                return {
                    message: result.message,
                    buttons: result.buttons,
                    metadata: { ...result.metadata, nlu: this.formatNLUMetadata(nluResult) }
                };
            }

            case 'connect_bank': {
                const result = await intentHandlers.handleConnectBank(intent, context);
                return {
                    message: result.message,
                    buttons: result.buttons,
                    metadata: { ...result.metadata, nlu: this.formatNLUMetadata(nluResult) }
                };
            }

            case 'verify_identity': {
                // If we have ID details, route to verification skill
                if (intent.entities.id_type && intent.entities.id_value) {
                    return await identityVerificationSkill.handle(
                        `verify ${intent.entities.id_type} ${intent.entities.id_value}`,
                        context
                    );
                }
                
                return {
                    message: "🆔 *Identity Verification*\n\n" +
                        "Which ID would you like to verify?\n\n" +
                        "Reply with:\n" +
                        "• `verify NIN 12345678901`\n" +
                        "• `verify TIN 1234567890`\n" +
                        "• `verify CAC RC123456`",
                    buttons: [[
                        { text: '🪪 NIN', callback_data: 'verify_nin' },
                        { text: '📋 TIN', callback_data: 'verify_tin' },
                        { text: '🏢 CAC', callback_data: 'verify_cac' }
                    ]],
                    metadata: { skill: 'identity-verification', nlu: this.formatNLUMetadata(nluResult) }
                };
            }

            case 'onboarding': {
                return await enhancedOnboardingSkill.handle(message, context);
            }

            case 'general_query':
            default: {
                const result = await intentHandlers.handleGeneralQuery(intent, context, timeOfDay);
                return {
                    message: result.message,
                    buttons: result.buttons,
                    metadata: { ...result.metadata, nlu: this.formatNLUMetadata(nluResult) }
                };
            }
        }
    }

    /**
     * Format NLU result for metadata
     */
    private formatNLUMetadata(nluResult: NLUResult): Record<string, unknown> {
        return {
            intent: nluResult.intent.name,
            confidence: nluResult.intent.confidence,
            source: nluResult.source,
            entities: nluResult.intent.entities,
            reasoning: nluResult.intent.reasoning,
            artificialCheck: nluResult.artificialTransactionCheck
        };
    }

    /**
     * Check if message matches a pattern
     */
    private matchesPattern(message: string, pattern: RegExp): boolean {
        return pattern.test(message);
    }

    /**
     * Get time of day for greetings
     */
    private getTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
        const hour = new Date().getHours();
        if (hour < 12) return 'morning';
        if (hour < 17) return 'afternoon';
        return 'evening';
    }

    /**
     * Get help message
     */
    private getHelpMessage(): Static<typeof MessageResponseSchema> {
        return {
            message: `🤖 PRISM Tax Assistant - Help

**Available Features:**

📊 **Tax Calculations**
• \`vat [amount] [description]\` - Calculate VAT (7.5%)
• \`tax [amount]\` - Income tax calculation
• \`salary [amount]\` - PAYE calculation
• \`pension [amount]\` - Pension income (tax exempt)
• \`freelance [income] expenses [amount]\` - Business income

🆔 **Identity Verification**
• \`verify NIN [number]\` - National ID
• \`verify TIN [number]\` - Tax ID
• \`verify CAC [RC/BN number]\` - Company registration

📄 **Bank Statement Processing**
Upload a bank statement (PDF/image) to:
• Extract and classify transactions
• Detect USSD, OPay, PalmPay payments
• Identify compliance issues
• Calculate VAT position

📸 **Receipt Processing**
Upload receipt photos to:
• Extract vendor and amount
• Categorize expenses
• Track VAT input

💡 **Natural Language Queries**
Just ask me in plain English:
• "How much tax did I pay last month?"
• "What deductions can I claim?"
• "Remind me about VAT filing"

**Quick Commands:**
• "help" - Show this message
• Upload file - Process document
• "status" - Check processing status

Need assistance? Reply with your question!`,
            metadata: { skill: 'help' }
        };
    }
}

export const skillRouter = new SkillRouter();
