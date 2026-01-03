/**
 * Nigerian-Specific Transaction Detectors
 * Identifies USSD, mobile money, POS, and foreign currency transactions
 */

export interface NigerianFlags {
    is_ussd_transaction: boolean;
    is_mobile_money: boolean;
    mobile_money_provider?: string;
    is_pos_transaction: boolean;
    is_foreign_currency: boolean;
    foreign_currency?: string;
}

export class NigerianDetectors {
    /**
     * Detect all Nigerian-specific features in a transaction
     */
    async detect(txn: any): Promise<NigerianFlags> {
        const description = (txn.description || '').toLowerCase();

        return {
            is_ussd_transaction: this.detectUSSD(description),
            is_mobile_money: this.detectMobileMoney(description) !== null,
            mobile_money_provider: this.detectMobileMoney(description) || undefined,
            is_pos_transaction: this.detectPOS(description),
            is_foreign_currency: this.detectForeignCurrency(description) !== null,
            foreign_currency: this.detectForeignCurrency(description) || undefined
        };
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
     * Get CBN exchange rate for a currency and date
     * TODO: Implement actual CBN API integration
     */
    async getCBNRate(currency: string, date: string): Promise<number | null> {
        // Hardcoded rates for now
        // In production, fetch from CBN API or database
        const RATES: Record<string, number> = {
            'USD': 1550,
            'GBP': 1950,
            'EUR': 1650,
            'ZAR': 85,
            'CNY': 215,
            'JPY': 10.5
        };

        return RATES[currency] || null;
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
