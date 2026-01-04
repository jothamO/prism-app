/**
 * Enhanced Onboarding Skill
 * Guides users through improved onboarding with business context collection
 * Master Plan Phase 4 (lines 408-422)
 */

import { logger } from '../../utils/logger';
import { Session as SessionContext } from '../../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';
import { supabase } from '../../config';
import { PersonalityFormatter } from '../../utils/personality';

export interface OnboardingState {
    currentStep: number;
    totalSteps: number;
    completedSteps: string[];
    completed: boolean;
    data: {
        businessStage?: 'pre_revenue' | 'early' | 'growing' | 'established';
        accountSetup?: 'mixed' | 'separate' | 'multiple';
        receivesCapitalSupport?: boolean;
        capitalSource?: 'family' | 'investors' | 'loan' | 'bootstrapped' | 'grant';
        insightFrequency?: 'daily' | 'weekly' | 'monthly' | 'never';
        autoCategorize?: boolean;
        informalBusiness?: boolean;
    };
}

export class EnhancedOnboardingSkill {
    name = 'enhanced-onboarding';

    private readonly STEPS = [
        'entity_type',
        'business_stage',
        'account_setup',
        'capital_support',
        'verification',
        'bank_connection',
        'preferences',
        'initial_analysis'
    ];

    /**
     * Handle onboarding messages
     */
    async handle(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            // Get or create onboarding progress
            const progress = await this.getOnboardingProgress(context.userId, context.metadata?.businessId);

            if (progress.completed) {
                return {
                    message: "✅ You've already completed onboarding! How can I help you today?",
                    metadata: { skill: this.name }
                };
            }

            // Route to appropriate step handler
            const currentStepName = this.STEPS[progress.currentStep - 1];
            return await this.handleStep(currentStepName, message, context, progress);

        } catch (error) {
            logger.error('[EnhancedOnboarding] Error:', error);
            return {
                message: "❌ Something went wrong with onboarding. Let me restart for you.",
                metadata: { skill: this.name, error: error instanceof Error ? error.message : String(error) }
            };
        }
    }

    /**
     * Handle specific onboarding step
     */
    private async handleStep(
        stepName: string,
        message: string,
        context: SessionContext,
        progress: OnboardingState
    ): Promise<Static<typeof MessageResponseSchema>> {

        switch (stepName) {
            case 'business_stage':
                return await this.handleBusinessStage(message, context, progress);

            case 'account_setup':
                return await this.handleAccountSetup(message, context, progress);

            case 'capital_support':
                return await this.handleCapitalSupport(message, context, progress);

            case 'preferences':
                return await this.handlePreferences(message, context, progress);

            case 'initial_analysis':
                return await this.handleInitialAnalysis(message, context, progress);

            default:
                return {
                    message: `Proceeding with step: ${stepName}`,
                    metadata: { skill: this.name, step: stepName }
                };
        }
    }

    /**
     * Get time of day for personalized greetings
     */
    private getTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
        const hour = new Date().getHours();
        if (hour < 12) return 'morning';
        if (hour < 17) return 'afternoon';
        return 'evening';
    }

    /**
     * Handle business stage question
     */
    private async handleBusinessStage(
        message: string,
        context: SessionContext,
        progress: OnboardingState
    ): Promise<Static<typeof MessageResponseSchema>> {

        const messageLower = message.toLowerCase();
        let stage: OnboardingState['data']['businessStage'] | null = null;

        // Check for number responses
        if (messageLower === '1' || messageLower.includes('pre') || messageLower.includes('idea') || messageLower.includes('planning')) {
            stage = 'pre_revenue';
        } else if (messageLower === '2' || messageLower.includes('early') || messageLower.includes('started') || messageLower.includes('first')) {
            stage = 'early';
        } else if (messageLower === '3' || messageLower.includes('grow') || messageLower.includes('scaling')) {
            stage = 'growing';
        } else if (messageLower === '4' || messageLower.includes('established') || messageLower.includes('mature')) {
            stage = 'established';
        }

        if (!stage) {
            // First time asking - use personality layer for warm welcome
            const timeOfDay = this.getTimeOfDay();
            const greeting = PersonalityFormatter.greet(context.metadata?.userName, timeOfDay);

            const welcomeMessage = `${greeting}

Welcome to PRISM! 🇳🇬 I'm your personal tax assistant, built for Nigerian businesses.

Let me learn a bit about you so I can give you the best advice.

${PersonalityFormatter.onboardingQuestion(
    "What stage is your business?",
    [
        "1. Pre-revenue - Still planning or setting up",
        "2. Early stage - First customers, building product",
        "3. Growing - Scaling operations and revenue",
        "4. Established - Mature business with steady revenue"
    ],
    "This helps me tailor my advice to your needs"
)}`;

            return {
                message: welcomeMessage,
                metadata: { skill: this.name, step: 'business_stage', awaitingOnboarding: true }
            };
        }

        // Save stage and move to next step
        await this.saveProgress(context.userId, context.metadata?.businessId, {
            ...progress,
            currentStep: progress.currentStep + 1,
            completedSteps: [...progress.completedSteps, 'business_stage'],
            data: { ...progress.data, businessStage: stage }
        });

        // Return next question
        return this.handleAccountSetup('', context, {
            ...progress,
            currentStep: progress.currentStep + 1,
            data: { ...progress.data, businessStage: stage }
        });
    }

    /**
     * Handle account setup question
     */
    private async handleAccountSetup(
        message: string,
        context: SessionContext,
        progress: OnboardingState
    ): Promise<Static<typeof MessageResponseSchema>> {

        const messageLower = message.toLowerCase();
        let setup: OnboardingState['data']['accountSetup'] | null = null;

        if (messageLower.includes('mixed') || messageLower.includes('same') || messageLower.includes('one')) {
            setup = 'mixed';
        } else if (messageLower.includes('separate') || messageLower.includes('different')) {
            setup = 'separate';
        } else if (messageLower.includes('multiple') || messageLower.includes('many')) {
            setup = 'multiple';
        }

        if (!setup) {
            return {
                message: `
🏦 **How do you manage your bank accounts?**

This affects how I categorize transactions:

1️⃣ **Mixed** - I use the same account for personal & business
2️⃣ **Separate** - I have different accounts for personal & business
3️⃣ **Multiple** - I have multiple bank accounts for my business

Your choice?
                `.trim(),
                metadata: { skill: this.name, step: 'account_setup', awaitingInput: true }
            };
        }

        await this.saveProgress(context.userId, context.metadata?.businessId, {
            ...progress,
            currentStep: progress.currentStep + 1,
            completedSteps: [...progress.completedSteps, 'account_setup'],
            data: { ...progress.data, accountSetup: setup }
        });

        return this.handleCapitalSupport('', context, {
            ...progress,
            currentStep: progress.currentStep + 1,
            data: { ...progress.data, accountSetup: setup }
        });
    }

    /**
     * Handle capital support question
     */
    private async handleCapitalSupport(
        message: string,
        context: SessionContext,
        progress: OnboardingState
    ): Promise<Static<typeof MessageResponseSchema>> {

        const messageLower = message.toLowerCase();
        let source: OnboardingState['data']['capitalSource'] | null = null;

        if (messageLower.includes('family') || messageLower.includes('personal')) {
            source = 'family';
        } else if (messageLower.includes('investor') || messageLower.includes('vc') || messageLower.includes('angel')) {
            source = 'investors';
        } else if (messageLower.includes('loan') || messageLower.includes('credit') || messageLower.includes('bank')) {
            source = 'loan';
        } else if (messageLower.includes('bootstrap') || messageLower.includes('self') || messageLower.includes('own')) {
            source = 'bootstrapped';
        } else if (messageLower.includes('grant') || messageLower.includes('award')) {
            source = 'grant';
        }

        if (!source) {
            const stageMessage = progress.data.businessStage === 'pre_revenue'
                ? "\n💡 *Knowing this helps me correctly classify capital injections vs revenue*"
                : "";

            return {
                message: `
💰 **How are you funding your business?**

1️⃣ **Family/Friends** - Personal support from family or friends
2️⃣ **Investors** - VC, angel investors, or institutional funding
3️⃣ **Loan/Credit** - Bank loans or credit facilities
4️⃣ **Bootstrapped** - Using own savings and revenue
5️⃣ **Grant** - Government or organization grant${stageMessage}

Which applies to you?
                `.trim(),
                metadata: { skill: this.name, step: 'capital_support', awaitingInput: true }
            };
        }

        await this.saveProgress(context.userId, context.metadata?.businessId, {
            ...progress,
            currentStep: progress.currentStep + 1,
            completedSteps: [...progress.completedSteps, 'capital_support'],
            data: {
                ...progress.data,
                capitalSource: source,
                receivesCapitalSupport: source !== 'bootstrapped'
            }
        });

        // Skip to preferences (verification handled separately)
        return this.handlePreferences('', context, {
            ...progress,
            currentStep: 6, // Jump to preferences step
            data: {
                ...progress.data,
                capitalSource: source,
                receivesCapitalSupport: source !== 'bootstrapped'
            }
        });
    }

    /**
     * Handle preferences configuration
     */
    private async handlePreferences(
        message: string,
        context: SessionContext,
        progress: OnboardingState
    ): Promise<Static<typeof MessageResponseSchema>> {

        // Simple default preferences for now
        await this.saveProgress(context.userId, context.metadata?.businessId, {
            ...progress,
            currentStep: progress.currentStep + 1,
            completedSteps: [...progress.completedSteps, 'preferences'],
            data: {
                ...progress.data,
                insightFrequency: 'weekly',
                autoCategorize: true
            }
        });

        return {
            message: `
✅ **Onboarding Complete!**

Here's what I know about your business:
• Stage: ${this.formatStage(progress.data.businessStage)}
• Account Setup: ${this.formatAccountSetup(progress.data.accountSetup)}
• Funding: ${this.formatCapitalSource(progress.data.capitalSource)}

📊 **Next Steps**:
1. Upload your last bank statement
2. I'll analyze and categorize your transactions
3. You'll get tax insights and savings recommendations

Ready to upload your statement?
            `.trim(),
            metadata: { skill: this.name, onboardingComplete: true }
        };
    }

    /**
     * Get onboarding progress from database
     */
    private async getOnboardingProgress(userId: string, businessId?: string): Promise<OnboardingState> {
        const { data } = await supabase
            .from('onboarding_progress')
            .select('*')
            .eq('user_id', userId)
            .eq('business_id', businessId || '')
            .single();

        if (data) {
            return {
                currentStep: data.current_step,
                totalSteps: data.total_steps,
                completedSteps: data.completed_steps || [],
                completed: data.completed || false,
                data: data.data || {}
            };
        }

        // Default new onboarding
        return {
            currentStep: 2, // Start at business_stage (entity_type already done)
            totalSteps: 8,
            completedSteps: ['entity_type'],
            completed: false,
            data: {}
        };
    }

    /**
     * Save onboarding progress
     */
    private async saveProgress(userId: string, businessId: string | undefined, progress: OnboardingState): Promise<void> {
        await supabase
            .from('onboarding_progress')
            .upsert({
                user_id: userId,
                business_id: businessId,
                current_step: progress.currentStep,
                total_steps: progress.totalSteps,
                completed_steps: progress.completedSteps,
                completed: progress.currentStep >= progress.totalSteps,
                last_updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,business_id'
            });

        // Update business/user tables
        if (businessId && progress.data.businessStage) {
            await supabase
                .from('businesses')
                .update({
                    business_stage: progress.data.businessStage,
                    account_setup: progress.data.accountSetup,
                    receives_capital_support: progress.data.receivesCapitalSupport,
                    capital_source: progress.data.capitalSource,
                    onboarding_completed: progress.currentStep >= progress.totalSteps,
                    onboarding_completed_at: progress.currentStep >= progress.totalSteps ? new Date().toISOString() : null
                })
                .eq('id', businessId);
        }

        if (progress.data.insightFrequency || progress.data.autoCategorize !== undefined) {
            await supabase
                .from('users')
                .update({
                    insight_frequency: progress.data.insightFrequency,
                    auto_categorize: progress.data.autoCategorize
                })
                .eq('id', userId);
        }
    }

    // Formatting helpers
    private formatStage(stage?: string): string {
        const stages = {
            'pre_revenue': 'Pre-revenue',
            'early': 'Early stage',
            'growing': 'Growing',
            'established': 'Established'
        };
        return stages[stage as keyof typeof stages] || 'Unknown';
    }

    private formatAccountSetup(setup?: string): string {
        const setups = {
            'mixed': 'Mixed (personal + business)',
            'separate': 'Separate accounts',
            'multiple': 'Multiple business accounts'
        };
        return setups[setup as keyof typeof setups] || 'Unknown';
    }

    private formatCapitalSource(source?: string): string {
        const sources = {
            'family': 'Family/Friends',
            'investors': 'Investors',
            'loan': 'Loan/Credit',
            'bootstrapped': 'Bootstrapped',
            'grant': 'Grant'
        };
        return sources[source as keyof typeof sources] || 'Unknown';
    }

    /**
     * Handle initial analysis step
     */
    private async handleInitialAnalysis(
        message: string,
        context: SessionContext,
        progress: OnboardingState
    ): Promise<Static<typeof MessageResponseSchema>> {

        // Placeholder for auto-triggering document analysis
        return {
            message: "Initial analysis step - implementation pending",
            metadata: { skill: this.name, step: 'initial_analysis' }
        };
    }
}

export const enhancedOnboardingSkill = new EnhancedOnboardingSkill();
