/**
 * Stamp Duties Skill
 * Handles stamp duty calculations via central tax-calculate edge function
 * NTA 2025 compliant
 */

import { logger } from '../../utils/logger';
import { Session as SessionContext } from '../../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';
import { taxService, StampDutyResult } from '../../utils/tax-service';

// Instrument type labels for display
const INSTRUMENT_LABELS: Record<string, string> = {
    transfer: 'Property Transfer/Conveyance',
    lease: 'Lease/Tenancy',
    deed: 'Deed/Agreement',
    receipt: 'Receipt',
    policy: 'Insurance Policy',
};

export class StampDutiesSkill {
    private formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
    }

    /**
     * Detect instrument type from message
     */
    private detectInstrumentType(message: string): 'transfer' | 'lease' | 'deed' | 'receipt' | 'policy' | null {
        const lower = message.toLowerCase();

        if (lower.includes('property') || lower.includes('land') || lower.includes('conveyance') || lower.includes('transfer')) return 'transfer';
        if (lower.includes('lease') || lower.includes('rent') || lower.includes('tenancy')) return 'lease';
        if (lower.includes('deed') || lower.includes('agreement') || lower.includes('contract')) return 'deed';
        if (lower.includes('policy') || lower.includes('insurance')) return 'policy';
        if (lower.includes('receipt')) return 'receipt';

        return null;
    }

    /**
     * Format stamp duty result for user display
     */
    private formatResult(result: StampDutyResult): string {
        const label = INSTRUMENT_LABELS[result.instrument_type] || result.instrument_type;

        return `📜 Stamp Duty Calculation\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Instrument: ${label}\n` +
            `Value: ${this.formatCurrency(result.amount)}\n\n` +
            `📋 Calculation:\n` +
            `├─ Rate: ${(result.rate * 100).toFixed(2)}%\n` +
            `└─ Stamp Duty: ${this.formatCurrency(result.stamp_duty)}\n\n` +
            `⏰ Deadline:\n` +
            `• Must be stamped within 30 days of execution\n` +
            `• Late stamping incurs penalties\n\n` +
            `📍 Where to Stamp:\n` +
            `• FIRS Stamp Duty Office\n` +
            `• e-Stamp portal (for electronic stamping)\n\n` +
            `Reference: Part V, Ninth Schedule NTA 2025`;
    }

    async handle(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            logger.info('[Stamp Duties] Processing request', { userId: context.userId, message });

            const amountMatch = message.match(/[₦n]?([\d,]+)/);
            const instrumentType = this.detectInstrumentType(message);

            if (amountMatch && instrumentType) {
                const amount = parseInt(amountMatch[1].replace(/,/g, ''));

                // Call central tax-calculate via taxService
                const result = await taxService.calculateStampDuty(
                    {
                        amount,
                        instrument_type: instrumentType
                    },
                    context.userId
                );

                logger.info('[Stamp Duties] Calculation complete via tax-calculate', {
                    userId: context.userId,
                    amount,
                    instrumentType,
                    stampDuty: result.stamp_duty
                });

                return {
                    message: this.formatResult(result),
                    metadata: {
                        skill: 'stamp-duties',
                        source: 'tax-calculate',
                        ...result
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
                    `• *stamp duty deed [amount]*\n\n` +
                    `Common Rates:\n` +
                    `├─ Property Transfer: 0.75%\n` +
                    `├─ Lease: 0.25%\n` +
                    `├─ Deed: 2%\n` +
                    `├─ Receipt: 0.5% (capped)\n` +
                    `└─ Insurance Policy: 0.25%\n\n` +
                    `Exemptions:\n` +
                    `├─ Electronic transfers < ₦10,000\n` +
                    `└─ Government instruments`,
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
