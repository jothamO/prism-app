/**
 * Capital vs Revenue Detector
 * Distinguishes capital injections from revenue for Nigerian startups
 * Critical for proper tax treatment
 */

import { logger } from '../../../utils/logger';
import { supabase } from '../../../config';

export interface CapitalDetectionResult {
    isCapital: boolean;
    confidence: number;
    reason: string;
    capitalType?: 'shareholder' | 'family_support' | 'loan' | 'grant' | 'investment';
}

export class CapitalDetector {
    private readonly CAPITAL_KEYWORDS = [
        'capital',
        'investment',
        'investor',
        'shareholder',
        'equity',
        'share capital',
        'ned',  // Non-Executive Director
        'director loan',
        'seed funding',
        'series a',
        'series b',
        'angel',
        'venture',
        'fundraising'
    ];

    private readonly FAMILY_SUPPORT_KEYWORDS = [
        'mother',
        'father',
        'mum',
        'dad',
        'parent',
        'family',
        'family support',
        'wife',
        'husband',
        'spouse',
        'brother',
        'sister',
        'uncle',
        'aunt',
        'cousin',
        'help',
        'support',
        'gift'
    ];

    private readonly LOAN_KEYWORDS = [
        'loan',
        'borrowing',
        'credit facility',
        'overdraft',
        'advance'
    ];

    /**
     * Detect if transaction is capital injection
     */
    async detect(txn: {
        description: string;
        amount: number;
        date: string;
        userId: string;
        businessId?: string;
    }): Promise<CapitalDetectionResult> {
        const description = txn.description.toLowerCase();

        // 1. Keyword detection (high confidence)
        const keywordResult = this.detectByKeywords(description);
        if (keywordResult.confidence >= 0.85) {
            return keywordResult;
        }

        // 2. Business stage analysis (medium confidence)
        if (txn.businessId) {
            const stageResult = await this.detectByBusinessStage(
                txn.businessId,
                txn.amount,
                txn.date
            );
            if (stageResult.confidence >= 0.75) {
                return stageResult;
            }
        }

        // 3. Amount-based heuristic (low confidence)
        const amountResult = this.detectByAmount(txn.amount, txn.date);

        // Return highest confidence result
        const results = [keywordResult, amountResult];
        return results.reduce((prev, curr) =>
            curr.confidence > prev.confidence ? curr : prev
        );
    }

    /**
     * Detect by keywords in description
     */
    private detectByKeywords(description: string): CapitalDetectionResult {
        // Check capital keywords
        for (const keyword of this.CAPITAL_KEYWORDS) {
            if (description.includes(keyword)) {
                return {
                    isCapital: true,
                    confidence: 0.95,
                    reason: `Contains capital keyword: "${keyword}"`,
                    capitalType: this.determineCapitalType(keyword)
                };
            }
        }

        // Check family support keywords
        for (const keyword of this.FAMILY_SUPPORT_KEYWORDS) {
            if (description.includes(keyword)) {
                return {
                    isCapital: true,
                    confidence: 0.85,
                    reason: `Family support: "${keyword}"`,
                    capitalType: 'family_support'
                };
            }
        }

        // Check loan keywords
        for (const keyword of this.LOAN_KEYWORDS) {
            if (description.includes(keyword)) {
                return {
                    isCapital: true,
                    confidence: 0.90,
                    reason: `Loan/borrowing: "${keyword}"`,
                    capitalType: 'loan'
                };
            }
        }

        return {
            isCapital: false,
            confidence: 0.60,
            reason: 'No capital keywords found'
        };
    }

    /**
     * Detect based on business stage and revenue history
     */
    private async detectByBusinessStage(
        businessId: string,
        amount: number,
        transactionDate: string
    ): Promise<CapitalDetectionResult> {
        try {
            // Get business info
            const { data: business } = await supabase
                .from('businesses')
                .select('business_stage, created_at')
                .eq('id', businessId)
                .single();

            if (!business) {
                return {
                    isCapital: false,
                    confidence: 0.50,
                    reason: 'Business not found'
                };
            }

            // Check if pre-revenue or early stage
            const isPreRevenue = business.business_stage === 'pre_revenue';
            const isEarlyStage = business.business_stage === 'early';

            // Check revenue history before this transaction
            const { data: previousRevenue } = await supabase
                .from('bank_transactions')
                .select('amount')
                .eq('business_id', businessId)
                .eq('classification', 'sale')
                .lt('transaction_date', transactionDate)
                .order('transaction_date', { ascending: false })
                .limit(10);

            const hasSignificantRevenue = previousRevenue &&
                previousRevenue.length >= 5 &&
                previousRevenue.reduce((sum, t) => sum + (t.amount || 0), 0) > 1_000_000;

            // Pre-revenue + large transfer = Likely capital
            if (isPreRevenue && amount >= 500_000 && !hasSignificantRevenue) {
                return {
                    isCapital: true,
                    confidence: 0.80,
                    reason: 'Pre-revenue business + large transfer (₦500K+)',
                    capitalType: 'investment'
                };
            }

            // Early stage + very large transfer = Likely capital
            if (isEarlyStage && amount >= 2_000_000 && !hasSignificantRevenue) {
                return {
                    isCapital: true,
                    confidence: 0.75,
                    reason: 'Early stage business + very large transfer (₦2M+)',
                    capitalType: 'investment'
                };
            }

            return {
                isCapital: false,
                confidence: 0.60,
                reason: 'Business stage does not indicate capital'
            };
        } catch (error) {
            logger.error('[CapitalDetector] Business stage check failed:', error);
            return {
                isCapital: false,
                confidence: 0.50,
                reason: 'Could not verify business stage'
            };
        }
    }

    /**
     * Detect based on amount patterns
     */
    private detectByAmount(amount: number, date: string): CapitalDetectionResult {
        // Very large round numbers often indicate capital
        const isRoundNumber = amount % 1_000_000 === 0; // Multiples of ₦1M
        const isVeryLarge = amount >= 5_000_000; // ₦5M+

        if (isRoundNumber && isVeryLarge) {
            return {
                isCapital: true,
                confidence: 0.65,
                reason: `Large round amount (₦${(amount / 1_000_000).toFixed(1)}M) suggests capital`,
                capitalType: 'investment'
            };
        }

        return {
            isCapital: false,
            confidence: 0.55,
            reason: 'Amount pattern does not indicate capital'
        };
    }

    /**
     * Determine type of capital based on keyword
     */
    private determineCapitalType(keyword: string): CapitalDetectionResult['capitalType'] {
        if (['shareholder', 'equity', 'share capital', 'ned'].includes(keyword)) {
            return 'shareholder';
        }
        if (['loan', 'borrowing', 'credit', 'overdraft'].includes(keyword)) {
            return 'loan';
        }
        if (['investor', 'investment', 'angel', 'venture', 'seed', 'series'].includes(keyword)) {
            return 'investment';
        }
        if (['grant'].includes(keyword)) {
            return 'grant';
        }
        return 'investment'; // Default
    }
}
