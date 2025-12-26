export class VATCalculatorService {
    private readonly STANDARD_RATE = 0.075; // 7.5% (pre-2026)

    calculateVAT(amount: number, includesVAT: boolean = false): {
        subtotal: number;
        vatAmount: number;
        total: number;
    } {
        if (includesVAT) {
            const subtotal = amount / 1.075;
            const vatAmount = amount - subtotal;
            return { subtotal, vatAmount, total: amount };
        } else {
            const vatAmount = amount * this.STANDARD_RATE;
            return {
                subtotal: amount,
                vatAmount,
                total: amount + vatAmount
            };
        }
    }

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
