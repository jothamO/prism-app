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

            // ===== PRIORITY 3: Check if user needs onboarding =====
            const needsOnboarding = context.metadata?.needsOnboarding === true;
            const isNewUser = context.metadata?.isNewUser === true;
            const awaitingOnboarding = context.metadata?.awaitingOnboarding === true;
            const isOnboardingRequired = needsOnboarding || isNewUser || awaitingOnboarding;

            const isStartCommand = this.matchesPattern(lowerMessage, /^\/?start$/i);
            const isGreeting = this.matchesPattern(lowerMessage, /^(hi|hello|hey|morning|afternoon|evening|wetin|good\s*(morning|afternoon|evening))/i);
            const isStartRequest = this.matchesPattern(lowerMessage, /(get started|want to start|getting started|wan start|begin|let'?s\s+go)/i);

            // Returning user sends /start → Welcome back (not onboarding)
            if (isStartCommand && !isOnboardingRequired) {
                logger.info('[Router] Returning user - welcome back', { userId });
                return this.getWelcomeBackMessage(context);
            }

            // New user or needs onboarding → Start onboarding flow
            if (isOnboardingRequired || isStartRequest || 
                (isGreeting && isOnboardingRequired)) {
                logger.info('[Router] Routing to onboarding', { 
                    userId, 
                    isNewUser,
                    needsOnboarding,
                    awaitingOnboarding,
                    aiMode: context.metadata?.aiMode,
                    trigger: isOnboardingRequired ? 'required' : 'greeting'
                });
                return await enhancedOnboardingSkill.handle(message, context);
            }

            // Identity verification: "verify NIN 12345678901" (with word boundaries to prevent false matches)
            // MOVED AFTER ONBOARDING to prevent "tin" in "getting" from matching
            if (this.matchesPattern(lowerMessage, /\bverify\b|\bnin\b|\bcac\b|\btin\b|\bbvn\b|rc\d+/i) ||
                context.metadata?.awaitingNIN ||
                context.metadata?.awaitingTIN ||
                context.metadata?.awaitingCAC ||
                context.metadata?.awaitingBVN) {
                logger.info('[Router] Pattern match: Identity verification', { userId });
                return await identityVerificationSkill.handle(message, context);
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

            // ===== DEFAULT: AI-powered conversational response =====
            logger.info('[Router] Using AI conversation handler', { 
                userId, 
                intent: nluResult?.intent?.name 
            });

            const timeOfDay = this.getTimeOfDay();
            const result = await intentHandlers.handleGeneralQueryWithAI(
                message,
                nluResult?.intent || { name: 'general_query', confidence: 0.5, entities: {} },
                context,
                timeOfDay
            );

            return {
                message: result.message,
                buttons: result.buttons,
                metadata: {
                    skill: 'conversational-ai',
                    nlu: nluResult ? {
                        intent: nluResult.intent.name,
                        confidence: nluResult.intent.confidence,
                        source: nluResult.source
                    } : undefined,
                    ...result.metadata
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
                // Use AI-powered conversation for general queries
                const result = await intentHandlers.handleGeneralQueryWithAI(
                    '', // Message already processed by NLU
                    intent, 
                    context, 
                    timeOfDay
                );
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
     * Get welcome back message for returning users (with PRISM personality)
     */
    private getWelcomeBackMessage(context: SessionContext): Static<typeof MessageResponseSchema> {
        const userName = (context.metadata?.userName as string)?.split(' ')[0]; // First name only
        const timeOfDay = this.getTimeOfDay();
        const greeting = PersonalityFormatter.greet(userName, timeOfDay);
        
        // Randomized, Nigerian-style conversational messages
        const messages = [
            `${greeting}\n\nReady to crush some tax admin? 💪`,
            `${greeting}\n\nOya, what can I help you sort out today?`,
            `${greeting}\n\nBack for more tax magic? Let's go! 🚀`,
            `${greeting}\n\nMissed you! What's on your mind?`,
            `${greeting}\n\nWelcome back! Your books are calling. 📊`,
            `${greeting}\n\nE don tey! What are we tackling today?`,
        ];
        
        const randomMessage = messages[Math.floor(Math.random() * messages.length)];
        
        return {
            message: `${randomMessage}\n\n` +
                `Just send me:\n` +
                `📄 A bank statement or receipt\n` +
                `💰 "Calculate my tax" with your income\n` +
                `🧾 "VAT on 50K electronics"\n\n` +
                `Or just tell me what's on your mind - I dey here!`,
            buttons: [[
                { text: '📊 Calculate Tax', callback_data: 'calc_tax' },
                { text: '📄 Upload Document', callback_data: 'upload_doc' }
            ], [
                { text: '💡 Tax Reliefs', callback_data: 'view_reliefs' },
                { text: '❓ Help', callback_data: 'help' }
            ]],
            metadata: { skill: 'welcome-back', personality: true }
        };
    }

    /**
     * Get help message
     */
    private getHelpMessage(): Static<typeof MessageResponseSchema> {
        return {
            message: `🤖 *Hey there! I'm PRISM* - your friendly Nigerian tax assistant!\n\n` +
                `Here's what I can help you with:\n\n` +
                `📊 *Tax Calculations*\n` +
                `Just tell me your income and I'll calculate everything - PAYE, reliefs, the works!\n` +
                `Try: \`tax 5000000\` or \`salary 350000\`\n\n` +
                `🧾 *VAT Made Easy*\n` +
                `\`vat 50000 electronics\` - I'll break it down for you\n\n` +
                `📄 *Document Magic*\n` +
                `Upload a bank statement or receipt and watch me work! 🪄\n` +
                `I'll classify transactions, spot tax issues, and find savings.\n\n` +
                `🆔 *ID Verification*\n` +
                `\`verify NIN 12345678901\` - NIN, TIN, CAC - I verify them all\n\n` +
                `💬 *Or Just Chat!*\n` +
                `Ask me anything about Nigerian taxes. E.g:\n` +
                `• "What reliefs can I claim?"\n` +
                `• "How does VAT work?"\n` +
                `• "Remind me about filing deadlines"\n\n` +
                `Wetin you wan do today? 🙌`,
            metadata: { skill: 'help', personality: true }
        };
    }
}

export const skillRouter = new SkillRouter();
