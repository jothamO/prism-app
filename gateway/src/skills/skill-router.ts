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

export class SkillRouter {
    /**
     * Route message to appropriate skill
     */
    async route(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            // Document processing (highest priority - file upload)
            if (context.metadata?.documentUrl) {
                logger.info('[Router] Routing to document-processing skill', {
                    userId: context.userId,
                    documentType: context.metadata.documentType
                });
                return await documentProcessingSkill.handle(message, context);
            }

            // Tax savings queries
            if (this.matchesPattern(message, /save|tax saving|deduction|claim|vat input/i)) {
                logger.info('[Router] Tax savings query detected', { userId: context.userId });
                return {
                    message: "💰 Tax Savings Advisor coming soon!\n\nI'll help you identify unclaimed deductions, capital allowances, and tax optimization opportunities.\n\nFor now, upload your bank statement to get started.",
                    metadata: { skill: 'tax-savings-advisor', status: 'coming_soon' }
                };
            }

            // Cash flow forecasting
            if (this.matchesPattern(message, /forecast|predict|cash flow|projection|tax due/i)) {
                logger.info('[Router] Cash flow query detected', { userId: context.userId });
                return {
                    message: "📈 Cash Flow Forecaster coming soon!\n\nI'll predict your upcoming tax liabilities and help you plan ahead.\n\nFor now, upload your bank statement for analysis.",
                    metadata: { skill: 'cash-flow-forecaster', status: 'coming_soon' }
                };
            }

            // VAT filing
            if (this.matchesPattern(message, /file vat|submit return|vat return|filing/i)) {
                logger.info('[Router] VAT filing query detected', { userId: context.userId });
                return {
                    message: "📄 Filing Automation coming soon!\n\nI'll generate FIRS-compliant VAT returns with one click.\n\nFor now, upload your bank statement to classify transactions.",
                    metadata: { skill: 'filing-automation', status: 'coming_soon' }
                };
            }

            // Help command
            if (this.matchesPattern(message, /^help$/i) || this.matchesPattern(message, /what can you do/i)) {
                return this.getHelpMessage();
            }

            // Default: conversational response
            logger.info('[Router] No skill matched, using default response', { userId: context.userId });
            return {
                message: `I'm PRISM, your Nigerian tax assistant! 🇳🇬

I specialize in:
📄 Bank statement analysis
💰 Tax savings identification
📊 VAT compliance
⏰ Deadline reminders

To get started:
• Upload a bank statement (PDF/image)
• Ask about tax savings
• Request a VAT forecast

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
     * Get help message
     */
    private getHelpMessage(): Static<typeof MessageResponseSchema> {
        return {
            message: `🤖 PRISM Tax Assistant - Help

**Available Features:**

📄 **Bank Statement Processing**
Upload a bank statement (PDF/image) to:
• Extract and classify transactions
• Detect USSD, OPay, PalmPay payments
• Identify compliance issues
• Learn your spending patterns

💰 **Tax Savings** (Coming Soon)
Ask "what can I save?" to:
• Find unclaimed VAT deductions
• Identify capital allowances
• Discover tax relief opportunities

📈 **Cash Flow Forecasting** (Coming Soon)
Ask "forecast my taxes" to:
• Predict upcoming VAT payments
• Estimate company tax liability
• Plan for deadlines

📋 **VAT Filing** (Coming Soon)
Ask "file my VAT" to:
• Generate FIRS-compliant returns
• One-click submission
• Automatic calculations

**Quick Commands:**
• "help" - Show this message
• Upload file - Process bank statement
• "status" - Check processing status

Need assistance? Reply with your question!`,
            metadata: { skill: 'help' }
        };
    }
}

export const skillRouter = new SkillRouter();
