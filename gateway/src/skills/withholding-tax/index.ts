/**
 * Withholding Tax Skill
 * Handles WHT calculations via central tax-calculate edge function
 * NTA 2025 compliant
 */

import { logger } from '../../utils/logger';
import { Session as SessionContext } from '../../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';
import { taxService, WHTResult } from '../../utils/tax-service';

// Payment type mappings for user-friendly display
const PAYMENT_LABELS: Record<string, { label: string; isFinal: boolean }> = {
    dividend: { label: 'Dividends', isFinal: false },
    interest: { label: 'Interest', isFinal: false },
    royalty: { label: 'Royalties', isFinal: false },
    rent: { label: 'Rent', isFinal: false },
    director: { label: "Director's Fees", isFinal: true },
    contract: { label: 'Contract/Supply', isFinal: false },
    consultancy: { label: 'Consultancy', isFinal: false },
    professional: { label: 'Professional Fees', isFinal: false },
    commission: { label: 'Commission', isFinal: false },
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
     * Format WHT result for user display
     */
    private formatResult(result: WHTResult, paymentType: string): string {
        const labelInfo = PAYMENT_LABELS[paymentType] || { label: paymentType, isFinal: false };

        let response = `🏛️ Withholding Tax Calculation\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Payment Type: ${labelInfo.label}\n` +
            `Gross Amount: ${this.formatCurrency(result.gross_amount)}\n\n` +
            `📋 WHT Breakdown:\n` +
            `├─ WHT Rate: ${(result.wht_rate * 100).toFixed(0)}%\n` +
            `├─ WHT Deducted: ${this.formatCurrency(result.wht_amount)}\n` +
            `└─ Net Payment: ${this.formatCurrency(result.net_amount)}\n\n`;

        if (labelInfo.isFinal) {
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

        return response;
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

                // Call central tax-calculate via taxService
                const result = await taxService.calculateWHT(
                    {
                        amount: grossAmount,
                        payment_type: paymentType as any
                    },
                    context.userId
                );

                logger.info('[WHT Skill] Calculation complete via tax-calculate', {
                    userId: context.userId,
                    paymentType,
                    grossAmount,
                    whtAmount: result.wht_amount
                });

                return {
                    message: this.formatResult(result, paymentType),
                    metadata: {
                        skill: 'withholding-tax',
                        source: 'tax-calculate', // Indicates centralized calculation
                        paymentType,
                        ...result
                    }
                };
            }

            // Amount only - ask for type
            if (amountMatch && !paymentType) {
                const amount = parseInt(amountMatch[1].replace(/,/g, ''));

                return {
                    message: `🏛️ Withholding Tax - Select Type\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `Amount: ${this.formatCurrency(amount)}\n\n` +
                        `📋 5% WHT (${this.formatCurrency(amount * 0.05)}):\n` +
                        `├─ Contract/Supply\n` +
                        `├─ Consultancy\n` +
                        `├─ Professional Fees\n` +
                        `└─ Commission\n\n` +
                        `📋 10% WHT (${this.formatCurrency(amount * 0.10)}):\n` +
                        `├─ Dividends, Interest, Royalties\n` +
                        `├─ Rent\n` +
                        `└─ Director's Fees (final tax)\n\n` +
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
