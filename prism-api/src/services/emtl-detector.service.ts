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

interface EMTLCharge {
    id: string;
    amount: number;
    linkedTransferId?: string;
    transferAmount?: number;
    status: 'legitimate' | 'exempt_illegal' | 'suspicious';
    category: 'emtl' | 'stamp_duty';
    reason?: string;
    isDeductible: boolean;
    hasVAT: boolean;
}

/**
 * EMTL (Electronic Money Transfer Levy) Auto-Detection Service
 * 
 * Implements Tax Act 2025, Ninth Schedule:
 * - ₦50 charge on electronic transfers ≥ ₦10,000
 * - Exemptions: Salary payments, intra-bank self-transfers, amounts < ₦10K
 * 
 * Purpose: Automatically detect and categorize ₦50 EMTL charges from bank statements
 */
export class EMTLDetectorService {

    /**
     * Detect ₦50 EMTL charges from Mono transactions
     * 
     * Algorithm:
     * 1. Find all ₦50 debits
     * 2. Check if there's a transfer ≥ ₦10K within 5 minutes before
     * 3. Verify exemption status
     * 4. Flag illegal charges (exempt transactions that were charged)
     */
    async detectEMTL(transactions: MonoTransaction[], userId: string): Promise<EMTLCharge[]> {
        const emtlCharges: EMTLCharge[] = [];

        console.log(`[EMTL Detector] Analyzing ${transactions.length} transactions for user ${userId}`);

        for (let i = 0; i < transactions.length; i++) {
            const txn = transactions[i];

            // Check if this is a ₦50 debit (EMTL or Stamp Duty)
            if (Math.abs(txn.amount) === 50 && txn.type === 'debit') {

                // Determine if it's EMTL or Stamp Duty based on narration
                const isEMTL = this.isEMTLCharge(txn.narration);
                const isStampDuty = this.isStampDutyCharge(txn.narration);

                if (!isEMTL && !isStampDuty) {
                    // Unknown ₦50 charge, mark as suspicious
                    emtlCharges.push({
                        id: txn.id,
                        amount: 50,
                        status: 'suspicious',
                        category: 'emtl', // Default assumption
                        reason: 'Unknown ₦50 charge - needs manual review',
                        isDeductible: true, // Assume deductible pending review
                        hasVAT: false
                    });
                    continue;
                }

                // Find the preceding transfer
                const precedingTransfer = this.findPrecedingTransfer(transactions, i);

                if (precedingTransfer && Math.abs(precedingTransfer.amount) >= 10_000) {

                    // Check if transfer should be exempt
                    const exemptionCheck = this.checkExemption(precedingTransfer);

                    if (exemptionCheck.isExempt) {
                        // This charge should NOT have been applied
                        emtlCharges.push({
                            id: txn.id,
                            amount: 50,
                            linkedTransferId: precedingTransfer.id,
                            transferAmount: precedingTransfer.amount,
                            status: 'exempt_illegal',
                            category: isEMTL ? 'emtl' : 'stamp_duty',
                            reason: `Illegal charge: ${exemptionCheck.reason}`,
                            isDeductible: false, // Not deductible because it's illegal
                            hasVAT: false
                        });

                        console.warn(`[EMTL Detector] Illegal charge detected: ${txn.id} - ${exemptionCheck.reason}`);
                    } else {
                        // Legitimate EMTL charge
                        emtlCharges.push({
                            id: txn.id,
                            amount: 50,
                            linkedTransferId: precedingTransfer.id,
                            transferAmount: precedingTransfer.amount,
                            status: 'legitimate',
                            category: isEMTL ? 'emtl' : 'stamp_duty',
                            isDeductible: true, // Business expense
                            hasVAT: false // EMTL is a duty, not subject to VAT
                        });
                    }
                } else {
                    // ₦50 charge without a clear linked transfer
                    emtlCharges.push({
                        id: txn.id,
                        amount: 50,
                        status: 'suspicious',
                        category: isEMTL ? 'emtl' : 'stamp_duty',
                        reason: 'No linked transfer found ≥ ₦10K',
                        isDeductible: true,
                        hasVAT: false
                    });
                }
            }
        }

        console.log(`[EMTL Detector] Found ${emtlCharges.length} EMTL/Stamp Duty charges`);
        console.log(`  - Legitimate: ${emtlCharges.filter(c => c.status === 'legitimate').length}`);
        console.log(`  - Illegal: ${emtlCharges.filter(c => c.status === 'exempt_illegal').length}`);
        console.log(`  - Suspicious: ${emtlCharges.filter(c => c.status === 'suspicious').length}`);

        return emtlCharges;
    }

    /**
     * Check if narration indicates EMTL charge
     */
    private isEMTLCharge(narration: string): boolean {
        const emtlKeywords = [
            'emtl',
            'electronic money transfer levy',
            'e-levy',
            'transfer levy',
            'electronic levy'
        ];

        const lowerNarration = narration.toLowerCase();
        return emtlKeywords.some(keyword => lowerNarration.includes(keyword));
    }

    /**
     * Check if narration indicates Stamp Duty
     */
    private isStampDutyCharge(narration: string): boolean {
        const stampDutyKeywords = [
            'stamp duty',
            'stamp',
            'duty'
        ];

        const lowerNarration = narration.toLowerCase();
        return stampDutyKeywords.some(keyword => lowerNarration.includes(keyword));
    }

    /**
     * Find the transfer transaction that triggered this EMTL charge
     * Looks for transfers within 5 minutes before the EMTL charge
     */
    private findPrecedingTransfer(transactions: MonoTransaction[], currentIndex: number): MonoTransaction | null {
        const currentTxn = transactions[currentIndex];
        const currentDate = new Date(currentTxn.date);

        // Look backwards up to 10 transactions or 5 minutes
        for (let i = currentIndex - 1; i >= Math.max(0, currentIndex - 10); i--) {
            const prevTxn = transactions[i];
            const prevDate = new Date(prevTxn.date);

            // Check if within 5 minutes
            const timeDiff = (currentDate.getTime() - prevDate.getTime()) / 1000 / 60; // minutes

            if (timeDiff > 5) {
                break; // Too far back in time
            }

            // Check if it's a debit (transfer out)
            if (prevTxn.type === 'debit' && Math.abs(prevTxn.amount) >= 10_000) {
                // Exclude if it's also a ₦50 charge
                if (Math.abs(prevTxn.amount) === 50) {
                    continue;
                }

                return prevTxn;
            }
        }

        return null;
    }

    /**
     * Check if a transfer is exempt from EMTL (Section 185, Tax Act 2025)
     */
    private checkExemption(txn: MonoTransaction): { isExempt: boolean; reason?: string } {
        // Exemption 1: Amount < ₦10,000
        if (Math.abs(txn.amount) < 10_000) {
            return { isExempt: true, reason: 'Transfer amount < ₦10,000' };
        }

        // Exemption 2: Salary payment
        const salaryKeywords = [
            'salary',
            'wage',
            'payroll',
            'staff payment',
            'employee',
            'salaries'
        ];

        if (this.containsKeyword(txn.narration, salaryKeywords)) {
            return { isExempt: true, reason: 'Salary payment (Section 185)' };
        }

        // Exemption 3: Intra-bank self-transfer
        if (this.isSelfTransfer(txn)) {
            return { isExempt: true, reason: 'Intra-bank self-transfer (Section 185)' };
        }

        return { isExempt: false };
    }

    /**
     * Check if narration contains any of the keywords
     */
    private containsKeyword(narration: string, keywords: string[]): boolean {
        const lowerNarration = narration.toLowerCase();
        return keywords.some(keyword => lowerNarration.includes(keyword.toLowerCase()));
    }

    /**
     * Check if transaction is a self-transfer
     */
    private isSelfTransfer(txn: MonoTransaction): boolean {
        const selfTransferKeywords = [
            'self transfer',
            'own account',
            'internal transfer',
            'between accounts',
            'same customer'
        ];

        return this.containsKeyword(txn.narration, selfTransferKeywords);
    }

    /**
     * Save detected EMTL charges to database
     */
    async saveEMTLCharges(userId: string, charges: EMTLCharge[]): Promise<void> {
        if (charges.length === 0) {
            console.log('[EMTL Detector] No charges to save');
            return;
        }

        const records = charges.map(charge => ({
            user_id: userId,
            transaction_id: charge.id,
            amount: charge.amount,
            linked_transfer_id: charge.linkedTransferId,
            transfer_amount: charge.transferAmount,
            status: charge.status,
            category: charge.category,
            reason: charge.reason,
            is_deductible: charge.isDeductible,
            has_vat: charge.hasVAT,
            detected_at: new Date().toISOString()
        }));

        const { error } = await supabase
            .from('emtl_charges')
            .upsert(records, { onConflict: 'transaction_id' });

        if (error) {
            console.error('[EMTL Detector] Error saving charges:', error);
            throw error;
        }

        console.log(`[EMTL Detector] Saved ${charges.length} EMTL charges to database`);

        // Flag illegal charges for admin review
        const illegalCharges = charges.filter(c => c.status === 'exempt_illegal');
        if (illegalCharges.length > 0) {
            await this.flagIllegalCharges(userId, illegalCharges);
        }
    }

    /**
     * Flag illegal EMTL charges for admin review and user notification
     */
    private async flagIllegalCharges(userId: string, charges: EMTLCharge[]): Promise<void> {
        const totalIllegal = charges.reduce((sum, c) => sum + c.amount, 0);

        // Add to review queue
        await supabase.from('review_queue').insert({
            user_id: userId,
            type: 'illegal_emtl_charge',
            priority: 'medium',
            priority_score: 0.6,
            reasons: charges.map(c => c.reason),
            notes: `User was charged ₦${totalIllegal} in illegal EMTL fees. ${charges.length} transactions affected.`,
            metadata: { charges }
        });

        console.log(`[EMTL Detector] Flagged ${charges.length} illegal charges for review`);
    }

    /**
     * Generate user-facing summary of EMTL charges
     */
    generateSummary(charges: EMTLCharge[]): string {
        if (charges.length === 0) {
            return '✅ No EMTL charges detected this month.';
        }

        const legitimate = charges.filter(c => c.status === 'legitimate');
        const illegal = charges.filter(c => c.status === 'exempt_illegal');
        const suspicious = charges.filter(c => c.status === 'suspicious');

        const totalLegitimate = legitimate.reduce((sum, c) => sum + c.amount, 0);
        const totalIllegal = illegal.reduce((sum, c) => sum + c.amount, 0);

        let summary = `📊 *EMTL Charges Summary*\n\n`;

        if (legitimate.length > 0) {
            summary += `✅ Legitimate charges: ${legitimate.length} × ₦50 = ₦${totalLegitimate}\n`;
            summary += `   (Deductible as business expense)\n\n`;
        }

        if (illegal.length > 0) {
            summary += `⚠️ *Illegal charges detected*: ${illegal.length} × ₦50 = ₦${totalIllegal}\n`;
            summary += `   Your bank charged you for exempt transactions!\n`;
            summary += `   You can request a refund.\n\n`;
        }

        if (suspicious.length > 0) {
            summary += `❓ Suspicious charges: ${suspicious.length} × ₦50 = ₦${suspicious.reduce((s, c) => s + c.amount, 0)}\n`;
            summary += `   (Needs manual review)\n\n`;
        }

        if (illegal.length > 0) {
            summary += `💡 *Action Required*:\n`;
            summary += `Contact your bank to request refund of ₦${totalIllegal}.\n`;
            summary += `Reference: Section 185, Tax Act 2025 (EMTL Exemptions)`;
        }

        return summary;
    }
}

export const emtlDetectorService = new EMTLDetectorService();
