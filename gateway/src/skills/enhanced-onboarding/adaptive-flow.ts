/**
 * Adaptive Flow Engine for Dynamic Onboarding
 * Determines which questions to ask based on user profile
 */

import { ExtractedProfile, TaxCategory, IncomeSource } from './profile-extractor';
import { PersonalityFormatter } from '../../utils/personality';

/**
 * Question definition for adaptive flow
 */
export interface AdaptiveQuestion {
    id: string;
    question: string;
    options: string[];
    hint?: string;
    extractsField: string;  // Which profile field this populates
}

/**
 * Flow configuration per user type
 */
interface FlowConfig {
    requiredQuestions: string[];
    optionalQuestions: string[];
    skipQuestions: string[];
    completionMessage: string;
}

/**
 * All possible onboarding questions
 */
export const ONBOARDING_QUESTIONS: Record<string, AdaptiveQuestion> = {
    // Income questions
    'part_time_income': {
        id: 'part_time_income',
        question: 'Do you have any part-time income or side hustle?',
        options: ['Yes, I work part-time', 'Yes, freelance/gig work', 'No income currently'],
        hint: 'This helps us understand if you have taxable income',
        extractsField: 'hasFreelanceIncome'
    },
    'pension_other_income': {
        id: 'pension_other_income',
        question: 'Besides your pension, do you have any other income?',
        options: ['Rental property income', 'Investment dividends', 'Part-time consulting', 'Just pension'],
        hint: 'Different income types have different tax treatments',
        extractsField: 'additionalIncome'
    },
    'business_registration': {
        id: 'business_registration',
        question: 'Is your business registered with CAC?',
        options: ['Yes, fully registered', 'No, informal business', 'In the process'],
        hint: 'Registered businesses have specific tax obligations',
        extractsField: 'isRegistered'
    },
    'business_stage': {
        id: 'business_stage',
        question: 'What stage is your business at?',
        options: ['Pre-revenue - Still planning', 'Early stage - Just started', 'Growing - Scaling up', 'Established - Steady income'],
        hint: 'This helps me tailor advice to where you are',
        extractsField: 'businessStage'
    },
    'employer_tax': {
        id: 'employer_tax',
        question: 'Does your employer deduct tax from your salary?',
        options: ['Yes, they handle PAYE', 'Not sure', 'No, I handle taxes myself'],
        hint: 'PAYE (Pay As You Earn) is handled by employers',
        extractsField: 'hasPayeDeduction'
    },
    'account_setup': {
        id: 'account_setup',
        question: 'How do you manage your bank accounts?',
        options: ['Mixed - Personal & business together', 'Separate - Different accounts', 'Multiple business accounts'],
        hint: 'This affects how we categorize transactions',
        extractsField: 'accountSetup'
    },
    'capital_source': {
        id: 'capital_source',
        question: 'How are you funding your business?',
        options: ['Family/Friends', 'Investors/VC', 'Loan/Credit', 'Bootstrapped (own savings)', 'Grant'],
        hint: 'This helps classify capital vs revenue correctly',
        extractsField: 'capitalSource'
    },
    'nysc_side_hustle': {
        id: 'nysc_side_hustle',
        question: 'Are you doing any side work during your service year?',
        options: ['Yes, freelance work', 'Small business on the side', 'No, just focusing on service'],
        hint: 'Understanding your income sources helps with tax planning',
        extractsField: 'hasFreelanceIncome'
    },
    'unemployment_income': {
        id: 'unemployment_income',
        question: 'Do you have any income while job hunting?',
        options: ['Savings/investment returns', 'Family support', 'Freelance/gig work', 'No income'],
        hint: 'Even without a job, some income may be taxable',
        extractsField: 'incomeSource'
    },
    'insight_frequency': {
        id: 'insight_frequency',
        question: 'How often would you like tax insights?',
        options: ['Daily updates', 'Weekly summary', 'Monthly only', 'Only when urgent'],
        hint: 'You can change this anytime',
        extractsField: 'insightFrequency'
    }
};

/**
 * Flow configurations per user type
 */
const FLOW_CONFIGS: Record<string, FlowConfig> = {
    student: {
        requiredQuestions: ['part_time_income'],
        optionalQuestions: ['insight_frequency'],
        skipQuestions: ['business_stage', 'capital_source', 'account_setup', 'employer_tax', 'business_registration'],
        completionMessage: `🎓 Welcome aboard! As a student, I'll help you understand how tax applies when you start earning. If you do any freelance work or side hustle, I'll track that for you!`
    },
    corper: {
        requiredQuestions: ['nysc_side_hustle'],
        optionalQuestions: ['insight_frequency'],
        skipQuestions: ['business_stage', 'capital_source', 'account_setup', 'employer_tax'],
        completionMessage: `🇳🇬 Welcome, Corp member! Your NYSC allowance is tax-free. I'll help you track any side income and prepare you for life after service!`
    },
    retiree: {
        requiredQuestions: ['pension_other_income'],
        optionalQuestions: ['account_setup', 'insight_frequency'],
        skipQuestions: ['business_stage', 'capital_source'],
        completionMessage: `🎉 Welcome! I'll help you manage taxes on your pension and any other income. Retirement doesn't mean retirement from taxes!`
    },
    unemployed: {
        requiredQuestions: ['unemployment_income'],
        optionalQuestions: ['insight_frequency'],
        skipQuestions: ['business_stage', 'capital_source', 'account_setup', 'employer_tax'],
        completionMessage: `💪 Welcome! Even while job hunting, I'll help track any income you might have. When you land that job, I'll be ready to help with tax planning!`
    },
    individual: {
        requiredQuestions: ['employer_tax'],
        optionalQuestions: ['part_time_income', 'insight_frequency'],
        skipQuestions: ['business_stage', 'capital_source'],
        completionMessage: `✅ Great! As an employee, your employer handles most of your tax through PAYE. I'll help you check if it's being done correctly and optimize your tax position!`
    },
    self_employed: {
        requiredQuestions: ['account_setup', 'business_registration'],
        optionalQuestions: ['business_stage', 'insight_frequency'],
        skipQuestions: ['capital_source', 'employer_tax'],
        completionMessage: `🚀 Welcome, hustler! As a self-employed professional, you'll need to file taxes yourself. I'll help you track income, expenses, and stay compliant!`
    },
    business: {
        requiredQuestions: ['business_stage', 'business_registration', 'account_setup', 'capital_source'],
        optionalQuestions: ['insight_frequency'],
        skipQuestions: ['employer_tax', 'part_time_income'],
        completionMessage: `🏢 Welcome, business owner! I'll help you navigate VAT, Company Income Tax, and all the compliance requirements. Let's grow your business tax-smart!`
    }
};

/**
 * Get the next question to ask based on profile and completed questions
 */
export function getNextQuestion(
    profile: ExtractedProfile,
    completedQuestions: string[]
): AdaptiveQuestion | null {
    const flowConfig = FLOW_CONFIGS[profile.entityType] || FLOW_CONFIGS.individual;

    // First, check required questions
    for (const questionId of flowConfig.requiredQuestions) {
        if (!completedQuestions.includes(questionId)) {
            return ONBOARDING_QUESTIONS[questionId] || null;
        }
    }

    // Then optional questions (but only first one for now to keep it short)
    for (const questionId of flowConfig.optionalQuestions) {
        if (!completedQuestions.includes(questionId)) {
            return ONBOARDING_QUESTIONS[questionId] || null;
        }
    }

    // All questions answered
    return null;
}

/**
 * Check if a question should be skipped for this user type
 */
export function shouldSkipQuestion(
    questionId: string,
    profile: ExtractedProfile
): boolean {
    const flowConfig = FLOW_CONFIGS[profile.entityType] || FLOW_CONFIGS.individual;
    return flowConfig.skipQuestions.includes(questionId);
}

/**
 * Get completion message for user type
 */
export function getCompletionMessage(profile: ExtractedProfile): string {
    const flowConfig = FLOW_CONFIGS[profile.entityType] || FLOW_CONFIGS.individual;
    return flowConfig.completionMessage;
}

/**
 * Format question for display using PRISM personality
 */
export function formatQuestion(question: AdaptiveQuestion): string {
    return PersonalityFormatter.onboardingQuestion(
        question.question,
        question.options.map((opt, i) => `${i + 1}. ${opt}`),
        question.hint
    );
}

/**
 * Get tax guidance based on profile
 */
export function getTaxGuidance(profile: ExtractedProfile): string {
    switch (profile.taxCategory) {
        case 'paye':
            return `Your employer deducts tax through PAYE. I'll help verify this is being done correctly.`;
        case 'self_assessment':
            return `You'll need to file taxes yourself. I'll help you track income, expenses, and filing deadlines.`;
        case 'company_tax':
            return `Your business is subject to Company Income Tax (30%). I'll help with VAT, withholding tax, and compliance.`;
        case 'withholding':
            return `Your income sources have withholding tax deducted at source. I'll help you track and claim credits.`;
        case 'exempt':
            return `Good news - you likely don't have taxable income currently. I'll let you know if that changes!`;
        default:
            return `I'll help you understand your tax obligations as we learn more about your situation.`;
    }
}
