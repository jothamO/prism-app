/**
 * Withholding Tax Skill
 * Handles WHT calculations per Nigeria Tax Act 2025
 */

import { logger } from '../../utils/logger';
import { Session as SessionContext } from '../../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';

// WHT Rates per NTA 2025
const WHT_RATES: Record<string, { rate: number; label: string; isFinal: boolean }> = {
    dividend: { rate: 0.10, label: 'Dividends', isFinal: false },
    interest: { rate: 0.10, label: 'Interest', isFinal: false },
    royalty: { rate: 0.10, label: 'Royalties', isFinal: false },
    rent: { rate: 0.10, label: 'Rent', isFinal: false },
    director: { rate: 0.10, label: "Director's Fees", isFinal: true },
    contract: { rate: 0.05, label: 'Contract/Supply', isFinal: false },
    consultancy: { rate: 0.05, label: 'Consultancy', isFinal: false },
    professional: { rate: 0.05, label: 'Professional Fees', isFinal: false },
    commission: { rate: 0.05, label: 'Commission', isFinal: false },
};

export class WithholdingTaxSkill {
    /**
     * Format currency
     */
    private formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
    }

    /**
     * Detect payment type from message
     */
    private detectPaymentType(message: string): string | null {
        const lower = message.toLowerCase();

        if (lower.includes('dividend')) return 'dividend';
        if (lower.includes('interest')) return 'interest';
        if (lower.includes('royalt')) return 'royalty';
        if (lower.includes('rent')) return 'rent';
        if (lower.includes('director')) return 'director';
        if (lower.includes('contract') || lower.includes('supply')) return 'contract';
        if (lower.includes('consult')) return 'consultancy';
        if (lower.includes('professional')) return 'professional';
        if (lower.includes('commission')) return 'commission';

        return null;
    }

    /**
     * Handle WHT calculation
     */
    async handle(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            logger.info('[WHT Skill] Processing request', { userId: context.userId, message });

            // Parse amount
            const amountMatch = message.match(/[₦n]?([\d,]+)/);
            const paymentType = this.detectPaymentType(message);

            if (amountMatch && paymentType) {
                const grossAmount = parseInt(amountMatch[1].replace(/,/g, ''));
                const rateInfo = WHT_RATES[paymentType];

                const whtAmount = grossAmount * rateInfo.rate;
                const netAmount = grossAmount - whtAmount;

                let response = `🏛️ Withholding Tax Calculation\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `Payment Type: ${rateInfo.label}\n` +
                    `Gross Amount: ${this.formatCurrency(grossAmount)}\n\n` +
                    `📋 WHT Breakdown:\n` +
                    `├─ WHT Rate: ${(rateInfo.rate * 100).toFixed(0)}%\n` +
                    `├─ WHT Deducted: ${this.formatCurrency(whtAmount)}\n` +
                    `└─ Net Payment: ${this.formatCurrency(netAmount)}\n\n`;

                if (rateInfo.isFinal) {
                    response += `⚠️ *FINAL TAX*\n` +
                        `This WHT is a final tax - no further tax liability.\n\n`;
                } else {
                    response += `💡 This WHT is *creditable* against final tax liability.\n` +
                        `Recipient should claim credit when filing returns.\n\n`;
                }

                response += `📅 Remittance:\n` +
                    `• Due: 14th of following month\n` +
                    `• To: FIRS or relevant state authority\n\n` +
                    `Reference: Section 20 NTA 2025`;

                return {
                    message: response,
                    metadata: {
                        skill: 'withholding-tax',
                        paymentType,
                        grossAmount,
                        whtAmount,
                        netAmount,
                        rate: rateInfo.rate,
                        isFinal: rateInfo.isFinal
                    }
                };
            }

            // Amount only - ask for type
            if (amountMatch && !paymentType) {
                const amount = parseInt(amountMatch[1].replace(/,/g, ''));

                // Calculate all rates for comparison
                const calculations = Object.entries(WHT_RATES).map(([key, info]) => ({
                    type: info.label,
                    rate: info.rate,
                    wht: amount * info.rate,
                    net: amount - (amount * info.rate)
                }));

                const calc5 = calculations.filter(c => c.rate === 0.05);
                const calc10 = calculations.filter(c => c.rate === 0.10);

                return {
                    message: `🏛️ Withholding Tax - Select Type\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `Amount: ${this.formatCurrency(amount)}\n\n` +
                        `📋 5% WHT (${this.formatCurrency(amount * 0.05)}):\n` +
                        calc5.map(c => `├─ ${c.type}`).join('\n') + `\n\n` +
                        `📋 10% WHT (${this.formatCurrency(amount * 0.10)}):\n` +
                        calc10.map(c => `├─ ${c.type}`).join('\n') + `\n\n` +
                        `Specify type for exact calculation:\n` +
                        `e.g., "WHT dividend 1000000"`,
                    metadata: { skill: 'withholding-tax', needsType: true }
                };
            }

            // No match - show help
            return {
                message: `🏛️ Withholding Tax Calculator\n\n` +
                    `Calculate WHT deductions per NTA 2025.\n\n` +
                    `Commands:\n` +
                    `• *wht [type] [amount]*\n` +
                    `• *withholding [type] [amount]*\n\n` +
                    `Payment Types:\n\n` +
                    `📋 10% Rate:\n` +
                    `├─ dividend, interest, royalty, rent\n` +
                    `└─ director (final tax)\n\n` +
                    `📋 5% Rate:\n` +
                    `├─ contract, consultancy\n` +
                    `└─ professional, commission\n\n` +
                    `Examples:\n` +
                    `• wht dividend 5000000\n` +
                    `• withholding contract 2500000\n` +
                    `• wht consultancy 1000000`,
                metadata: { skill: 'withholding-tax' }
            };
        } catch (error) {
            logger.error('[WHT Skill] Error:', error);
            return {
                message: "❌ Failed to calculate withholding tax. Please try again.",
                metadata: { skill: 'withholding-tax', error: (error as Error).message }
            };
        }
    }
}

export const withholdingTaxSkill = new WithholdingTaxSkill();
