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
 * - Related party name/TIN verification via Mono API
 */

import { monoLookupService } from './mono-lookup.service';
import { supabase } from '../config/supabase';

export interface Transaction {
    id?: string;
    amount: number;
    description: string;
    category?: string;
    isConnectedPerson?: boolean;
    counterpartyName?: string;
    counterpartyTIN?: string;
    date?: string;
    type?: 'income' | 'expense' | 'asset';
    userId?: string;
}

export interface AvoidanceCheck {
    isArtificial: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    warnings: string[];
    recommendation: string;
    actReferences: string[];
    verificationResults?: RelatedPartyVerification[];
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
            warnings.push(...(connectedPersonCheck.warnings || []));
            actReferences.push(...(connectedPersonCheck.actReferences || []));
            riskLevel = this.maxRiskLevel(riskLevel, connectedPersonCheck.riskLevel || 'low');
        }

        // Check 2: Gift vs Income Classification (Section 4(1)(h))
        const giftCheck = this.checkGiftVsIncome(transaction);
        warnings.push(...(giftCheck.warnings || []));
        actReferences.push(...(giftCheck.actReferences || []));
        riskLevel = this.maxRiskLevel(riskLevel, giftCheck.riskLevel || 'low');

        // Check 3: Capital vs Revenue Classification (Section 4(1) & 21)
        const capitalCheck = this.checkCapitalVsRevenue(transaction);
        warnings.push(...(capitalCheck.warnings || []));
        actReferences.push(...(capitalCheck.actReferences || []));
        riskLevel = this.maxRiskLevel(riskLevel, capitalCheck.riskLevel || 'low');

        // Check 4: Round Number Transactions (indicator of artificial pricing)
        const roundNumberCheck = this.checkRoundNumbers(transaction);
        warnings.push(...(roundNumberCheck.warnings || []));
        riskLevel = this.maxRiskLevel(riskLevel, roundNumberCheck.riskLevel || 'low');

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

    /**
     * Verify related party TIN matches claimed name via Mono API
     * Used to detect mismatched or potentially artificial relationships
     */
    async verifyRelatedParty(partyName: string, partyTIN?: string): Promise<RelatedPartyVerification> {
        const result: RelatedPartyVerification = {
            partyName,
            partyTIN,
            verified: false,
            nameMatch: false,
            warnings: []
        };

        if (!partyTIN) {
            result.warnings.push('No TIN provided for related party - verification not possible');
            return result;
        }

        if (!monoLookupService.isConfigured()) {
            result.warnings.push('Identity verification service not configured');
            return result;
        }

        try {
            // Try TIN lookup first
            const tinData = await monoLookupService.lookupTIN(partyTIN, 'tin');
            result.verified = true;
            result.registeredName = tinData.taxpayer_name;
            result.entityType = tinData.tin_type === 'INDIVIDUAL' ? 'individual' : 'company';

            // Calculate name similarity
            const similarity = this.calculateNameSimilarity(partyName, tinData.taxpayer_name);
            result.nameMatchScore = similarity;
            result.nameMatch = similarity >= 0.7;

            if (!result.nameMatch) {
                result.warnings.push(
                    `⚠️ TIN holder name "${tinData.taxpayer_name}" doesn't match claimed name "${partyName}" ` +
                    `(${Math.round(similarity * 100)}% match). This may indicate a misrepresentation.`
                );
            }

        } catch (error: any) {
            console.error('[AntiAvoidance] TIN verification failed:', error);

            if (error.statusCode === 404) {
                result.warnings.push(`🚨 TIN ${partyTIN} not found in tax database - potentially fake`);
            } else {
                result.warnings.push('Unable to verify TIN - service temporarily unavailable');
            }
        }

        return result;
    }

    /**
     * Check transaction counterparty against known related parties
     */
    async checkAgainstRelatedParties(transaction: Transaction): Promise<{
        isRelatedParty: boolean;
        relatedParty?: RelatedPartyMatch;
        verification?: RelatedPartyVerification;
    }> {
        if (!transaction.userId || !transaction.counterpartyName) {
            return { isRelatedParty: false };
        }

        // Query known related parties for this user
        const { data: relatedParties } = await supabase
            .from('related_parties')
            .select('*')
            .eq('user_id', transaction.userId);

        if (!relatedParties || relatedParties.length === 0) {
            return { isRelatedParty: false };
        }

        // Check for name matches
        for (const party of relatedParties) {
            const similarity = this.calculateNameSimilarity(
                transaction.counterpartyName,
                party.party_name
            );

            if (similarity >= 0.7) {
                // Match found - this is a related party transaction
                let verification: RelatedPartyVerification | undefined;

                // Verify TIN if available and not recently verified
                if (party.party_tin && !party.tin_verified) {
                    verification = await this.verifyRelatedParty(party.party_name, party.party_tin);

                    // Update verification status in database
                    if (verification.verified) {
                        await supabase
                            .from('related_parties')
                            .update({
                                tin_verified: verification.nameMatch,
                                verification_date: new Date().toISOString(),
                                verification_data: verification
                            })
                            .eq('id', party.id);
                    }
                }

                return {
                    isRelatedParty: true,
                    relatedParty: {
                        id: party.id,
                        name: party.party_name,
                        relationship: party.relationship_type,
                        tin: party.party_tin,
                        matchScore: similarity
                    },
                    verification
                };
            }
        }

        // Also check against user's own businesses
        const { data: businesses } = await supabase
            .from('businesses')
            .select('name, registration_number')
            .eq('user_id', transaction.userId);

        if (businesses) {
            for (const business of businesses) {
                const similarity = this.calculateNameSimilarity(
                    transaction.counterpartyName,
                    business.name
                );

                if (similarity >= 0.7) {
                    return {
                        isRelatedParty: true,
                        relatedParty: {
                            id: 'self-business',
                            name: business.name,
                            relationship: 'controlled_entity',
                            matchScore: similarity
                        }
                    };
                }
            }
        }

        return { isRelatedParty: false };
    }

    /**
     * Calculate similarity between two names (0-1)
     * Uses Jaro-Winkler for fuzzy matching
     */
    private calculateNameSimilarity(name1: string, name2: string): number {
        const s1 = name1.toLowerCase().trim();
        const s2 = name2.toLowerCase().trim();

        if (s1 === s2) return 1;

        // Simple Jaro similarity
        const len1 = s1.length;
        const len2 = s2.length;
        const matchWindow = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);

        const matches1 = new Array(len1).fill(false);
        const matches2 = new Array(len2).fill(false);
        let matches = 0;
        let transpositions = 0;

        for (let i = 0; i < len1; i++) {
            const start = Math.max(0, i - matchWindow);
            const end = Math.min(i + matchWindow + 1, len2);

            for (let j = start; j < end; j++) {
                if (matches2[j] || s1[i] !== s2[j]) continue;
                matches1[i] = matches2[j] = true;
                matches++;
                break;
            }
        }

        if (matches === 0) return 0;

        let k = 0;
        for (let i = 0; i < len1; i++) {
            if (!matches1[i]) continue;
            while (!matches2[k]) k++;
            if (s1[i] !== s2[k]) transpositions++;
            k++;
        }

        const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

        // Winkler adjustment for common prefix
        let prefix = 0;
        for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
            if (s1[i] === s2[i]) prefix++;
            else break;
        }

        return jaro + prefix * 0.1 * (1 - jaro);
    }
}

// ==================== Type Definitions ====================

export interface RelatedPartyVerification {
    partyName: string;
    partyTIN?: string;
    verified: boolean;
    nameMatch: boolean;
    nameMatchScore?: number;
    registeredName?: string;
    entityType?: 'individual' | 'company';
    warnings: string[];
}

export interface RelatedPartyMatch {
    id: string;
    name: string;
    relationship: string;
    tin?: string | null;
    matchScore: number;
}

export const antiAvoidanceService = new AntiAvoidanceService();
