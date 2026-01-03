/**
 * Skill Router
 * Routes messages to appropriate skills based on context and content
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

// Import personality layer
import { PersonalityFormatter } from '../utils/personality';

export class SkillRouter {
    /**
     * Route message to appropriate skill
     */
    async route(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            const lowerMessage = message.toLowerCase();

            // Document processing (highest priority - file upload)
            if (context.metadata?.documentUrl) {
                // Check document type for routing
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

            // Receipt processing (photo upload without explicit type)
            if (context.metadata?.receiptUrl) {
                logger.info('[Router] Routing to receipt-processing skill', { userId: context.userId });
                return await receiptProcessingSkill.handle(message, context);
            }

            // VAT calculation queries
            if (this.matchesPattern(lowerMessage, /^vat\s+\d/i) || 
                this.matchesPattern(lowerMessage, /calculate vat|vat calc/i)) {
                logger.info('[Router] Routing to vat-calculation skill', { userId: context.userId });
                return await vatCalculationSkill.handle(message, context);
            }

            // Tax calculation queries (income, salary, pension, freelance)
            if (this.matchesPattern(lowerMessage, /^(tax|salary|pension|freelance)\s+\d/i) ||
                this.matchesPattern(lowerMessage, /calculate.*tax|income tax|paye/i)) {
                logger.info('[Router] Routing to tax-calculation skill', { userId: context.userId });
                return await taxCalculationSkill.handle(message, context);
            }

            // Identity verification queries
            if (this.matchesPattern(lowerMessage, /verify|nin|cac|tin|bvn|rc\d+/i) ||
                context.metadata?.awaitingNIN || 
                context.metadata?.awaitingTIN ||
                context.metadata?.awaitingCAC ||
                context.metadata?.awaitingBVN) {
                logger.info('[Router] Routing to identity-verification skill', { userId: context.userId });
                return await identityVerificationSkill.handle(message, context);
            }

            // Enhanced onboarding (for new users or incomplete onboarding)
            if (context.metadata?.needsOnboarding || 
                context.metadata?.awaitingOnboarding ||
                this.matchesPattern(lowerMessage, /^(start|onboard|setup|get started|begin)$/i)) {
                logger.info('[Router] Routing to enhanced-onboarding skill', { userId: context.userId });
                return await enhancedOnboardingSkill.handle(message, context);
            }

            // Tax savings queries (coming soon)
            if (this.matchesPattern(lowerMessage, /save|tax saving|deduction|claim|vat input/i)) {
                logger.info('[Router] Tax savings query detected', { userId: context.userId });
                return {
                    message: "💰 Tax Savings Advisor coming soon!\n\nI'll help you identify unclaimed deductions, capital allowances, and tax optimization opportunities.\n\nFor now, try:\n• `vat 50000 electronics` - Calculate VAT\n• `tax 10000000` - Calculate income tax\n• Upload a bank statement for analysis",
                    metadata: { skill: 'tax-savings-advisor', status: 'coming_soon' }
                };
            }

            // Cash flow forecasting (coming soon)
            if (this.matchesPattern(lowerMessage, /forecast|predict|cash flow|projection|tax due/i)) {
                logger.info('[Router] Cash flow query detected', { userId: context.userId });
                return {
                    message: "📈 Cash Flow Forecaster coming soon!\n\nI'll predict your upcoming tax liabilities and help you plan ahead.\n\nFor now, upload your bank statement for analysis.",
                    metadata: { skill: 'cash-flow-forecaster', status: 'coming_soon' }
                };
            }

            // VAT filing (coming soon)
            if (this.matchesPattern(lowerMessage, /file vat|submit return|vat return|filing/i)) {
                logger.info('[Router] VAT filing query detected', { userId: context.userId });
                return {
                    message: "📄 Filing Automation coming soon!\n\nI'll generate FIRS-compliant VAT returns with one click.\n\nFor now, upload your bank statement to classify transactions.",
                    metadata: { skill: 'filing-automation', status: 'coming_soon' }
                };
            }

            // Help command
            if (this.matchesPattern(lowerMessage, /^help$/i) || this.matchesPattern(lowerMessage, /what can you do/i)) {
                return this.getHelpMessage();
            }

            // Default: conversational response with personality
            logger.info('[Router] No skill matched, using default response', { userId: context.userId });
            const timeOfDay = this.getTimeOfDay();
            const greeting = PersonalityFormatter.greet(context.metadata?.userName, timeOfDay);

            return {
                message: `${greeting}

I can help you with:

📊 *Tax Calculations:*
• \`vat 50000 electronics\` - Calculate VAT
• \`tax 10000000\` - Income tax calculation
• \`salary 350000\` - PAYE calculation
• \`pension 500000\` - Pension tax (exempt)
• \`freelance 7200000 expenses 1800000\` - Freelancer tax

🆔 *Identity Verification:*
• \`verify NIN 12345678901\` - Verify NIN
• \`verify CAC RC123456\` - Verify company

📄 *Document Processing:*
• Upload a bank statement (PDF/image)
• Upload receipts for expense tracking

Reply "help" for more options.`,
                metadata: { skill: 'conversational' }
            };
        } catch (error) {
            logger.error('[Router] Routing error:', error);
            return {
                message: "❌ Something went wrong. Please try again or contact support.",
                metadata: { error: (error as Error).message }
            };
        }
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

💰 **Tax Savings** (Coming Soon)
Ask "what can I save?" to find deductions

📈 **Cash Flow Forecasting** (Coming Soon)
Ask "forecast my taxes" to predict liabilities

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
