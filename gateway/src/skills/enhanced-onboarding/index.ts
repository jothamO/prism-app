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
import { extractOnboardingResponse, ONBOARDING_OPTIONS } from './ai-extractor';
import { extractUserProfile, ExtractedProfile, TaxCategory, IncomeSource } from './profile-extractor';
import { getNextQuestion, getCompletionMessage, formatQuestion, getTaxGuidance, shouldSkipQuestion } from './adaptive-flow';

export interface OnboardingState {
    currentStep: number;
    totalSteps: number;
    completedSteps: string[];
    completed: boolean;
    // Adaptive mode tracking
    isAdaptiveMode?: boolean;
    extractedProfile?: ExtractedProfile;
    completedQuestions?: string[];
    data: {
        // Extended entity types
        entityType?: 'business' | 'individual' | 'self_employed' | 'student' | 'retiree' | 'unemployed' | 'corper';
        businessStage?: 'pre_revenue' | 'early' | 'growing' | 'established';
        accountSetup?: 'mixed' | 'separate' | 'multiple';
        receivesCapitalSupport?: boolean;
        capitalSource?: 'family' | 'investors' | 'loan' | 'bootstrapped' | 'grant';
        insightFrequency?: 'daily' | 'weekly' | 'monthly' | 'never';
        autoCategorize?: boolean;
        informalBusiness?: boolean;
        freelanceAccountSeparate?: boolean;
        // New adaptive profile fields
        occupation?: string;
        incomeSource?: IncomeSource;
        ageGroup?: 'youth' | 'adult' | 'senior' | 'unknown';
        employmentStatus?: 'employed' | 'self_employed' | 'unemployed' | 'retired' | 'student' | 'corper';
        taxCategory?: TaxCategory;
        taxCategoryReason?: string;
        hasBusinessIncome?: boolean;
        hasSalaryIncome?: boolean;
        hasFreelanceIncome?: boolean;
        hasPensionIncome?: boolean;
        hasRentalIncome?: boolean;
        isNYSC?: boolean;
        isRegistered?: boolean;  // CAC registration
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

    // Warm acknowledgments for each entity type selection
    private readonly ENTITY_ACKNOWLEDGMENTS: Record<string, string> = {
        'business': "Business owner! 💼 I love it. Let's make sure you're on top of your tax game.",
        'individual': "Working the 9-to-5! 💪 Let me help you track your salary and find any tax relief you're entitled to.",
        'self_employed': "Freelancer life! 💻 You're your own boss - and I'm here to handle the tax side of things.",
        'student': "Student! 🎓 Focus on your studies - I'll help you understand taxes when you start earning.",
        'retiree': "Retired and relaxing! 🎉 I'll help you manage taxes on pension and any other income.",
        'unemployed': "Job hunting! 💪 When you land that role, I'll be ready to help with your taxes.",
        'corper': "Corp member! 🇳🇬 Your NYSC allowance is tax-free. I'll track any side income you make."
    };

    // Warm acknowledgments for business stage
    private readonly STAGE_ACKNOWLEDGMENTS = {
        'pre_revenue': "Pre-revenue? No wahala! 🌱 Many successful businesses started exactly where you are.",
        'early': "Early stage - exciting times! 🚀 Those first customers are always special.",
        'growing': "Growing business! 📈 Now we're talking. Let's make sure you're tax-efficient as you scale.",
        'established': "Established business! 💪 You've built something solid. Let's optimize your tax position."
    };

    // Acknowledgments for account setup
    private readonly ACCOUNT_ACKNOWLEDGMENTS = {
        'mixed': "Mixed account - I get it, many Nigerians start this way. I'll help you identify which transactions are business vs personal.",
        'separate': "Separate accounts! Smart move 👏 This makes tracking so much easier.",
        'multiple': "Multiple accounts! Proper setup 💼 I'll help you consolidate insights across all of them."
    };

    // Acknowledgments for capital source
    private readonly CAPITAL_ACKNOWLEDGMENTS = {
        'family': "Family & friends support - the Nigerian way! 🤝 I'll make sure those transfers don't get counted as revenue.",
        'investors': "Investor funding! 🚀 Exciting! I'll help you track and correctly classify capital injections.",
        'loan': "Loan financing - smart leverage! 📊 I'll ensure loan proceeds aren't taxed as income.",
        'bootstrapped': "Bootstrapped! 💪 Self-made business. Respect! Let's maximize your hard-earned profits.",
        'grant': "Grant funding! 🎯 Excellent! I'll help ensure proper treatment of grant income."
    };

    /**
     * Handle onboarding messages
     */
    async handle(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            const lowerMessage = message.toLowerCase().trim();
            const isRestartCommand = lowerMessage === '/start' || lowerMessage === 'start';

            // CRITICAL FIX: Get progress from session context first (avoids UUID/string mismatch)
            // The onboardingProgress is stored in session metadata between requests
            let progress: OnboardingState;

            // If user sends /start, reset their onboarding progress
            if (isRestartCommand) {
                progress = this.getInitialProgress();
                logger.info(`[EnhancedOnboarding] User sent /start - restarting onboarding from step 1`);
            } else if (context.metadata?.onboardingProgress) {
                // Use session-stored progress (works with any user ID format)
                progress = context.metadata.onboardingProgress as OnboardingState;
                logger.info(`[EnhancedOnboarding] Using session progress, step ${progress.currentStep}`);
            } else {
                // Fallback: try database (may fail with non-UUID IDs, that's OK)
                progress = await this.getOnboardingProgress(context.userId, context.metadata?.businessId);
                logger.info(`[EnhancedOnboarding] Using DB progress, step ${progress.currentStep}`);
            }

            if (progress.completed && !isRestartCommand) {
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
                message: PersonalityFormatter.error("Something went wrong with onboarding", true),
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
            case 'entity_type':
                return await this.handleEntityType(message, context, progress);

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
     * Handle entity type question (Business, Individual, or Self-Employed)
     */
    private async handleEntityType(
        message: string,
        context: SessionContext,
        progress: OnboardingState
    ): Promise<Static<typeof MessageResponseSchema>> {
        const messageLower = message.toLowerCase().trim();
        let entityType: OnboardingState['data']['entityType'] | null = null;

        // Check if AI mode is enabled
        const useAI = context.metadata?.aiMode === true;

        if (useAI) {
            // AI Mode: Use full profile extraction for freeform understanding
            const profile = await extractUserProfile(message, context.metadata?.userName);

            logger.info('[EnhancedOnboarding] Profile extraction', {
                step: 'entity_type',
                input: message,
                entityType: profile.entityType,
                confidence: profile.entityTypeConfidence,
                taxCategory: profile.taxCategory,
                occupation: profile.attributes?.occupation
            });

            if (profile.entityTypeConfidence >= 0.5) {
                // Successfully detected user type - use adaptive flow
                entityType = profile.entityType;

                // Store full profile data with step advancement
                const updatedProgress: OnboardingState = {
                    ...progress,
                    currentStep: progress.currentStep + 1,  // Advance step in AI mode
                    isAdaptiveMode: true,
                    extractedProfile: profile,
                    completedQuestions: ['entity_type'],
                    completedSteps: [...progress.completedSteps, 'entity_type'],  // Track completed step
                    data: {
                        ...progress.data,
                        entityType: profile.entityType,
                        occupation: profile.attributes?.occupation,
                        incomeSource: profile.attributes?.incomeSource,
                        ageGroup: profile.attributes?.ageGroup,
                        employmentStatus: profile.attributes?.employmentStatus,
                        taxCategory: profile.taxCategory,
                        taxCategoryReason: profile.taxCategoryReason,
                        hasBusinessIncome: profile.attributes?.hasBusinessIncome,
                        hasSalaryIncome: profile.attributes?.hasSalaryIncome,
                        hasFreelanceIncome: profile.attributes?.hasFreelanceIncome,
                        hasPensionIncome: profile.attributes?.hasPensionIncome,
                        hasRentalIncome: profile.attributes?.hasRentalIncome,
                        isNYSC: profile.attributes?.isNYSC
                    }
                };

                // Save profile data
                await this.saveProgress(context.userId, context.metadata?.businessId, updatedProgress);

                // Get acknowledgment
                const acknowledgment = this.ENTITY_ACKNOWLEDGMENTS[profile.entityType] ||
                    `Got it! I understand you're a ${profile.attributes?.occupation || profile.entityType}.`;

                // Get next adaptive question based on user type
                const nextQuestion = getNextQuestion(profile, ['entity_type']);

                if (nextQuestion) {
                    // More questions to ask
                    return {
                        message: `${acknowledgment}\n\n${formatQuestion(nextQuestion)}`,
                        metadata: {
                            skill: this.name,
                            step: nextQuestion.id,
                            awaitingOnboarding: true,
                            onboardingProgress: updatedProgress
                        }
                    };
                } else {
                    // No more questions - complete onboarding
                    const taxGuidance = getTaxGuidance(profile);
                    const completionMsg = getCompletionMessage(profile);

                    await this.saveProgress(context.userId, context.metadata?.businessId, {
                        ...updatedProgress,
                        completed: true,
                        completedSteps: [...updatedProgress.completedSteps, 'entity_type', 'completed']
                    });

                    return {
                        message: `${acknowledgment}\n\n${taxGuidance}\n\n${completionMsg}\n\n📤 **To get started**: Connect your bank or send me a document, and I'll start tracking!`,
                        metadata: {
                            skill: this.name,
                            onboardingComplete: true,
                            taxCategory: profile.taxCategory
                        }
                    };
                }
            }

            // Low confidence - AI suggests asking for clarification
            if (profile.suggestedNextQuestion) {
                return {
                    message: profile.suggestedNextQuestion + (profile.suggestedOptions?.length
                        ? `\n\n${profile.suggestedOptions.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}`
                        : ''),
                    metadata: {
                        skill: this.name,
                        step: 'entity_type',
                        awaitingOnboarding: true,
                        onboardingProgress: progress
                    }
                };
            }
        } else {
            // Strict Mode: Use pattern matching with numbers and keywords
            if (messageLower === '1' || messageLower.includes('business') || messageLower.includes('company') || messageLower.includes('owner')) {
                entityType = 'business';
            } else if (messageLower === '2' || messageLower.includes('employ') || messageLower.includes('individual') || messageLower.includes('salary')) {
                entityType = 'individual';
            } else if (messageLower === '3' || messageLower.includes('self') || messageLower.includes('freelance') || messageLower.includes('contractor')) {
                entityType = 'self_employed';
            }
        }

        if (!entityType) {
            // First time - show welcome and entity type question
            const timeOfDay = this.getTimeOfDay();
            const greeting = PersonalityFormatter.greet(context.metadata?.userName, timeOfDay);

            const welcomeMessage = `${greeting}

Welcome to PRISM! 🇳🇬 I'm your personal tax assistant, built for Nigerians.

${PersonalityFormatter.onboardingQuestion(
                "First, tell me about yourself:",
                [
                    "1. Business Owner - I run a registered or informal business",
                    "2. Employed Individual - I earn a salary",
                    "3. Self-Employed / Freelancer - I work for myself"
                ],
                "This helps me give you the right tax advice"
            )}`;

            return {
                message: welcomeMessage,
                metadata: {
                    skill: this.name,
                    step: 'entity_type',
                    awaitingOnboarding: true,
                    onboardingProgress: progress  // Store progress in response metadata
                }
            };
        }

        // Get acknowledgment for their choice
        const acknowledgment = this.ENTITY_ACKNOWLEDGMENTS[entityType];

        // Different flows based on entity type
        if (entityType === 'individual') {
            // Skip to preferences for salaried individuals
            await this.saveProgress(context.userId, context.metadata?.businessId, {
                ...progress,
                currentStep: 7,
                completedSteps: [...progress.completedSteps, 'entity_type'],
                data: { ...progress.data, entityType }
            });

            // Show acknowledgment + preferences question
            return this.handlePreferencesWithAck(acknowledgment, context, {
                ...progress,
                currentStep: 7,
                data: { ...progress.data, entityType }
            });
        }

        if (entityType === 'self_employed') {
            // Simplified flow for freelancers - skip business stage, ask about account setup
            await this.saveProgress(context.userId, context.metadata?.businessId, {
                ...progress,
                currentStep: 3, // Jump to account_setup
                completedSteps: [...progress.completedSteps, 'entity_type', 'business_stage'],
                data: { ...progress.data, entityType, businessStage: 'early' } // Default stage
            });

            // Show acknowledgment + freelancer-specific account question
            return this.handleFreelancerAccountSetup(acknowledgment, context, {
                ...progress,
                currentStep: 3,
                data: { ...progress.data, entityType, businessStage: 'early' }
            });
        }

        // Business owner - go through full flow
        await this.saveProgress(context.userId, context.metadata?.businessId, {
            ...progress,
            currentStep: 2,
            completedSteps: [...progress.completedSteps, 'entity_type'],
            data: { ...progress.data, entityType }
        });

        // Show acknowledgment + business stage question
        return this.handleBusinessStageWithAck(acknowledgment, context, {
            ...progress,
            currentStep: 2,
            data: { ...progress.data, entityType }
        });
    }

    /**
     * Handle business stage with acknowledgment from previous step
     */
    private async handleBusinessStageWithAck(
        acknowledgment: string,
        context: SessionContext,
        progress: OnboardingState
    ): Promise<Static<typeof MessageResponseSchema>> {
        const question = PersonalityFormatter.onboardingQuestion(
            "What stage is your business?",
            [
                "1. Pre-revenue - Still planning or setting up",
                "2. Early stage - Just started, first customers coming in",
                "3. Growing - Scaling operations and revenue",
                "4. Established - Mature business with steady income"
            ],
            "This helps me tailor my advice to where you are"
        );

        return {
            message: `${acknowledgment}\n\n${question}`,
            metadata: {
                skill: this.name,
                step: 'business_stage',
                awaitingOnboarding: true,
                onboardingProgress: progress
            }
        };
    }

    /**
     * Handle business stage question
     */
    private async handleBusinessStage(
        message: string,
        context: SessionContext,
        progress: OnboardingState
    ): Promise<Static<typeof MessageResponseSchema>> {

        const messageLower = message.toLowerCase().trim();
        let stage: OnboardingState['data']['businessStage'] | null = null;

        // Check if AI mode is enabled
        const useAI = context.metadata?.aiMode === true;

        if (useAI) {
            // AI Mode: Use natural language extraction
            const extraction = await extractOnboardingResponse(
                message,
                "What stage is your business?",
                ONBOARDING_OPTIONS.business_stage,
                `${progress.data.entityType} user`
            );

            if (extraction.selectedValue) {
                stage = extraction.selectedValue as OnboardingState['data']['businessStage'];
                logger.info('[EnhancedOnboarding] AI extraction', {
                    step: 'business_stage',
                    input: message,
                    extracted: stage,
                    confidence: extraction.confidence
                });
            }
        } else {
            // Strict Mode: Check for number responses AND keywords
            if (messageLower === '1' || messageLower.includes('pre') || messageLower.includes('idea') || messageLower.includes('planning') || messageLower.includes('setting')) {
                stage = 'pre_revenue';
            } else if (messageLower === '2' || messageLower.includes('early') || messageLower.includes('started') || messageLower.includes('first') || messageLower.includes('just')) {
                stage = 'early';
            } else if (messageLower === '3' || messageLower.includes('grow') || messageLower.includes('scaling')) {
                stage = 'growing';
            } else if (messageLower === '4' || messageLower.includes('established') || messageLower.includes('mature') || messageLower.includes('steady')) {
                stage = 'established';
            }
        }

        if (!stage) {
            return {
                message: PersonalityFormatter.onboardingQuestion(
                    "What stage is your business?",
                    [
                        "1. Pre-revenue - Still planning or setting up",
                        "2. Early stage - Just started, first customers coming in",
                        "3. Growing - Scaling operations and revenue",
                        "4. Established - Mature business with steady income"
                    ],
                    "This helps me tailor my advice to where you are"
                ),
                metadata: {
                    skill: this.name,
                    step: 'business_stage',
                    awaitingOnboarding: true,
                    onboardingProgress: progress
                }
            };
        }

        // Get acknowledgment
        const acknowledgment = this.STAGE_ACKNOWLEDGMENTS[stage];

        // Save stage and move to next step
        await this.saveProgress(context.userId, context.metadata?.businessId, {
            ...progress,
            currentStep: 3,
            completedSteps: [...progress.completedSteps, 'business_stage'],
            data: { ...progress.data, businessStage: stage }
        });

        // Show acknowledgment + next question
        return this.handleAccountSetupWithAck(acknowledgment, context, {
            ...progress,
            currentStep: 3,
            data: { ...progress.data, businessStage: stage }
        });
    }

    /**
     * Handle account setup with acknowledgment
     */
    private async handleAccountSetupWithAck(
        acknowledgment: string,
        context: SessionContext,
        progress: OnboardingState
    ): Promise<Static<typeof MessageResponseSchema>> {
        const question = PersonalityFormatter.onboardingQuestion(
            "How do you manage your bank accounts?",
            [
                "1. Mixed - Same account for personal & business",
                "2. Separate - Different accounts for personal & business",
                "3. Multiple - Several bank accounts for business"
            ],
            "This affects how I categorize your transactions"
        );

        return {
            message: `${acknowledgment}\n\n${question}`,
            metadata: {
                skill: this.name,
                step: 'account_setup',
                awaitingOnboarding: true,
                onboardingProgress: progress
            }
        };
    }

    /**
     * Handle freelancer-specific account setup question
     */
    private async handleFreelancerAccountSetup(
        acknowledgment: string,
        context: SessionContext,
        progress: OnboardingState
    ): Promise<Static<typeof MessageResponseSchema>> {
        const question = PersonalityFormatter.onboardingQuestion(
            "Do you keep your freelance income separate from personal spending?",
            [
                "1. Yes - I have a separate account for work income",
                "2. No - Everything goes into one account",
                "3. Kinda - I try to, but it's not always clean"
            ],
            "This helps me identify your business transactions"
        );

        return {
            message: `${acknowledgment}\n\n${question}`,
            metadata: {
                skill: this.name,
                step: 'account_setup',
                awaitingOnboarding: true,
                onboardingProgress: progress
            }
        };
    }

    /**
     * Handle account setup question
     */
    private async handleAccountSetup(
        message: string,
        context: SessionContext,
        progress: OnboardingState
    ): Promise<Static<typeof MessageResponseSchema>> {

        const messageLower = message.toLowerCase().trim();
        let setup: OnboardingState['data']['accountSetup'] | null = null;

        // Check if AI mode is enabled
        const useAI = context.metadata?.aiMode === true;
        const isFreelancer = progress.data.entityType === 'self_employed';

        if (useAI) {
            // AI Mode: Use natural language extraction
            const options = isFreelancer ? ONBOARDING_OPTIONS.freelancer_account : ONBOARDING_OPTIONS.account_setup;
            const extraction = await extractOnboardingResponse(
                message,
                isFreelancer
                    ? "Do you keep your freelance income separate from personal spending?"
                    : "How do you manage your bank accounts?",
                options,
                `${progress.data.entityType} user`
            );

            if (extraction.selectedValue) {
                setup = extraction.selectedValue as OnboardingState['data']['accountSetup'];
                logger.info('[EnhancedOnboarding] AI extraction', {
                    step: 'account_setup',
                    input: message,
                    extracted: setup,
                    confidence: extraction.confidence
                });
            }
        } else {
            // Strict Mode: Handle both number and keyword responses
            if (messageLower === '1' || messageLower.includes('mixed') || messageLower.includes('same') || messageLower.includes('one') || messageLower.includes('yes')) {
                // For freelancers, "1. Yes - separate" maps to 'separate'
                setup = isFreelancer ? 'separate' : 'mixed';
            } else if (messageLower === '2' || messageLower.includes('separate') || messageLower.includes('different') || messageLower.includes('no')) {
                // For freelancers, "2. No - one account" maps to 'mixed'
                setup = isFreelancer ? 'mixed' : 'separate';
            } else if (messageLower === '3' || messageLower.includes('multiple') || messageLower.includes('many') || messageLower.includes('kinda') || messageLower.includes('try')) {
                // For freelancers, "3. Kinda" also maps to 'mixed'
                setup = isFreelancer ? 'mixed' : 'multiple';
            }
        }

        if (!setup) {
            // Show appropriate question based on entity type
            if (progress.data.entityType === 'self_employed') {
                return {
                    message: PersonalityFormatter.onboardingQuestion(
                        "Do you keep your freelance income separate from personal spending?",
                        [
                            "1. Yes - I have a separate account for work income",
                            "2. No - Everything goes into one account",
                            "3. Kinda - I try to, but it's not always clean"
                        ],
                        "This helps me identify your business transactions"
                    ),
                    metadata: {
                        skill: this.name,
                        step: 'account_setup',
                        awaitingOnboarding: true,
                        onboardingProgress: progress
                    }
                };
            }

            return {
                message: PersonalityFormatter.onboardingQuestion(
                    "How do you manage your bank accounts?",
                    [
                        "1. Mixed - Same account for personal & business",
                        "2. Separate - Different accounts for personal & business",
                        "3. Multiple - Several bank accounts for business"
                    ],
                    "This affects how I categorize your transactions"
                ),
                metadata: {
                    skill: this.name,
                    step: 'account_setup',
                    awaitingOnboarding: true,
                    onboardingProgress: progress
                }
            };
        }

        // Get acknowledgment
        const acknowledgment = this.ACCOUNT_ACKNOWLEDGMENTS[setup];

        await this.saveProgress(context.userId, context.metadata?.businessId, {
            ...progress,
            currentStep: 4,
            completedSteps: [...progress.completedSteps, 'account_setup'],
            data: { ...progress.data, accountSetup: setup }
        });

        // Self-employed skip capital support, go to preferences
        if (progress.data.entityType === 'self_employed') {
            await this.saveProgress(context.userId, context.metadata?.businessId, {
                ...progress,
                currentStep: 7,
                completedSteps: [...progress.completedSteps, 'account_setup', 'capital_support'],
                data: { ...progress.data, accountSetup: setup, capitalSource: 'bootstrapped' }
            });

            return this.handlePreferencesWithAck(acknowledgment, context, {
                ...progress,
                currentStep: 7,
                data: { ...progress.data, accountSetup: setup, capitalSource: 'bootstrapped' }
            });
        }

        // Business owners continue to capital support
        return this.handleCapitalSupportWithAck(acknowledgment, context, {
            ...progress,
            currentStep: 4,
            data: { ...progress.data, accountSetup: setup }
        });
    }

    /**
     * Handle capital support with acknowledgment
     */
    private async handleCapitalSupportWithAck(
        acknowledgment: string,
        context: SessionContext,
        progress: OnboardingState
    ): Promise<Static<typeof MessageResponseSchema>> {
        const stageHint = progress.data.businessStage === 'pre_revenue'
            ? "This helps me correctly classify capital injections vs revenue"
            : "This helps me understand your business funding";

        const question = PersonalityFormatter.onboardingQuestion(
            "How are you funding your business?",
            [
                "1. Family/Friends - Support from loved ones",
                "2. Investors - VC, angel, or institutional funding",
                "3. Loan/Credit - Bank loans or credit facilities",
                "4. Bootstrapped - Using own savings and revenue",
                "5. Grant - Government or organization grant"
            ],
            stageHint
        );

        return {
            message: `${acknowledgment}\n\n${question}`,
            metadata: {
                skill: this.name,
                step: 'capital_support',
                awaitingOnboarding: true,
                onboardingProgress: progress
            }
        };
    }

    /**
     * Handle capital support question
     */
    private async handleCapitalSupport(
        message: string,
        context: SessionContext,
        progress: OnboardingState
    ): Promise<Static<typeof MessageResponseSchema>> {

        const messageLower = message.toLowerCase().trim();
        let source: OnboardingState['data']['capitalSource'] | null = null;

        // Check if AI mode is enabled
        const useAI = context.metadata?.aiMode === true;

        if (useAI) {
            // AI Mode: Use natural language extraction
            const extraction = await extractOnboardingResponse(
                message,
                "How are you funding your business?",
                ONBOARDING_OPTIONS.capital_source,
                `${progress.data.entityType} user at ${progress.data.businessStage} stage`
            );

            if (extraction.selectedValue) {
                source = extraction.selectedValue as OnboardingState['data']['capitalSource'];
                logger.info('[EnhancedOnboarding] AI extraction', {
                    step: 'capital_support',
                    input: message,
                    extracted: source,
                    confidence: extraction.confidence
                });
            }
        } else {
            // Strict Mode: Handle both number and keyword responses
            if (messageLower === '1' || messageLower.includes('family') || messageLower.includes('friend') || messageLower.includes('personal')) {
                source = 'family';
            } else if (messageLower === '2' || messageLower.includes('investor') || messageLower.includes('vc') || messageLower.includes('angel')) {
                source = 'investors';
            } else if (messageLower === '3' || messageLower.includes('loan') || messageLower.includes('credit') || messageLower.includes('bank')) {
                source = 'loan';
            } else if (messageLower === '4' || messageLower.includes('bootstrap') || messageLower.includes('self') || messageLower.includes('own') || messageLower.includes('saving')) {
                source = 'bootstrapped';
            } else if (messageLower === '5' || messageLower.includes('grant') || messageLower.includes('award')) {
                source = 'grant';
            }
        }

        if (!source) {
            const stageHint = progress.data.businessStage === 'pre_revenue'
                ? "This helps me correctly classify capital injections vs revenue"
                : "This helps me understand your business funding";

            return {
                message: PersonalityFormatter.onboardingQuestion(
                    "How are you funding your business?",
                    [
                        "1. Family/Friends - Support from loved ones",
                        "2. Investors - VC, angel, or institutional funding",
                        "3. Loan/Credit - Bank loans or credit facilities",
                        "4. Bootstrapped - Using own savings and revenue",
                        "5. Grant - Government or organization grant"
                    ],
                    stageHint
                ),
                metadata: {
                    skill: this.name,
                    step: 'capital_support',
                    awaitingOnboarding: true,
                    onboardingProgress: progress
                }
            };
        }

        // Get acknowledgment
        const acknowledgment = this.CAPITAL_ACKNOWLEDGMENTS[source];

        await this.saveProgress(context.userId, context.metadata?.businessId, {
            ...progress,
            currentStep: 7,
            completedSteps: [...progress.completedSteps, 'capital_support'],
            data: {
                ...progress.data,
                capitalSource: source,
                receivesCapitalSupport: source !== 'bootstrapped'
            }
        });

        // Move to preferences with acknowledgment
        return this.handlePreferencesWithAck(acknowledgment, context, {
            ...progress,
            currentStep: 7,
            data: {
                ...progress.data,
                capitalSource: source,
                receivesCapitalSupport: source !== 'bootstrapped'
            }
        });
    }

    /**
     * Handle preferences with acknowledgment from previous step
     */
    private async handlePreferencesWithAck(
        acknowledgment: string,
        context: SessionContext,
        progress: OnboardingState
    ): Promise<Static<typeof MessageResponseSchema>> {
        const question = PersonalityFormatter.onboardingQuestion(
            "Last one! How often do you want tax insights?",
            [
                "1. Daily - Keep me posted every day",
                "2. Weekly - A summary once a week is good",
                "3. Monthly - Just monthly updates please",
                "4. Only when needed - Alert me when something's urgent"
            ],
            "You can always change this later"
        );

        return {
            message: `${acknowledgment}\n\n${question}`,
            metadata: {
                skill: this.name,
                step: 'preferences',
                awaitingOnboarding: true,
                onboardingProgress: progress
            }
        };
    }

    /**
     * Handle preferences configuration
     */
    private async handlePreferences(
        message: string,
        context: SessionContext,
        progress: OnboardingState
    ): Promise<Static<typeof MessageResponseSchema>> {

        const messageLower = message.toLowerCase().trim();
        let frequency: OnboardingState['data']['insightFrequency'] | null = null;

        // Check if AI mode is enabled
        const useAI = context.metadata?.aiMode === true;

        if (useAI) {
            // AI Mode: Use natural language extraction
            const extraction = await extractOnboardingResponse(
                message,
                "How often do you want tax insights?",
                ONBOARDING_OPTIONS.insight_frequency,
                `${progress.data.entityType} user completing onboarding`
            );

            if (extraction.selectedValue) {
                frequency = extraction.selectedValue as OnboardingState['data']['insightFrequency'];
                logger.info('[EnhancedOnboarding] AI extraction', {
                    step: 'preferences',
                    input: message,
                    extracted: frequency,
                    confidence: extraction.confidence
                });
            }
        } else {
            // Strict Mode: Check for number and keyword responses
            if (messageLower === '1' || messageLower.includes('daily') || messageLower.includes('every day')) {
                frequency = 'daily';
            } else if (messageLower === '2' || messageLower.includes('weekly') || messageLower.includes('week')) {
                frequency = 'weekly';
            } else if (messageLower === '3' || messageLower.includes('monthly') || messageLower.includes('month')) {
                frequency = 'monthly';
            } else if (messageLower === '4' || messageLower.includes('only') || messageLower.includes('urgent') || messageLower.includes('needed')) {
                frequency = 'never';
            }
        }

        if (!frequency) {
            // Show preferences question
            return {
                message: PersonalityFormatter.onboardingQuestion(
                    "Last one! How often do you want tax insights?",
                    [
                        "1. Daily - Keep me posted every day",
                        "2. Weekly - A summary once a week is good",
                        "3. Monthly - Just monthly updates please",
                        "4. Only when needed - Alert me when something's urgent"
                    ],
                    "You can always change this later"
                ),
                metadata: {
                    skill: this.name,
                    step: 'preferences',
                    awaitingOnboarding: true,
                    onboardingProgress: progress
                }
            };
        }

        // Save preferences and complete onboarding
        await this.saveProgress(context.userId, context.metadata?.businessId, {
            ...progress,
            currentStep: 8,
            completedSteps: [...progress.completedSteps, 'preferences'],
            completed: true,
            data: {
                ...progress.data,
                insightFrequency: frequency,
                autoCategorize: true
            }
        });

        // Return entity-specific completion message
        return this.getCompletionMessage(progress.data.entityType!, {
            ...progress.data,
            insightFrequency: frequency
        });
    }

    /**
     * Get entity-specific completion message
     */
    private getCompletionMessage(
        entityType: OnboardingState['data']['entityType'],
        data: OnboardingState['data']
    ): Static<typeof MessageResponseSchema> {

        const frequencyMessage = {
            'daily': "daily updates",
            'weekly': "weekly summaries",
            'monthly': "monthly reports",
            'never': "alerts only when urgent"
        }[data.insightFrequency!] || "weekly summaries";

        if (entityType === 'individual') {
            return {
                message: `✅ **You're all set!**

As a salaried individual, here's what I can help with:
• 📊 Track your salary and deductions
• 💰 Find tax relief opportunities (pension, mortgage, etc.)
• 📈 Monitor any side income
• 📋 Prepare for annual tax filing

I'll send you ${frequencyMessage}.

📤 **To get started**: Send me your payslip or bank statement, and I'll start tracking!`,
                metadata: { skill: this.name, onboardingComplete: true }
            };
        }

        if (entityType === 'self_employed') {
            return {
                message: `✅ **Freelancer Mode Activated!** 🎉

Here's what I'll do for you:
• 💵 Track client payments and income
• 📝 Categorize business expenses (internet, equipment, transport)
• 🧮 Calculate tax obligations
• 💡 Find deductible expenses you might miss

I'll send you ${frequencyMessage}.

📤 **To get started**: Upload your bank statement and I'll find your income patterns!`,
                metadata: { skill: this.name, onboardingComplete: true }
            };
        }

        // Business owner - detailed summary
        return {
            message: `✅ **Onboarding Complete!** 🎉

Here's your profile:
• 🏢 Stage: ${this.formatStage(data.businessStage)}
• 🏦 Accounts: ${this.formatAccountSetup(data.accountSetup)}
• 💰 Funding: ${this.formatCapitalSource(data.capitalSource)}
• 📊 Updates: ${frequencyMessage}

**What I'll do for you:**
• Categorize transactions automatically
• Track revenue vs capital injections
• Calculate VAT and income tax
• Alert you to filing deadlines

📤 **Next step**: Upload your bank statement and let's get started!`,
            metadata: { skill: this.name, onboardingComplete: true }
        };
    }

    /**
     * Get initial/default onboarding progress (for restarting)
     */
    private getInitialProgress(): OnboardingState {
        return {
            currentStep: 1,
            totalSteps: 8,
            completedSteps: [],
            completed: false,
            data: {}
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

        // Default new onboarding - start at entity_type
        return {
            currentStep: 1,
            totalSteps: 8,
            completedSteps: [],
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
                completed: progress.completed || progress.currentStep >= progress.totalSteps,
                data: progress.data,
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
                    onboarding_completed: progress.completed || progress.currentStep >= progress.totalSteps,
                    onboarding_completed_at: (progress.completed || progress.currentStep >= progress.totalSteps) ? new Date().toISOString() : null
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
        const stages: Record<string, string> = {
            'pre_revenue': 'Pre-revenue',
            'early': 'Early stage',
            'growing': 'Growing',
            'established': 'Established'
        };
        return stages[stage || ''] || 'Not specified';
    }

    private formatAccountSetup(setup?: string): string {
        const setups: Record<string, string> = {
            'mixed': 'Mixed (personal + business)',
            'separate': 'Separate accounts',
            'multiple': 'Multiple business accounts'
        };
        return setups[setup || ''] || 'Not specified';
    }

    private formatCapitalSource(source?: string): string {
        const sources: Record<string, string> = {
            'family': 'Family/Friends',
            'investors': 'Investors',
            'loan': 'Loan/Credit',
            'bootstrapped': 'Self-funded',
            'grant': 'Grant'
        };
        return sources[source || ''] || 'Self-funded';
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
