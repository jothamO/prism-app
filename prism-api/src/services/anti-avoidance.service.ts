/**
 * Anti-Avoidance Service
 * Tax Act 2025 - Section 191 (Artificial Transactions) & Section 192 (Transfer Pricing)
 * 
 * Detects and warns about potentially artificial or non-arm's length transactions:
 * - Artificial/fictitious transactions
 * - Gift vs income misclassification  
 * - Capital vs revenue misclassification
 * - Connected person transactions at non-market rates
 * - Transfer pricing violations
 */

export interface Transaction {
    id?: string;
    amount: number;
    description: string;
    category?: string;
    isConnectedPerson?: boolean;
    counterpartyName?: string;
    date?: string;
    type?: 'income' | 'expense' | 'asset';
}

export interface AvoidanceCheck {
    isArtificial: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    warnings: string[];
    recommendation: string;
    actReferences: string[];
}

export class AntiAvoidanceService {
    /**
     * Check transaction for tax avoidance red flags (Section 191)
     */
    async checkTransaction(transaction: Transaction): Promise<AvoidanceCheck> {
        const warnings: string[] = [];
        const actReferences: string[] = [];
        let riskLevel: 'low' | 'medium' | 'high' = 'low';

        // Check 1: Connected Person Transactions (Section 191 & 192)
        if (transaction.isConnectedPerson) {
            const connectedPersonCheck = this.checkConnectedPerson(transaction);
            warnings.push(...connectedPersonCheck.warnings);
            actReferences.push(...connectedPersonCheck.actReferences);
            riskLevel = this.maxRiskLevel(riskLevel, connectedPersonCheck.riskLevel);
        }

        // Check 2: Gift vs Income Classification (Section 4(1)(h))
        const giftCheck = this.checkGiftVsIncome(transaction);
        warnings.push(...giftCheck.warnings);
        actReferences.push(...giftCheck.actReferences);
        riskLevel = this.maxRiskLevel(riskLevel, giftCheck.riskLevel);

        // Check 3: Capital vs Revenue Classification (Section 4(1) & 21)
        const capitalCheck = this.checkCapitalVsRevenue(transaction);
        warnings.push(...capitalCheck.warnings);
        actReferences.push(...capitalCheck.actReferences);
        riskLevel = this.maxRiskLevel(riskLevel, capitalCheck.riskLevel);

        // Check 4: Round Number Transactions (indicator of artificial pricing)
        const roundNumberCheck = this.checkRoundNumbers(transaction);
        warnings.push(...roundNumberCheck.warnings);
        riskLevel = this.maxRiskLevel(riskLevel, roundNumberCheck.riskLevel);

        return {
            isArtificial: riskLevel === 'high',
            riskLevel,
            warnings: warnings.filter(Boolean),
            recommendation: this.getRecommendation(riskLevel, warnings),
            actReferences: [...new Set(actReferences)]
        };
    }

    /**
     * Check connected person transactions (Section 191 & 192)
     * Presumed artificial unless at arm's length
     */
    private checkConnectedPerson(transaction: Transaction): Partial<AvoidanceCheck> {
        const warnings: string[] = [];
        const actReferences: string[] = ['Section 191', 'Section 192'];
        let riskLevel: 'low' | 'medium' | 'high' = 'medium';

        // Estimate market value (simplified - in production, use market data)
        const estimatedMarketValue = this.estimateMarketValue(transaction);

        if (estimatedMarketValue === null) {
            warnings.push(
                `⚠️ Transaction with connected person (${transaction.counterpartyName}). ` +
                `Ensure pricing is at arm's length to avoid Section 191 adjustments.`
            );
            return { warnings, actReferences, riskLevel: 'medium' };
        }

        const variance = Math.abs(transaction.amount - estimatedMarketValue) / estimatedMarketValue;

        if (variance > 0.30) {
            // >30% deviation = high risk
            warnings.push(
                `🚨 CRITICAL: Transaction with connected person is ${(variance * 100).toFixed(0)}% ` +
                `${transaction.amount > estimatedMarketValue ? 'above' : 'below'} market value ` +
                `(₦${estimatedMarketValue.toLocaleString()}). ` +
                `FIRS may disregard this transaction (Section 191) or adjust pricing (Section 192).`
            );
            riskLevel = 'high';
        } else if (variance > 0.15) {
            // 15-30% deviation = medium risk
            warnings.push(
                `⚠️ Transaction with connected person deviates from market value by ${(variance * 100).toFixed(0)}%. ` +
                `Ensure you have documentation proving arm's length pricing (Section 192).`
            );
            riskLevel = 'medium';
        } else {
            // <15% deviation = acceptable
            riskLevel = 'low';
        }

        return { warnings, actReferences, riskLevel };
    }

    /**
     * Check gift vs income classification (Section 4(1)(h))
     * "Gifts" from trade/business are taxable income
     */
    private checkGiftVsIncome(transaction: Transaction): Partial<AvoidanceCheck> {
        const warnings: string[] = [];
        const actReferences: string[] = [];
        const description = transaction.description.toLowerCase();

        // Check for "gift" labeling
        const giftKeywords = ['gift', 'donation', 'grant', 'award', 'prize', 'bonus'];
        const isLabeledAsGift = giftKeywords.some(kw => description.includes(kw));

        if (isLabeledAsGift) {
            // Check if it's from a trade/business relationship
            const businessKeywords = [
                'customer', 'client', 'supplier', 'vendor', 'contractor',
                'service', 'sales', 'commission', 'profit', 'revenue'
            ];
            const looksLikeBusiness = businessKeywords.some(kw => description.includes(kw));

            if (looksLikeBusiness || transaction.amount > 1_000_000) {
                warnings.push(
                    `⚠️ You've labeled this as a "${description.match(/gift|donation|grant|award|prize/)?.[0]}". ` +
                    `If this payment arises from trade/business, it's taxable income per Section 4(1)(h). ` +
                    `"Substance over form" - FIRS looks at the reality, not the label.`
                );
                actReferences.push('Section 4(1)(h)');
                return { warnings, actReferences, riskLevel: 'medium' };
            }
        }

        return { warnings, actReferences, riskLevel: 'low' };
    }

    /**
     * Check capital vs revenue classification (Sections 4(1), 20, 21)
     * Capital receipts are not taxable, but FIRS may reclassify if they arise from trade
     */
    private checkCapitalVsRevenue(transaction: Transaction): Partial<AvoidanceCheck> {
        const warnings: string[] = [];
        const actReferences: string[] = [];
        const description = transaction.description.toLowerCase();

        // Check if categorized as "capital" but looks like revenue
        if (transaction.category === 'capital' || description.includes('capital')) {
            const revenueIndicators = [
                'sale', 'sales', 'revenue', 'income', 'service fee', 'consulting',
                'commission', 'royalty', 'rent', 'interest', 'dividend'
            ];

            const looksLikeRevenue = revenueIndicators.some(kw => description.includes(kw));

            if (looksLikeRevenue) {
                warnings.push(
                    `⚠️ This is classified as "capital" but appears to be revenue-generating. ` +
                    `FIRS may reclassify receipts from trade/business as taxable income (Section 4(1)). ` +
                    `Capital treatment is for asset disposals, not trading receipts.`
                );
                actReferences.push('Section 4(1)', 'Section 20');
                return { warnings, actReferences, riskLevel: 'medium' };
            }
        }

        // Check if categorized as "revenue" but looks like capital
        if (transaction.category === 'revenue' || transaction.type === 'income') {
            const capitalIndicators = [
                'sale of asset', 'disposal', 'liquidation', 'wind up', 'compensation',
                'insurance claim', 'asset sale'
            ];

            const looksLikeCapital = capitalIndicators.some(kw => description.includes(kw));

            if (looksLikeCapital) {
                warnings.push(
                    `💡 This may qualify as a capital receipt (not taxable), not revenue. ` +
                    `If it's from asset disposal rather than trading, consider reclassifying.`
                );
                actReferences.push('Section 4(1)');
                return { warnings, actReferences, riskLevel: 'low' };
            }
        }

        return { warnings, actReferences, riskLevel: 'low' };
    }

    /**
     * Check for suspiciously round numbers (may indicate artificial pricing)
     */
    private checkRoundNumbers(transaction: Transaction): Partial<AvoidanceCheck> {
        const warnings: string[] = [];
        const riskLevel: 'low' | 'medium' | 'high' = 'low';

        // Check if amount is a very round number (millions, hundreds of thousands)
        const isVeryRound =
            transaction.amount % 1_000_000 === 0 ||
            transaction.amount % 500_000 === 0;

        const isLargeAmount = transaction.amount > 10_000_000;

        if (isVeryRound && isLargeAmount && transaction.isConnectedPerson) {
            warnings.push(
                `💡 Amount is a very round number (₦${transaction.amount.toLocaleString()}). ` +
                `For connected person transactions, consider documenting how this specific amount was determined.`
            );
        }

        return { warnings, riskLevel };
    }

    /**
     * Estimate market value (simplified - in production, use external APIs/databases)
     */
    private estimateMarketValue(transaction: Transaction): number | null {
        // In production, this would:
        // 1. Query market data APIs
        // 2. Check comparable transactions database
        // 3. Apply industry-standard pricing models

        // For now, return null to indicate "unable to estimate"
        // This triggers a warning to document arm's length pricing
        return null;
    }

    /**
     * Get recommendation based on risk level
     */
    private getRecommendation(riskLevel: string, warnings: string[]): string {
        switch (riskLevel) {
            case 'high':
                return '🚨 CRITICAL: This transaction has high tax avoidance risk. ' +
                    'FIRS may disregard or adjust this transaction. ' +
                    'Consider revising to arm\'s length terms or consult a tax professional immediately.';
            case 'medium':
                return '⚠️ CAUTION: Ensure you have documentation proving this is a legitimate transaction ' +
                    'at market rates. Keep contracts, invoices, and market research to defend against FIRS adjustments.';
            default:
                return warnings.length > 0
                    ? '💡 Minor concerns detected. Review the warnings and ensure proper documentation.'
                    : '✅ No avoidance concerns detected.';
        }
    }

    /**
     * Helper: Get maximum risk level
     */
    private maxRiskLevel(a: 'low' | 'medium' | 'high', b: 'low' | 'medium' | 'high'): 'low' | 'medium' | 'high' {
        const levels = { low: 0, medium: 1, high: 2 };
        return levels[a] > levels[b] ? a : b;
    }

    /**
     * Batch check multiple transactions
     */
    async checkBatch(transactions: Transaction[]): Promise<{
        totalChecked: number;
        highRisk: number;
        mediumRisk: number;
        lowRisk: number;
        flaggedTransactions: Array<Transaction & { check: AvoidanceCheck }>;
    }> {
        const results = {
            totalChecked: transactions.length,
            highRisk: 0,
            mediumRisk: 0,
            lowRisk: 0,
            flaggedTransactions: [] as Array<Transaction & { check: AvoidanceCheck }>
        };

        for (const transaction of transactions) {
            const check = await this.checkTransaction(transaction);

            if (check.riskLevel === 'high') results.highRisk++;
            else if (check.riskLevel === 'medium') results.mediumRisk++;
            else results.lowRisk++;

            if (check.riskLevel !== 'low') {
                results.flaggedTransactions.push({ ...transaction, check });
            }
        }

        return results;
    }
}

export const antiAvoidanceService = new AntiAvoidanceService();
