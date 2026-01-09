import { supabase } from '../config/database';

interface MonoTransaction {
    id: string;
    amount: number;
    type: 'debit' | 'credit';
    narration: string;
    date: string;
    balance: number;
    category?: string;
}

interface CategorizedCharge {
    id: string;
    amount: number;
    category: 'sms_alert' | 'card_maintenance' | 'cot' | 'atm_fee' | 'transfer_fee' | 'other';
    description: string;
    isDeductible: boolean;
    vatAmount: number;
    baseAmount: number;
    confidence: number;
    metadata?: {
        overcharge?: boolean;
        overchargeAmount?: number;
        maxAllowed?: number;
        warning?: string;
        isOnUs?: boolean;
    };
}

interface ATMRuleLimits {
    maxFeePerUnit: number;
    unitAmount: number;
    onUsExempt: boolean;
}

interface ATMValidationResult {
    isValid: boolean;
    maxAllowed: number;
    overcharge?: number;
    message?: string;
}

/**
 * Bank Charge Categorizer Service
 * 
 * Implements Tax Act 2025, Section 21:
 * - Bank charges deductible if "wholly and exclusively" for business
 * - VAT extraction from bank fees (7.5%)
 * 
 * Also implements CBN ATM Fee Circular (Effective March 1, 2026):
 * - On-Us transactions: Free
 * - Remote On-Us: ₦35 per ₦10,000 unit
 * - Off-premises: Fee limits per withdrawal tier
 * 
 * Purpose: Automatically categorize, validate ATM fees, and extract VAT from bank charges
 */
export class BankChargeCategorizer {

    // VAT rate (7.5%)
    private readonly VAT_RATE = 0.075;

    // Cache for ATM rules (5 minute TTL)
    private atmRulesCache: { rules: ATMRuleLimits | null; fetchedAt: number } | null = null;
    private readonly CACHE_TTL_MS = 5 * 60 * 1000;

    /**
     * Fetch ATM fee rules from compliance_rules / active_tax_rules
     * Falls back to CBN defaults if no rules found
     */
    async getATMRules(): Promise<ATMRuleLimits> {
        // Check cache
        if (this.atmRulesCache && Date.now() - this.atmRulesCache.fetchedAt < this.CACHE_TTL_MS) {
            return this.atmRulesCache.rules || this.getDefaultATMRules();
        }

        try {
            // Query active ATM-related rules
            const { data: rules } = await supabase
                .from('compliance_rules')
                .select('rule_name, rule_type, actions, parameters, conditions')
                .eq('is_active', true)
                .or('rule_name.ilike.%ATM%,rule_name.ilike.%atm%');

            if (!rules || rules.length === 0) {
                console.log('[Bank Charge Categorizer] No active ATM rules found, using defaults');
                this.atmRulesCache = { rules: null, fetchedAt: Date.now() };
                return this.getDefaultATMRules();
            }

            // Extract fee limits from rules
            // Look for threshold_check rules with fee limits
            const feeRule = rules.find(r => 
                r.rule_type === 'threshold_check' || 
                r.rule_type === 'threshold' ||
                r.actions?.max_fee !== undefined ||
                r.actions?.fee_per_unit !== undefined
            );

            if (feeRule) {
                const limits: ATMRuleLimits = {
                    maxFeePerUnit: feeRule.actions?.max_fee || feeRule.actions?.fee_per_unit || 100,
                    unitAmount: feeRule.conditions?.per_unit || feeRule.conditions?.withdrawal_unit || 20000,
                    onUsExempt: feeRule.actions?.on_us_exempt !== false
                };
                this.atmRulesCache = { rules: limits, fetchedAt: Date.now() };
                console.log('[Bank Charge Categorizer] Loaded ATM rules:', limits);
                return limits;
            }

            this.atmRulesCache = { rules: null, fetchedAt: Date.now() };
            return this.getDefaultATMRules();
        } catch (error) {
            console.error('[Bank Charge Categorizer] Error fetching ATM rules:', error);
            return this.getDefaultATMRules();
        }
    }

    /**
     * Default ATM fee limits per CBN circular (pre-2026-03-01 era)
     */
    private getDefaultATMRules(): ATMRuleLimits {
        return {
            maxFeePerUnit: 100, // ₦100 per ₦20,000
            unitAmount: 20000,
            onUsExempt: true
        };
    }

    /**
     * Validate ATM fee against CBN limits
     */
    async validateATMFee(
        feeAmount: number, 
        withdrawalAmount: number, 
        isOnUs: boolean
    ): Promise<ATMValidationResult> {
        const rules = await this.getATMRules();

        // On-Us (same bank ATM) should be free
        if (isOnUs && rules.onUsExempt) {
            return {
                isValid: feeAmount === 0,
                maxAllowed: 0,
                overcharge: feeAmount > 0 ? feeAmount : undefined,
                message: feeAmount > 0 ? 'On-Us ATM transactions should be free per CBN circular' : undefined
            };
        }

        // Calculate max allowed fee based on withdrawal amount
        const units = Math.ceil(withdrawalAmount / rules.unitAmount);
        const maxAllowed = units * rules.maxFeePerUnit;

        if (feeAmount > maxAllowed) {
            return {
                isValid: false,
                maxAllowed,
                overcharge: feeAmount - maxAllowed,
                message: `ATM fee of ₦${feeAmount} exceeds CBN limit of ₦${maxAllowed} for ₦${withdrawalAmount} withdrawal`
            };
        }

        return {
            isValid: true,
            maxAllowed
        };
    }

    /**
     * Categorize bank charges from transactions
     */
    async categorizeCharges(transactions: MonoTransaction[], userId: string): Promise<CategorizedCharge[]> {
        const charges: CategorizedCharge[] = [];

        console.log(`[Bank Charge Categorizer] Analyzing ${transactions.length} transactions`);

        for (const txn of transactions) {
            // Only process debits
            if (txn.type !== 'debit') continue;

            // Skip ₦50 charges (handled by EMTL detector)
            if (Math.abs(txn.amount) === 50) continue;

            // Check if it's a bank charge
            const chargeType = this.identifyChargeType(txn.narration);

            if (chargeType) {
                const { baseAmount, vatAmount } = this.extractVAT(Math.abs(txn.amount));
                const feeAmount = Math.abs(txn.amount);

                let metadata: CategorizedCharge['metadata'] = undefined;

                // For ATM fees, validate against CBN limits
                if (chargeType.category === 'atm_fee') {
                    const isOnUs = this.detectOnUsTransaction(txn.narration);
                    // Try to extract withdrawal amount from narration
                    const withdrawalAmount = this.extractWithdrawalAmount(txn.narration) || 20000;
                    
                    const validation = await this.validateATMFee(feeAmount, withdrawalAmount, isOnUs);
                    
                    if (!validation.isValid && validation.overcharge) {
                        metadata = {
                            overcharge: true,
                            overchargeAmount: validation.overcharge,
                            maxAllowed: validation.maxAllowed,
                            warning: validation.message,
                            isOnUs
                        };
                        console.log(`[Bank Charge Categorizer] ATM overcharge detected: ${validation.message}`);
                    } else if (isOnUs) {
                        metadata = { isOnUs: true };
                    }
                }

                charges.push({
                    id: txn.id,
                    amount: feeAmount,
                    category: chargeType.category,
                    description: chargeType.description,
                    isDeductible: chargeType.isDeductible,
                    vatAmount,
                    baseAmount,
                    confidence: chargeType.confidence,
                    metadata
                });
            }
        }

        console.log(`[Bank Charge Categorizer] Found ${charges.length} bank charges`);
        console.log(`  - Total VAT: ₦${charges.reduce((sum, c) => sum + c.vatAmount, 0).toFixed(2)}`);
        
        const overcharges = charges.filter(c => c.metadata?.overcharge);
        if (overcharges.length > 0) {
            const totalOvercharge = overcharges.reduce((sum, c) => sum + (c.metadata?.overchargeAmount || 0), 0);
            console.log(`  - ATM Overcharges: ${overcharges.length} transactions, ₦${totalOvercharge.toFixed(2)} total`);
        }

        return charges;
    }

    /**
     * Detect if transaction is On-Us (same bank ATM)
     */
    private detectOnUsTransaction(narration: string): boolean {
        const lowerNarration = narration.toLowerCase();
        // Common patterns for on-us transactions
        return lowerNarration.includes('on-us') || 
               lowerNarration.includes('on us') ||
               lowerNarration.includes('same bank') ||
               lowerNarration.includes('own atm');
    }

    /**
     * Extract withdrawal amount from narration
     */
    private extractWithdrawalAmount(narration: string): number | null {
        // Pattern: look for amounts like "20,000" or "20000" or "₦20,000"
        const match = narration.match(/₦?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
        if (match) {
            const amount = parseFloat(match[1].replace(/,/g, ''));
            // Only return if it looks like a reasonable withdrawal amount (not a fee)
            if (amount >= 1000) {
                return amount;
            }
        }
        return null;
    }

    /**
     * Identify the type of bank charge from narration
     */
    private identifyChargeType(narration: string): {
        category: CategorizedCharge['category'];
        description: string;
        isDeductible: boolean;
        confidence: number;
    } | null {
        const lowerNarration = narration.toLowerCase();

        // SMS Alert charges
        if (this.matchesKeywords(lowerNarration, ['sms', 'alert', 'notification'])) {
            return {
                category: 'sms_alert',
                description: 'SMS Alert Fee',
                isDeductible: true,
                confidence: 0.95
            };
        }

        // Card maintenance
        if (this.matchesKeywords(lowerNarration, ['card', 'maintenance', 'annual fee', 'card fee'])) {
            return {
                category: 'card_maintenance',
                description: 'Card Maintenance Fee',
                isDeductible: true,
                confidence: 0.9
            };
        }

        // Commission on Turnover (CoT)
        if (this.matchesKeywords(lowerNarration, ['cot', 'commission', 'turnover'])) {
            return {
                category: 'cot',
                description: 'Commission on Turnover',
                isDeductible: true,
                confidence: 0.95
            };
        }

        // ATM withdrawal fees
        if (this.matchesKeywords(lowerNarration, ['atm', 'withdrawal fee', 'cash withdrawal'])) {
            return {
                category: 'atm_fee',
                description: 'ATM Withdrawal Fee',
                isDeductible: true,
                confidence: 0.9
            };
        }

        // Transfer fees
        if (this.matchesKeywords(lowerNarration, ['transfer fee', 'transaction fee', 'processing fee'])) {
            return {
                category: 'transfer_fee',
                description: 'Transfer Fee',
                isDeductible: true,
                confidence: 0.85
            };
        }

        // Generic bank charge (lower confidence)
        if (this.matchesKeywords(lowerNarration, ['charge', 'fee', 'debit'])) {
            return {
                category: 'other',
                description: 'Other Bank Charge',
                isDeductible: true,
                confidence: 0.6
            };
        }

        return null;
    }

    /**
     * Check if narration matches any of the keywords
     */
    private matchesKeywords(narration: string, keywords: string[]): boolean {
        return keywords.some(keyword => narration.includes(keyword));
    }

    /**
     * Extract VAT from total amount
     * Assumes VAT-inclusive pricing: Total = Base + (Base × 0.075)
     */
    private extractVAT(totalAmount: number): { baseAmount: number; vatAmount: number } {
        // Formula: Base = Total / (1 + VAT_RATE)
        const baseAmount = totalAmount / (1 + this.VAT_RATE);
        const vatAmount = totalAmount - baseAmount;

        return {
            baseAmount: Math.round(baseAmount * 100) / 100,
            vatAmount: Math.round(vatAmount * 100) / 100
        };
    }

    /**
     * Save categorized charges to database
     */
    async saveCharges(userId: string, charges: CategorizedCharge[]): Promise<void> {
        if (charges.length === 0) {
            console.log('[Bank Charge Categorizer] No charges to save');
            return;
        }

        const records = charges.map(charge => ({
            user_id: userId,
            transaction_id: charge.id,
            amount: charge.amount,
            category: charge.category,
            description: charge.description,
            is_deductible: charge.isDeductible,
            vat_amount: charge.vatAmount,
            base_amount: charge.baseAmount,
            confidence: charge.confidence,
            detected_at: new Date().toISOString()
        }));

        const { error } = await supabase
            .from('bank_charges')
            .upsert(records, { onConflict: 'transaction_id' });

        if (error) {
            console.error('[Bank Charge Categorizer] Error saving charges:', error);
            throw error;
        }

        console.log(`[Bank Charge Categorizer] Saved ${charges.length} bank charges to database`);
    }

    /**
     * Generate monthly summary of bank charges
     */
    generateMonthlySummary(charges: CategorizedCharge[]): string {
        if (charges.length === 0) {
            return '✅ No bank charges detected this month.';
        }

        const totalCharges = charges.reduce((sum, c) => sum + c.amount, 0);
        const totalVAT = charges.reduce((sum, c) => sum + c.vatAmount, 0);
        const deductibleCharges = charges.filter(c => c.isDeductible);
        const totalDeductible = deductibleCharges.reduce((sum, c) => sum + c.amount, 0);

        // Group by category
        const byCategory = charges.reduce((acc, charge) => {
            if (!acc[charge.category]) {
                acc[charge.category] = { count: 0, total: 0, vat: 0 };
            }
            acc[charge.category].count++;
            acc[charge.category].total += charge.amount;
            acc[charge.category].vat += charge.vatAmount;
            return acc;
        }, {} as Record<string, { count: number; total: number; vat: number }>);

        let summary = `📊 *Bank Charges Summary*\n\n`;
        summary += `Total Charges: ₦${totalCharges.toFixed(2)}\n`;
        summary += `Input VAT (claimable): ₦${totalVAT.toFixed(2)}\n`;
        summary += `Deductible Expenses: ₦${totalDeductible.toFixed(2)}\n\n`;

        summary += `*Breakdown by Category:*\n`;

        for (const [category, data] of Object.entries(byCategory)) {
            const categoryName = this.getCategoryDisplayName(category as CategorizedCharge['category']);
            summary += `• ${categoryName}: ${data.count}× = ₦${data.total.toFixed(2)}\n`;
            summary += `  └─ VAT: ₦${data.vat.toFixed(2)}\n`;
        }

        summary += `\n💡 *Tax Savings*:\n`;
        summary += `You can claim ₦${totalVAT.toFixed(2)} as Input VAT credit!\n`;
        summary += `This reduces your VAT liability for the month.`;

        return summary;
    }

    /**
     * Get display name for category
     */
    private getCategoryDisplayName(category: CategorizedCharge['category']): string {
        const names: Record<CategorizedCharge['category'], string> = {
            sms_alert: 'SMS Alerts',
            card_maintenance: 'Card Maintenance',
            cot: 'Commission on Turnover',
            atm_fee: 'ATM Fees',
            transfer_fee: 'Transfer Fees',
            other: 'Other Charges'
        };

        return names[category] || category;
    }

    /**
     * Check for upstream petroleum operations (Section 69c)
     * Bank charges NOT deductible for Hydrocarbon Tax
     */
    async checkPetroleumExclusion(userId: string): Promise<boolean> {
        // Check if user is in upstream petroleum operations
        const { data: user } = await supabase
            .from('users')
            .select('business_sector, tax_regime')
            .eq('id', userId)
            .single();

        if (!user) return false;

        // Check if user is subject to Hydrocarbon Tax
        const isPetroleumUpstream =
            user.business_sector === 'petroleum_upstream' ||
            user.tax_regime === 'hydrocarbon_tax';

        if (isPetroleumUpstream) {
            console.warn(`[Bank Charge Categorizer] User ${userId} is in petroleum upstream - bank charges NOT deductible for Hydrocarbon Tax (Section 69c)`);
        }

        return isPetroleumUpstream;
    }
}

export const bankChargeCategorizer = new BankChargeCategorizer();
