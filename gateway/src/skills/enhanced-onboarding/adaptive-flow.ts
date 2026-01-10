/**
 * Adaptive Flow
 * Smart question sequencing based on user profile
 */

import { ExtractedProfile, TaxCategory } from './profile-extractor';

export interface OnboardingQuestion {
    id: string;
    text: string;
    options?: string[];
    optionLabels?: string[];
    condition?: (profile: ExtractedProfile) => boolean;
    isRequired?: boolean;
}

const QUESTIONS: OnboardingQuestion[] = [
    {
        id: 'entity_type',
        text: "What best describes you?",
        options: ['employed', 'business', 'freelance', 'student', 'retired', 'corper'],
        optionLabels: [
            "Employed (I earn a salary)",
            "Business Owner",
            "Freelancer / Self-Employed",
            "Student",
            "Retired",
            "NYSC Corp Member"
        ],
        isRequired: true
    },
    {
        id: 'business_stage',
        text: "What stage is your business at?",
        options: ['pre_revenue', 'early', 'growing', 'established'],
        optionLabels: [
            "Pre-revenue (still building)",
            "Early stage (first customers)",
            "Growing (scaling up)",
            "Established (stable revenue)"
        ],
        condition: (p) => p.entityType === 'business' || p.attributes?.hasBusinessIncome === true
    },
    {
        id: 'account_setup',
        text: "How do you manage your accounts?",
        options: ['mixed', 'separate', 'multiple'],
        optionLabels: [
            "Mixed (personal & business in one)",
            "Separate (dedicated business account)",
            "Multiple (several accounts)"
        ],
        condition: (p) => p.entityType === 'business' || p.entityType === 'self_employed'
    },
    {
        id: 'registered_business',
        text: "Is your business registered with CAC?",
        options: ['yes', 'no', 'in_progress'],
        optionLabels: ["Yes", "No", "In progress"],
        condition: (p) => p.entityType === 'business'
    },
    {
        id: 'income_range',
        text: "What's your approximate annual income?",
        options: ['below_800k', '800k_to_3m', '3m_to_12m', '12m_to_25m', 'above_25m'],
        optionLabels: [
            "Below ₦800,000 (tax-free!)",
            "₦800,000 - ₦3,000,000",
            "₦3,000,000 - ₦12,000,000",
            "₦12,000,000 - ₦25,000,000",
            "Above ₦25,000,000"
        ],
        condition: (p) => p.entityType !== 'student' && p.entityType !== 'corper'
    },
    {
        id: 'has_other_income',
        text: "Do you have any other income sources? (rental, investments, side business)",
        options: ['yes', 'no'],
        optionLabels: ["Yes", "No"],
        condition: (p) => p.entityType === 'individual' || p.entityType === 'retiree'
    }
];

/**
 * Get the next question based on current progress
 */
export function getNextQuestion(
    profile: ExtractedProfile,
    answeredQuestions: string[]
): OnboardingQuestion | null {
    for (const question of QUESTIONS) {
        // Skip if already answered
        if (answeredQuestions.includes(question.id)) continue;
        
        // Skip if condition not met
        if (question.condition && !question.condition(profile)) continue;
        
        return question;
    }
    return null;
}

/**
 * Format question with personality and options
 */
export function formatQuestion(question: OnboardingQuestion, aiMode?: boolean): string {
    let formatted = question.text;
    
    if (question.optionLabels) {
        formatted += '\n\n' + question.optionLabels
            .map((opt: string, i: number) => `${i + 1}. ${opt}`)
            .join('\n');
    } else if (question.options) {
        formatted += '\n\n' + question.options
            .map((opt: string, i: number) => `${i + 1}. ${opt.charAt(0).toUpperCase() + opt.slice(1)}`)
            .join('\n');
    }
    
    if (aiMode) {
        formatted += '\n\n_You can answer naturally or just type a number._';
    }
    
    return formatted;
}

/**
 * Get completion message based on profile
 */
export function getCompletionMessage(profile: ExtractedProfile): string {
    const messages = [
        `✅ *Profile Complete!*`,
        ``,
        `Based on what you've shared:`,
        `• Tax Category: ${formatTaxCategory(profile.taxCategory)}`,
        profile.attributes?.hasBusinessIncome ? `• Business income: Yes` : '',
        profile.attributes?.hasSalaryIncome ? `• Employment income: Yes` : '',
        profile.attributes?.hasRentalIncome ? `• Rental income: Yes` : '',
        profile.attributes?.hasFreelanceIncome ? `• Freelance income: Yes` : '',
        profile.attributes?.hasPensionIncome ? `• Pension income: Yes` : '',
        ``,
        `I'll use this to give you personalized tax advice! 🎯`
    ];
    
    return messages.filter(m => m !== '').join('\n');
}

/**
 * Get tax guidance based on profile
 */
export function getTaxGuidance(profile: ExtractedProfile): string {
    const categoryGuidance: Record<TaxCategory, string> = {
        'individual_employed': '💼 As an employee, your employer handles PAYE. I can help you track reliefs and identify deductions you might be missing.',
        'individual_self_employed': '💻 As self-employed, you\'ll file annual returns yourself. I\'ll help you track income, expenses, and available reliefs.',
        'individual_mixed': '📊 With both employment and business income, you have more tax planning opportunities. Let\'s make sure you\'re optimizing!',
        'sme': '🏢 For your business, I can help with VAT calculations, expense tracking, and compliance deadlines.',
        'corporate': '🏛️ For corporate entities, I can assist with CIT calculations, VAT, and regulatory filings.',
        'unknown': '🤝 Let me learn more about your situation as we go. Just send me documents or ask questions anytime!'
    };
    
    const entityGuidance: Record<string, string> = {
        'student': '🎓 Great news - focus on your studies! When you start earning, I\'ll be here to help with taxes.',
        'corper': '🇳🇬 Your NYSC allowance is tax-exempt! I\'ll help you track any side income you might earn.',
        'retiree': '🌴 I\'ll help you manage taxes on your pension and any other income sources.'
    };
    
    return entityGuidance[profile.entityType] || categoryGuidance[profile.taxCategory] || categoryGuidance.unknown;
}

/**
 * Check if question should be skipped
 */
export function shouldSkipQuestion(questionId: string, profile: ExtractedProfile): boolean {
    const question = QUESTIONS.find(q => q.id === questionId);
    if (!question || !question.condition) return false;
    return !question.condition(profile);
}

/**
 * Get total questions for progress bar
 */
export function getTotalQuestions(profile: ExtractedProfile): number {
    return QUESTIONS.filter(q => !q.condition || q.condition(profile)).length;
}

/**
 * Get answered questions count
 */
export function getAnsweredCount(answeredQuestions: string[], profile: ExtractedProfile): number {
    const relevantQuestions = QUESTIONS.filter(q => !q.condition || q.condition(profile));
    return relevantQuestions.filter(q => answeredQuestions.includes(q.id)).length;
}

function formatTaxCategory(category: TaxCategory): string {
    const labels: Record<TaxCategory, string> = {
        'individual_employed': 'Employed Individual (PAYE)',
        'individual_self_employed': 'Self-Employed Individual',
        'individual_mixed': 'Mixed Income (Employment + Business)',
        'sme': 'Small/Medium Enterprise',
        'corporate': 'Corporate Entity',
        'unknown': 'To be determined'
    };
    return labels[category];
}
