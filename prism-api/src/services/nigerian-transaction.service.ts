/**
 * Nigerian Transaction Detection Service
 * Detects Nigerian-specific transaction patterns for enhanced classification
 * 
 * Mirrors gateway/src/skills/document-processing/nigerian-detectors
 */

export interface NigerianFlags {
    is_ussd_transaction: boolean;
    is_mobile_money: boolean;
    mobile_money_provider?: string;
    is_pos_transaction: boolean;
    is_foreign_currency: boolean;
    foreign_currency?: string;
    is_nigerian_bank_charge: boolean;
    is_emtl: boolean;
    is_stamp_duty: boolean;
    detected_bank_code?: string;
}

export interface TaxImplications {
    vatApplicable: boolean;
    whtApplicable: boolean;
    emtlCharged: boolean;
    stampDutyCharged: boolean;
}

export interface EnhancedClassificationContext {
    nigerianFlags: NigerianFlags;
    taxImplications: TaxImplications;
    transactionTypeDescription: string;
}

// USSD patterns for Nigerian banks
const USSD_PATTERNS = [
    /\*737\*/,      // GTBank
    /\*919\*/,      // UBA
    /\*901\*/,      // Access Bank
    /\*945\*/,      // Sterling
    /\*966\*/,      // Zenith
    /\*770\*/,      // Fidelity
    /\*822\*/,      // Union Bank
    /\*894\*/,      // First Bank
    /\*326\*/,      // Ecobank
    /\*833\*/,      // First City Monument Bank
    /ussd/i,
    /\*[0-9]{3,4}\*/
];

// Mobile money providers
const MOBILE_MONEY_PROVIDERS: Record<string, RegExp[]> = {
    'opay': [/opay/i, /o-?pay/i],
    'palmpay': [/palmpay/i, /palm\s?pay/i],
    'moniepoint': [/moniepoint/i, /monie\s?point/i],
    'kuda': [/kuda/i],
    'chipper': [/chipper/i, /chipper\s?cash/i],
    'fairmoney': [/fairmoney/i, /fair\s?money/i],
    'paga': [/paga/i],
    'carbon': [/carbon/i],
    'piggyvest': [/piggyvest/i, /piggy\s?vest/i]
};

// POS patterns
const POS_PATTERNS = [
    /pos/i,
    /p\.o\.s/i,
    /payment\s?terminal/i,
    /card\s?payment/i,
    /terminal\s?id/i,
    /merchant\s?id/i,
    /ptsp/i
];

// Foreign currency patterns
const FOREIGN_CURRENCIES: Record<string, RegExp[]> = {
    'USD': [/\$|usd|dollar|us\$|united states/i],
    'GBP': [/£|gbp|pound|sterling/i],
    'EUR': [/€|eur|euro/i],
    'ZAR': [/zar|rand|south african/i],
    'CNY': [/cny|yuan|rmb|chinese/i],
    'JPY': [/¥|jpy|yen|japanese/i],
    'AED': [/aed|dirham|emirati/i],
    'GHS': [/ghs|cedi|ghana/i],
    'KES': [/kes|shilling|kenya/i]
};

// Nigerian bank charge patterns
const BANK_CHARGE_PATTERNS = [
    /bank\s?charge/i,
    /service\s?charge/i,
    /commission/i,
    /sms\s?alert/i,
    /notification\s?fee/i,
    /maintenance\s?fee/i,
    /account\s?fee/i,
    /card\s?fee/i,
    /atm\s?fee/i,
    /vat\s?on\s?charge/i
];

// EMTL patterns
const EMTL_PATTERNS = [
    /emtl/i,
    /electronic\s?money\s?transfer\s?levy/i,
    /e-?levy/i,
    /transfer\s?levy/i
];

// Stamp duty patterns
const STAMP_DUTY_PATTERNS = [
    /stamp\s?duty/i,
    /stmp\s?dty/i,
    /sd\s?charge/i,
    /stamping/i
];

// Nigerian bank codes
const NIGERIAN_BANKS: Record<string, RegExp[]> = {
    'GTB': [/gtbank/i, /guaranty\s?trust/i, /gtb/i],
    'UBA': [/uba/i, /united\s?bank\s?for\s?africa/i],
    'ACCESS': [/access\s?bank/i, /access/i, /diamond\s?bank/i],
    'ZENITH': [/zenith/i],
    'FIRST': [/first\s?bank/i, /firstbank/i, /fbn/i],
    'STERLING': [/sterling/i],
    'FIDELITY': [/fidelity/i],
    'FCMB': [/fcmb/i, /first\s?city/i],
    'ECOBANK': [/ecobank/i, /eco\s?bank/i],
    'UNION': [/union\s?bank/i],
    'STANBIC': [/stanbic/i, /ibtc/i],
    'WEMA': [/wema/i, /alat/i],
    'POLARIS': [/polaris/i, /skye/i],
    'KEYSTONE': [/keystone/i]
};

export class NigerianTransactionService {
    /**
     * Detect Nigerian-specific flags for a transaction
     */
    detect(description: string, amount?: number): NigerianFlags {
        const desc = description.toLowerCase();

        return {
            is_ussd_transaction: this.detectUSSD(desc),
            is_mobile_money: this.detectMobileMoney(desc) !== null,
            mobile_money_provider: this.detectMobileMoney(desc) || undefined,
            is_pos_transaction: this.detectPOS(desc),
            is_foreign_currency: this.detectForeignCurrency(desc) !== null,
            foreign_currency: this.detectForeignCurrency(desc) || undefined,
            is_nigerian_bank_charge: this.detectBankCharge(desc),
            is_emtl: this.detectEMTL(desc, amount),
            is_stamp_duty: this.detectStampDuty(desc, amount),
            detected_bank_code: this.detectBankCode(desc) || undefined
        };
    }

    /**
     * Get tax implications based on Nigerian flags
     */
    getTaxImplications(flags: NigerianFlags, isCredit: boolean, amount?: number): TaxImplications {
        return {
            vatApplicable: isCredit && flags.is_pos_transaction && !flags.is_mobile_money,
            whtApplicable: false, // Needs additional context (professional services, rent, etc.)
            emtlCharged: flags.is_emtl,
            stampDutyCharged: flags.is_stamp_duty
        };
    }

    /**
     * Get human-readable transaction type description
     */
    getTransactionTypeDescription(flags: NigerianFlags): string {
        if (flags.is_ussd_transaction) {
            const bank = flags.detected_bank_code ? ` (${flags.detected_bank_code})` : '';
            return `USSD Transfer${bank}`;
        }
        if (flags.is_mobile_money && flags.mobile_money_provider) {
            return `Mobile Money (${flags.mobile_money_provider})`;
        }
        if (flags.is_pos_transaction) {
            return 'POS Terminal';
        }
        if (flags.is_foreign_currency && flags.foreign_currency) {
            return `Foreign Currency (${flags.foreign_currency})`;
        }
        if (flags.is_emtl) {
            return 'EMTL Levy';
        }
        if (flags.is_stamp_duty) {
            return 'Stamp Duty';
        }
        if (flags.is_nigerian_bank_charge) {
            return 'Bank Charge';
        }
        return 'Standard Transaction';
    }

    /**
     * Get full enhanced context for classification
     */
    getEnhancedContext(description: string, isCredit: boolean, amount?: number): EnhancedClassificationContext {
        const flags = this.detect(description, amount);
        return {
            nigerianFlags: flags,
            taxImplications: this.getTaxImplications(flags, isCredit, amount),
            transactionTypeDescription: this.getTransactionTypeDescription(flags)
        };
    }

    // ============= Private Detection Methods =============

    private detectUSSD(description: string): boolean {
        return USSD_PATTERNS.some(pattern => pattern.test(description));
    }

    private detectMobileMoney(description: string): string | null {
        for (const [provider, patterns] of Object.entries(MOBILE_MONEY_PROVIDERS)) {
            if (patterns.some(pattern => pattern.test(description))) {
                return provider;
            }
        }
        return null;
    }

    private detectPOS(description: string): boolean {
        return POS_PATTERNS.some(pattern => pattern.test(description));
    }

    private detectForeignCurrency(description: string): string | null {
        for (const [currency, patterns] of Object.entries(FOREIGN_CURRENCIES)) {
            if (patterns.some(pattern => pattern.test(description))) {
                return currency;
            }
        }
        return null;
    }

    private detectBankCharge(description: string): boolean {
        return BANK_CHARGE_PATTERNS.some(pattern => pattern.test(description));
    }

    private detectEMTL(description: string, amount?: number): boolean {
        // EMTL by pattern
        if (EMTL_PATTERNS.some(pattern => pattern.test(description))) {
            return true;
        }
        // EMTL by amount (₦50 for transfers ≥₦10,000)
        if (amount === 50 && description.includes('levy')) {
            return true;
        }
        return false;
    }

    private detectStampDuty(description: string, amount?: number): boolean {
        // Stamp duty by pattern
        if (STAMP_DUTY_PATTERNS.some(pattern => pattern.test(description))) {
            return true;
        }
        // Stamp duty by amount (₦50 for transfers ≥₦10,000)
        if (amount === 50 && (description.includes('stamp') || description.includes('duty'))) {
            return true;
        }
        return false;
    }

    private detectBankCode(description: string): string | null {
        for (const [code, patterns] of Object.entries(NIGERIAN_BANKS)) {
            if (patterns.some(pattern => pattern.test(description))) {
                return code;
            }
        }
        return null;
    }
}

export const nigerianTransactionService = new NigerianTransactionService();
