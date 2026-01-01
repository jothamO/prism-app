import { Project, ProjectExpenseDTO } from './project.service';

export interface ValidationResult {
    isValid: boolean;
    risk: 'low' | 'medium' | 'high';
    warnings: string[];
    actReferences: string[];
}

export interface ArtificialExpenseCheck {
    isArtificial: boolean;
    confidence: number;
    reason: string;
    recommendation: string;
}

export interface PrivateExpenseCheck {
    isPrivate: boolean;
    confidence: number;
    indicators: string[];
    recommendation: string;
}

export interface RapidWithdrawalCheck {
    isHighRisk: boolean;
    totalCashWithdrawals: number;
    withdrawalCount: number;
    daySpan: number;
    reason: string;
    recommendation: string;
    actReference: string;
}

// Categories that are typically legitimate for construction/building projects
const CONSTRUCTION_PROJECT_CATEGORIES = [
    'cement', 'sand', 'gravel', 'blocks', 'rods', 'iron', 'steel',
    'roofing', 'tiles', 'paint', 'electrical', 'wiring', 'plumbing',
    'pipes', 'fittings', 'doors', 'windows', 'glass', 'wood', 'timber',
    'nails', 'screws', 'tools', 'labor', 'workers', 'mason', 'carpenter',
    'welder', 'plumber', 'electrician', 'contractor', 'architect',
    'surveyor', 'engineer', 'transport', 'delivery', 'generator',
    'water', 'site', 'foundation', 'concrete', 'mortar', 'bricks',
    'plastering', 'finishing', 'flooring', 'ceiling', 'gutters'
];

// Categories that are typically private/personal expenses
const PRIVATE_EXPENSE_INDICATORS = [
    'dinner', 'lunch', 'breakfast', 'restaurant', 'hotel', 'drinks',
    'bar', 'club', 'entertainment', 'movie', 'cinema', 'shopping',
    'clothes', 'shoes', 'fashion', 'jewelry', 'perfume', 'cosmetics',
    'salon', 'spa', 'gym', 'subscription', 'netflix', 'spotify',
    'personal', 'family', 'school', 'fees', 'tuition', 'vacation',
    'holiday', 'flight', 'airfare', 'gaming', 'betting', 'lottery'
];

// Categories that could be legitimate if properly documented
const GRAY_AREA_CATEGORIES = [
    'food', 'meals', 'refreshments', 'fuel', 'petrol', 'diesel',
    'phone', 'airtime', 'data', 'uber', 'taxi', 'transport',
    'accommodation', 'lodging', 'miscellaneous'
];

export class ProjectExpenseValidatorService {
    /**
     * Validate if expense is "wholly and exclusively" for the project (Section 20)
     */
    async validateExpenseCategory(
        project: Project,
        expense: ProjectExpenseDTO
    ): Promise<ValidationResult> {
        const description = expense.description.toLowerCase();
        const category = (expense.category || '').toLowerCase();
        const searchTerms = `${description} ${category}`;
        
        const warnings: string[] = [];
        const actReferences: string[] = [];
        let risk: 'low' | 'medium' | 'high' = 'low';
        let isValid = true;

        // Check for private expense indicators
        const privateMatch = PRIVATE_EXPENSE_INDICATORS.find(term => 
            searchTerms.includes(term)
        );

        if (privateMatch) {
            isValid = false;
            risk = 'high';
            warnings.push(`"${privateMatch}" appears to be a private expense, not project-related`);
            actReferences.push('Section 21(c) - Private expenses are not deductible');
            actReferences.push('Section 191 - Artificial transactions may be disregarded');
        }

        // Check for gray area categories
        const grayMatch = GRAY_AREA_CATEGORIES.find(term => 
            searchTerms.includes(term)
        );

        if (grayMatch && !privateMatch) {
            risk = 'medium';
            warnings.push(`"${grayMatch}" may need additional documentation to prove project relevance`);
            actReferences.push('Section 20(1) - Must be wholly and exclusively for the project');
            actReferences.push('Section 32 - Documentary evidence required');
        }

        // Check for construction-related terms
        const constructionMatch = CONSTRUCTION_PROJECT_CATEGORIES.find(term => 
            searchTerms.includes(term)
        );

        if (constructionMatch && !privateMatch) {
            risk = 'low';
            isValid = true;
            // Clear warnings if it's clearly construction-related
            if (risk === 'low') {
                warnings.length = 0;
                actReferences.length = 0;
            }
        }

        // Check for unusually high amounts relative to project budget
        if (expense.amount > project.budget * 0.5) {
            risk = 'high';
            warnings.push('This single expense exceeds 50% of the total project budget');
            actReferences.push('Section 191 - Large transactions may be scrutinized for artificial arrangements');
        }

        // Check for round number patterns (potential red flag for fabricated expenses)
        if (this.isRoundNumber(expense.amount) && expense.amount >= 100000) {
            if (risk === 'low') risk = 'medium';
            warnings.push('Round amount detected - ensure you have proper documentation');
            actReferences.push('Section 32 - Documentary evidence may be requested');
        }

        return {
            isValid,
            risk,
            warnings,
            actReferences
        };
    }

    /**
     * Detect potentially artificial expenses (Section 191)
     */
    async detectArtificialExpense(
        expense: ProjectExpenseDTO,
        project: Project
    ): Promise<ArtificialExpenseCheck> {
        const description = expense.description.toLowerCase();
        
        // Check for private expense masquerading as project expense
        const privateMatch = PRIVATE_EXPENSE_INDICATORS.find(term => 
            description.includes(term)
        );

        if (privateMatch) {
            return {
                isArtificial: true,
                confidence: 0.85,
                reason: `Expense type "${privateMatch}" is typically personal, not project-related`,
                recommendation: 'Remove from project expenses or provide detailed justification with receipt'
            };
        }

        // Check for vague descriptions
        const vagueTerms = ['misc', 'sundry', 'various', 'other', 'general', 'expense'];
        const vagueMatch = vagueTerms.find(term => description.includes(term));

        if (vagueMatch && expense.amount >= 50000) {
            return {
                isArtificial: true,
                confidence: 0.6,
                reason: 'Vague description with significant amount may be flagged for review',
                recommendation: 'Provide specific description of what was purchased'
            };
        }

        // Check for split transactions (multiple similar amounts in succession)
        // This would require looking at recent expenses - simplified here

        return {
            isArtificial: false,
            confidence: 0,
            reason: 'No artificial indicators detected',
            recommendation: 'Ensure you retain receipt for documentation'
        };
    }

    /**
     * Detect private expense misclassification (Section 21(c))
     */
    async detectPrivateExpense(expense: ProjectExpenseDTO): Promise<PrivateExpenseCheck> {
        const description = expense.description.toLowerCase();
        const indicators: string[] = [];
        let confidence = 0;

        // Check for private expense keywords
        for (const term of PRIVATE_EXPENSE_INDICATORS) {
            if (description.includes(term)) {
                indicators.push(term);
                confidence += 0.3;
            }
        }

        // Cap confidence at 1.0
        confidence = Math.min(confidence, 1.0);

        const isPrivate = indicators.length > 0;

        return {
            isPrivate,
            confidence,
            indicators,
            recommendation: isPrivate 
                ? `This expense contains private indicators (${indicators.join(', ')}). It should be classified as personal spending, not project expense.`
                : 'No private expense indicators detected.'
        };
    }

    /**
     * Detect rapid cash withdrawals pattern (Section 191 concern)
     * Flags when > ₦1M in cash/labor expenses within a short period
     */
    async detectRapidCashWithdrawals(
        projectId: string,
        recentExpenses: Array<{ amount: number; description: string; date: string; category?: string }>
    ): Promise<RapidWithdrawalCheck> {
        const cashKeywords = ['labor', 'cash', 'workers', 'wages', 'payment', 'pay'];
        
        // Filter cash-based expenses
        const cashExpenses = recentExpenses.filter(expense => {
            const desc = expense.description.toLowerCase();
            return cashKeywords.some(keyword => desc.includes(keyword));
        });

        if (cashExpenses.length === 0) {
            return {
                isHighRisk: false,
                totalCashWithdrawals: 0,
                withdrawalCount: 0,
                daySpan: 0,
                reason: 'No cash-based expenses detected',
                recommendation: 'Continue with normal expense tracking',
                actReference: ''
            };
        }

        const totalCash = cashExpenses.reduce((sum, exp) => sum + exp.amount, 0);
        
        // Calculate day span
        const dates = cashExpenses.map(e => new Date(e.date).getTime());
        const daySpan = Math.ceil((Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24)) || 1;

        const isHighRisk = totalCash >= 1000000 && daySpan <= 7;

        return {
            isHighRisk,
            totalCashWithdrawals: totalCash,
            withdrawalCount: cashExpenses.length,
            daySpan,
            reason: isHighRisk 
                ? `₦${(totalCash / 1000000).toFixed(1)}M in cash payments over ${daySpan} days exceeds threshold`
                : `Cash payments of ₦${(totalCash / 1000000).toFixed(2)}M within acceptable pattern`,
            recommendation: isHighRisk
                ? 'Retain all receipts and payment records. Consider bank transfers for large payments.'
                : 'Ensure you retain receipts for documentation',
            actReference: isHighRisk 
                ? 'Section 191 - Rapid cash withdrawals may indicate artificial transactions'
                : ''
        };
    }

    /**
     * Generate warning message for WhatsApp response
     */
    generateWarningMessage(validation: ValidationResult): string {
        if (validation.risk === 'low') {
            return '';
        }

        let message = '⚠️ WARNING';
        
        if (validation.risk === 'high') {
            message += ' (Section 191 - Artificial Transactions)\n\n';
        } else {
            message += ' (Section 20 - Documentation Required)\n\n';
        }

        message += validation.warnings.join('\n');
        message += '\n\nReferences:\n';
        message += validation.actReferences.map(ref => `• ${ref}`).join('\n');

        if (validation.risk === 'high') {
            message += '\n\n⚡ This expense may be REJECTED by NRS during an audit.';
        }

        return message;
    }

    /**
     * Check if a number is suspiciously round
     */
    private isRoundNumber(amount: number): boolean {
        // Check if divisible by 10000 (round to 10k)
        if (amount % 10000 === 0) return true;
        // Check if divisible by 5000 (round to 5k)
        if (amount % 5000 === 0 && amount >= 50000) return true;
        return false;
    }
}

export const projectExpenseValidatorService = new ProjectExpenseValidatorService();
