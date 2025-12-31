import { supplyClassificationService } from './supply-classification.service';

export class VATCalculatorService {
    private readonly STANDARD_RATE = 0.075; // 7.5% per Tax Act 2025 Section 148

    /**
     * Calculate VAT with supply classification (Tax Act 2025 compliant)
     */
    calculateVAT(
        amount: number,
        includesVAT: boolean = false,
        itemDescription?: string,
        category?: string
    ): {
        subtotal: number;
        vatAmount: number;
        total: number;
        vatRate: number;
        classification: string;
        canClaimInputVAT: boolean;
    } {
        // Get classification (zero-rated, exempt, or standard)
        const classification = itemDescription
            ? supplyClassificationService.classify(itemDescription, category)
            : { category: 'standard', rate: this.STANDARD_RATE, canClaimInputVAT: true, actReference: 'Section 148' };

        if (includesVAT) {
            // Amount includes VAT, extract it
            const divisor = 1 + classification.rate;
            const subtotal = amount / divisor;
            const vatAmount = amount - subtotal;
            return {
                subtotal,
                vatAmount,
                total: amount,
                vatRate: classification.rate,
                classification: classification.category,
                canClaimInputVAT: classification.canClaimInputVAT
            };
        } else {
            // Amount is pre-VAT, add it
            const vatAmount = amount * classification.rate;
            return {
                subtotal: amount,
                vatAmount,
                total: amount + vatAmount,
                vatRate: classification.rate,
                classification: classification.category,
                canClaimInputVAT: classification.canClaimInputVAT
            };
        }
    }

    /**
     * Calculate monthly VAT (simplified - use vat-reconciliation.service for full reconciliation)
     */
    calculateMonthlyVAT(invoices: any[], expenses: any[]): {
        outputVAT: number;
        inputVAT: number;
        netVAT: number;
    } {
        const outputVAT = invoices.reduce((sum, inv) => sum + (inv.vat_amount || 0), 0);
        const inputVAT = expenses.reduce((sum, exp) => sum + (exp.vat_amount || 0), 0);
        const netVAT = Math.max(0, outputVAT - inputVAT);

        return { outputVAT, inputVAT, netVAT };
    }
}

export const vatCalculatorService = new VATCalculatorService();
