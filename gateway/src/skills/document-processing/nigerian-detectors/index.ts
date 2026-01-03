/**
 * Nigerian-Specific Transaction Detectors
 * Identifies USSD, mobile money, POS, and foreign currency transactions
 * Phase 3: Capital detection, informal sector, CBN rates
 */

import { CapitalDetector, CapitalDetectionResult } from './capital-detector';
import { CBNRateService } from './cbn-rate-service';

export interface NigerianFlags {
    is_ussd_transaction: boolean;
    is_mobile_money: boolean;
    mobile_money_provider?: string;
    is_pos_transaction: boolean;
    is_foreign_currency: boolean;
    foreign_currency?: string;
    is_capital_injection?: boolean;
    capital_type?: string;
}

export interface DetectionContext {
    businessId?: string;
    userId?: string;
}

export class NigerianDetectors {
    private capitalDetector = new CapitalDetector();
    private cbnService = new CBNRateService();

    /**
     * Detect all Nigerian-specific features in a transaction
     */
    async detect(txn: any, context?: DetectionContext): Promise<NigerianFlags> {
        const description = (txn.description || '').toLowerCase();

        // Base detection flags
        const baseFlags: NigerianFlags = {
            is_ussd_transaction: this.detectUSSD(description),
            is_mobile_money: this.detectMobileMoney(description) !== null,
            mobile_money_provider: this.detectMobileMoney(description) || undefined,
            is_pos_transaction: this.detectPOS(description),
            is_foreign_currency: this.detectForeignCurrency(description) !== null,
            foreign_currency: this.detectForeignCurrency(description) || undefined
        };

        // Phase 3: Capital injection detection (only for credits with business context)
        if (context?.businessId && txn.credit && txn.credit > 0) {
            try {
                const capitalResult = await this.capitalDetector.detect({
                    description: txn.description || '',
                    amount: txn.credit,
                    date: txn.date || txn.transaction_date || new Date().toISOString(),
                    userId: context.userId || '',
                    businessId: context.businessId
                });

                if (capitalResult.isCapital && capitalResult.confidence >= 0.70) {
                    baseFlags.is_capital_injection = true;
                    baseFlags.capital_type = capitalResult.capitalType;
                }
            } catch (error) {
                // Log but don't fail - capital detection is enhancement
                console.warn('[NigerianDetectors] Capital detection failed:', error);
            }
        }

        return baseFlags;
    }

    /**
     * Convert foreign currency to Naira using CBN rates
     */
    async convertToNaira(amount: number, currency: string, date?: Date): Promise<{
        naira: number;
        rate: number;
        source: string;
    }> {
        return this.cbnService.convertToNaira(amount, currency, date);
    }

    /**
     * Get CBN exchange rate for a currency
     */
    async getCBNRate(currency: string, date?: Date) {
        return this.cbnService.getRate(currency, date || new Date());
    }

    /**
     * Detect USSD transactions
     * Common patterns: *737*500, *966*, USSD, Quick Transfer
     */
    private detectUSSD(description: string): boolean {
        const USSD_PATTERNS = [
            /\*\d{3}\*/,              // *737*, *966*, *919*
            /ussd/i,
            /quick ?transfer/i,
            /mobile ?transfer/i,
            /instant ?transfer/i,
            /\*737\*/i,               // GTBank
            /\*966\*/i,               // Zenith
            /\*894\*/i,               // First Bank
            /\*919\*/i,               // Access Bank
            /\*770\*/i,               // Fidelity
            /\*945\*/i                // FCMB
        ];

        return USSD_PATTERNS.some(pattern => pattern.test(description));
    }

    /**
     * Detect and identify mobile money provider
     */
    private detectMobileMoney(description: string): string | null {
        const PROVIDERS = {
            'OPay': /opay/i,
            'PalmPay': /palmp(a|)y/i,
            'Moniepoint': /moniepoint/i,
            'Kuda': /kuda/i,
            'Paga': /paga/i,
            'Carbon': /carbon/i,
            'FairMoney': /fair ?money/i,
            'Branch': /branch/i,
            'Renmoney': /ren ?money/i
        };

        for (const [provider, pattern] of Object.entries(PROVIDERS)) {
            if (pattern.test(description)) {
                return provider;
            }
        }

        return null;
    }

    /**
     * Detect POS terminal transactions
     */
    private detectPOS(description: string): boolean {
        const POS_PATTERNS = [
            /\bpos\b/i,
            /pos ?terminal/i,
            /payment ?terminal/i,
            /card ?payment/i,
            /merchant ?payment/i,
            /terminal ?id/i
        ];

        return POS_PATTERNS.some(pattern => pattern.test(description));
    }

    /**
     * Detect and identify foreign currency
     */
    private detectForeignCurrency(description: string): string | null {
        const CURRENCIES = {
            'USD': /usd|\$|dollar/i,
            'GBP': /gbp|£|pound|sterling/i,
            'EUR': /eur|€|euro/i,
            'ZAR': /zar|rand/i,
            'CNY': /cny|yuan|rmb/i,
            'JPY': /jpy|yen/i
        };

        for (const [currency, pattern] of Object.entries(CURRENCIES)) {
            if (pattern.test(description)) {
                return currency;
            }
        }

        return null;
    }

    /**
     * Detect common Nigerian bank codes in transaction
     */
    detectBankCode(description: string): string | null {
        const BANKS: Record<string, RegExp> = {
            'GTB': /gtb|gt ?bank|guaranty/i,
            'ZENITH': /zenith/i,
            'ACCESS': /access/i,
            'FIRST': /first ?bank|fbn/i,
            'UBA': /uba|united ?bank/i,
            'FCMB': /fcmb|first ?city/i,
            'FIDELITY': /fidelity/i,
            'UNION': /union ?bank/i,
            'STERLING': /sterling/i,
            'STANBIC': /stanbic|ibtc/i,
            'WEMA': /wema/i,
            'POLARIS': /polaris/i,
            'KEYSTONE': /keystone/i,
            'ECOBANK': /eco ?bank/i
        };

        for (const [code, pattern] of Object.entries(BANKS)) {
            if (pattern.test(description)) {
                return code;
            }
        }

        return null;
    }
}

// Export Phase 3 enhancements
export { CapitalDetector } from './capital-detector';
export { InformalSectorTracker } from './informal-sector-tracker';
export { CBNRateService } from './cbn-rate-service';
