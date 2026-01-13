/**
 * Stamp Duties Skill
 * Handles stamp duty calculations per Nigeria Tax Act 2025
 */

import { logger } from '../../utils/logger';
import { Session as SessionContext } from '../../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';

// Stamp Duty Rates per Ninth Schedule NTA 2025
const STAMP_RATES = {
    conveyance: { rate: 0.015, label: 'Conveyance on Sale', adValorem: true },
    lease: { rate: 0.0078, label: 'Lease/Tenancy', adValorem: true, threshold: 10000000 },
    share_capital: { rate: 0.0075, label: 'Share Capital', adValorem: true },
    loan_capital: { rate: 0.0015, label: 'Loan/Debenture Capital', adValorem: true },
    mortgage: { rate: 0.0015, label: 'Mortgage/Bond', adValorem: true },
    power_of_attorney: { rate: 500, label: 'Power of Attorney', adValorem: false },
    deed_of_gift: { rate: 0.015, label: 'Deed of Gift', adValorem: true },
};

const ELECTRONIC_TRANSFER_EXEMPT = 10000; // ₦10K

export class StampDutiesSkill {
    private formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
    }

    private detectInstrumentType(message: string): string | null {
        const lower = message.toLowerCase();

        if (lower.includes('property') || lower.includes('land') || lower.includes('conveyance')) return 'conveyance';
        if (lower.includes('lease') || lower.includes('rent') || lower.includes('tenancy')) return 'lease';
        if (lower.includes('share') && lower.includes('capital')) return 'share_capital';
        if (lower.includes('loan') || lower.includes('debenture')) return 'loan_capital';
        if (lower.includes('mortgage') || lower.includes('bond')) return 'mortgage';
        if (lower.includes('power of attorney') || lower.includes('poa')) return 'power_of_attorney';
        if (lower.includes('gift') || lower.includes('deed of gift')) return 'deed_of_gift';

        return null;
    }

    async handle(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            logger.info('[Stamp Duties] Processing request', { userId: context.userId, message });

            const lowerMessage = message.toLowerCase();
            const amountMatch = message.match(/[₦n]?([\d,]+)/);
            const instrumentType = this.detectInstrumentType(message);

            if (amountMatch && instrumentType) {
                const amount = parseInt(amountMatch[1].replace(/,/g, ''));
                const rateInfo = STAMP_RATES[instrumentType as keyof typeof STAMP_RATES];

                // Check exemptions
                if (instrumentType === 'lease' && amount < (rateInfo as { threshold?: number }).threshold!) {
                    return {
                        message: `📜 Stamp Duty - Lease\n` +
                            `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                            `Annual Value: ${this.formatCurrency(amount)}\n\n` +
                            `✅ *EXEMPT*\n` +
                            `Leases with annual value < ${this.formatCurrency(10000000)} are exempt.\n\n` +
                            `Reference: Ninth Schedule NTA 2025`,
                        metadata: { skill: 'stamp-duties', exempt: true, instrumentType }
                    };
                }

                const duty = rateInfo.adValorem ? amount * (rateInfo.rate as number) : (rateInfo.rate as number);

                let response = `📜 Stamp Duty Calculation\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `Instrument: ${rateInfo.label}\n` +
                    `Value: ${this.formatCurrency(amount)}\n\n` +
                    `📋 Calculation:\n`;

                if (rateInfo.adValorem) {
                    response += `├─ Rate: ${((rateInfo.rate as number) * 100).toFixed(2)}% ad valorem\n`;
                } else {
                    response += `├─ Fixed Rate: ${this.formatCurrency(rateInfo.rate as number)}\n`;
                }

                response += `└─ Stamp Duty: ${this.formatCurrency(duty)}\n\n` +
                    `⏰ Deadline:\n` +
                    `• Must be stamped within 30 days of execution\n` +
                    `• Late stamping incurs penalties\n\n` +
                    `📍 Where to Stamp:\n` +
                    `• FIRS Stamp Duty Office\n` +
                    `• e-Stamp portal (for electronic stamping)\n\n` +
                    `Reference: Part V, Ninth Schedule NTA 2025`;

                return {
                    message: response,
                    metadata: {
                        skill: 'stamp-duties',
                        instrumentType,
                        value: amount,
                        duty,
                        rate: rateInfo.rate
                    }
                };
            }

            // No match - show help
            return {
                message: `📜 Stamp Duties Calculator\n\n` +
                    `Calculate stamp duty per NTA 2025.\n\n` +
                    `Commands:\n` +
                    `• *stamp duty property [amount]*\n` +
                    `• *stamp duty lease [annual value]*\n` +
                    `• *stamp duty share capital [amount]*\n\n` +
                    `Common Rates:\n` +
                    `├─ Property/Conveyance: 1.5%\n` +
                    `├─ Lease: 0.78% (exempt if < ₦10M/yr)\n` +
                    `├─ Share Capital: 0.75%\n` +
                    `├─ Loan/Debenture: 0.15%\n` +
                    `└─ Power of Attorney: ₦500 flat\n\n` +
                    `Exemptions:\n` +
                    `├─ Electronic transfers < ₦10,000\n` +
                    `├─ Government instruments\n` +
                    `└─ Leases < ₦10M annual value`,
                metadata: { skill: 'stamp-duties' }
            };
        } catch (error) {
            logger.error('[Stamp Duties] Error:', error);
            return {
                message: "❌ Failed to calculate stamp duty. Please try again.",
                metadata: { skill: 'stamp-duties', error: (error as Error).message }
            };
        }
    }
}

export const stampDutiesSkill = new StampDutiesSkill();
