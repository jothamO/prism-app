/**
 * Pattern Review Skill
 * Allows users to review and confirm/reject learned patterns
 * Command: "review patterns" or "show what you learned"
 */

import { logger } from '../../utils/logger';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema, SessionContext } from '../../protocol';
import { PatternLearner, type LearnedPattern } from '../document-processing/feedback/pattern-learner';

export class PatternReviewSkill {
    name = 'pattern-review';
    private patternLearner = new PatternLearner();

    /**
     * Handle pattern review requests
     */
    async handle(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            // Get business ID from context
            const businessId = context.metadata?.businessId;
            if (!businessId) {
                return {
                    message: "⚠️ No business selected. Please select a business first.",
                    metadata: { skill: this.name }
                };
            }

            // Check if user is confirming/rejecting a pattern
            if (context.metadata?.reviewingPattern) {
                return await this.handlePatternFeedback(message, context);
            }

            // Get recent patterns
            const patterns = await this.patternLearner.getTopPatterns(businessId, 10);

            if (patterns.length === 0) {
                return {
                    message: "🤔 I haven't learned any patterns yet!\n\nI'll start learning from your corrections on bank transactions.",
                    metadata: { skill: this.name }
                };
            }

            return {
                message: this.formatPatternsMessage(patterns),
                metadata: {
                    skill: this.name,
                    patterns: patterns.map((p: LearnedPattern) => ({
                        id: p.id,
                        pattern: p.itemPattern,
                        category: p.category,
                        confidence: p.confidence
                    }))
                }
            };
        } catch (error) {
            logger.error('[PatternReview] Error:', error);
            return {
                message: "❌ Failed to retrieve patterns. Please try again.",
                metadata: { skill: this.name, error: error instanceof Error ? error.message : String(error) }
            };
        }
    }

    /**
     * Format patterns into readable message
     */
    private formatPatternsMessage(patterns: LearnedPattern[]): string {
        const formatDate = (dateStr: string) => {
            const date = new Date(dateStr);
            const now = new Date();
            const daysDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

            if (daysDiff === 0) return 'today';
            if (daysDiff === 1) return 'yesterday';
            if (daysDiff < 7) return `${daysDiff} days ago`;
            if (daysDiff < 30) return `${Math.floor(daysDiff / 7)} weeks ago`;
            return `${Math.floor(daysDiff / 30)} months ago`;
        };

        const patternsList = patterns.map((p: LearnedPattern, i: number) => {
            const confidenceEmoji = p.confidence >= 0.9 ? '🟢' : p.confidence >= 0.75 ? '🟡' : '🟠';

            return `${i + 1}. ${confidenceEmoji} "${p.itemPattern}" → **${p.category}**
   • Confidence: ${Math.round(p.confidence * 100)}%
   • Seen: ${p.occurrences} time${p.occurrences !== 1 ? 's' : ''}
   • Last: ${formatDate(p.lastSeenAt)}`;
        }).join('\n\n');

        return `
🧠 **Patterns I've Learned**

${patternsList}

💡 **What this means**: 
I automatically recognize these patterns and classify them instantly (no AI needed = faster + cheaper!).

**Confidence levels**:
• 🟢 90%+ = Very confident
• 🟡 75-89% = Moderately confident  
• 🟠 <75% = Learning...

The more corrections you make, the smarter I get! 🚀
        `.trim();
    }

    /**
     * Handle pattern confirmation/rejection
     */
    private async handlePatternFeedback(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        const patternId = context.metadata.reviewingPattern;
        const feedback = message.toLowerCase();

        // TODO: Implement pattern confirmation/rejection logic
        // For now, just acknowledge

        return {
            message: "✅ Thanks for the feedback! Pattern review feature coming soon.",
            metadata: { skill: this.name }
        };
    }
}

export const patternReviewSkill = new PatternReviewSkill();
