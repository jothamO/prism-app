/**
 * Rule-Based Classifier
 * Nigerian-specific classification rules
 * Tier 2: Fast, high confidence for known patterns
 * 
 * Enhanced with Nigerian transaction detection integration
 */

import { logger } from '../../../utils/logger';
import type { ClassificationResult } from './business-pattern';
import { NigerianDetectors } from '../nigerian-detectors';

export class RuleBasedClassifier {
    private nigerianDetectors: NigerianDetectors;

    constructor() {
        this.nigerianDetectors = new NigerianDetectors();
    }

    /**
     * Classify transaction using rule-based logic with Nigerian context
     */
    async classify(txn: any, context?: { userId?: string; businessId?: string }): Promise<ClassificationResult> {
        const description = (txn.description || '').toLowerCase();
        const isCredit = txn.credit && txn.credit > 0;
        const isDebit = txn.debit && txn.debit > 0;
        const amount = txn.credit || txn.debit || 0;

        // Get Nigerian flags for enhanced detection
        const nigerianFlags = await this.nigerianDetectors.detect(txn, context);

        // === Nigerian-Specific Rules (Highest Priority) ===

        // EMTL (Electronic Money Transfer Levy)
        if (nigerianFlags.is_ussd_transaction && description.match(/emtl|levy/i)) {
            return {
                classification: 'expense',
                category: 'bank_charge_emtl',
                confidence: 0.98,
                source: 'rule_based',
                reasoning: 'EMTL levy on USSD transaction'
            };
        }

        // Capital injection detection
        if (nigerianFlags.is_capital_injection && isCredit) {
            return {
                classification: 'capital',
                category: `capital_${nigerianFlags.capital_type || 'injection'}`,
                confidence: 0.85,
                source: 'rule_based',
                reasoning: `Capital injection detected: ${nigerianFlags.capital_type}`
            };
        }

        // Mobile money receipts (likely sales)
        if (nigerianFlags.is_mobile_money && isCredit && amount > 1000) {
            return {
                classification: 'sale',
                category: `mobile_money_${nigerianFlags.mobile_money_provider || 'sale'}`,
                confidence: 0.82,
                source: 'rule_based',
                reasoning: `Mobile money credit via ${nigerianFlags.mobile_money_provider || 'provider'}`
            };
        }

        // Foreign currency transactions
        if (nigerianFlags.is_foreign_currency) {
            return {
                classification: isCredit ? 'sale' : 'expense',
                category: `foreign_currency_${nigerianFlags.foreign_currency?.toLowerCase() || 'transaction'}`,
                confidence: 0.75,
                source: 'rule_based',
                reasoning: `Foreign currency transaction (${nigerianFlags.foreign_currency})`
            };
        }

        // === Standard Nigerian Rules ===

        // Salary/Wages
        if (description.match(/salary|wages|pay ?roll|staff ?pay/i)) {
            return {
                classification: 'salary',
                category: 'salary_expense',
                confidence: 0.95,
                source: 'rule_based',
                reasoning: 'Salary keyword detected'
            };
        }

        // ATM Withdrawal (personal)
        if (description.match(/atm|cash ?withdrawal/i)) {
            return {
                classification: 'personal',
                category: 'personal_withdrawal',
                confidence: 0.90,
                source: 'rule_based',
                reasoning: 'ATM/cash withdrawal = personal'
            };
        }

        // POS Terminal Payment (likely sale if credit)
        if (nigerianFlags.is_pos_transaction || description.match(/pos|payment ?terminal|card ?payment/i)) {
            if (isCredit) {
                return {
                    classification: 'sale',
                    category: 'pos_sale',
                    confidence: 0.88,
                    source: 'rule_based',
                    reasoning: 'POS terminal credit = customer payment'
                };
            } else {
                return {
                    classification: 'expense',
                    category: 'pos_charge',
                    confidence: 0.80,
                    source: 'rule_based',
                    reasoning: 'POS terminal debit = merchant charge'
                };
            }
        }

        // Bank Transfer (generic, low confidence)
        if (description.match(/transfer|trf/i)) {
            if (isCredit) {
                return {
                    classification: 'sale',
                    category: 'transfer_receipt',
                    confidence: 0.60,
                    source: 'rule_based',
                    reasoning: 'Transfer credit - needs user confirmation'
                };
            } else {
                return {
                    classification: 'expense',
                    category: 'transfer_payment',
                    confidence: 0.60,
                    source: 'rule_based',
                    reasoning: 'Transfer debit - needs user confirmation'
                };
            }
        }

        // BUYPOWER (electricity - requires user input)
        if (description.match(/buypower|ekedc|ikedc|phed|electricity/i)) {
            return {
                classification: 'expense',
                category: 'utilities_electricity',
                confidence: 0.70,
                source: 'rule_based',
                reasoning: 'Electricity payment - confirm business vs personal'
            };
        }

        // Airtime/Data
        if (description.match(/airtime|data|recharge|mtn|glo|airtel|9mobile/i)) {
            return {
                classification: 'expense',
                category: 'communication_airtime',
                confidence: 0.75,
                source: 'rule_based',
                reasoning: 'Airtime/data purchase'
            };
        }

        // Internet subscription
        if (description.match(/internet|broadband|wifi|data ?plan/i)) {
            return {
                classification: 'expense',
                category: 'communication_internet',
                confidence: 0.85,
                source: 'rule_based',
                reasoning: 'Internet subscription'
            };
        }

        // Marketing/Advertising
        if (description.match(/facebook ?ads|google ?ads|instagram|advert|marketing/i)) {
            return {
                classification: 'expense',
                category: 'marketing_expense',
                confidence: 0.95,
                source: 'rule_based',
                reasoning: 'Digital advertising expense'
            };
        }

        // Rent
        if (description.match(/rent|lease/i) && amount > 50000) {
            return {
                classification: 'expense',
                category: 'rent_expense',
                confidence: 0.90,
                source: 'rule_based',
                reasoning: 'Rent/lease payment'
            };
        }

        // Equipment/Capital expenditure
        if (description.match(/laptop|computer|generator|machinery|equipment/i) && amount > 100000) {
            return {
                classification: 'capital',
                category: 'equipment_purchase',
                confidence: 0.85,
                source: 'rule_based',
                reasoning: 'Capital equipment purchase'
            };
        }

        // Loan disbursement/repayment
        if (description.match(/loan|credit ?facility/i)) {
            return {
                classification: 'loan',
                category: isCredit ? 'loan_disbursement' : 'loan_repayment',
                confidence: 0.90,
                source: 'rule_based',
                reasoning: isCredit ? 'Loan disbursement received' : 'Loan repayment made'
            };
        }

        // Tax/FIRS payments
        if (description.match(/firs|tax|vat|paye|withholding/i)) {
            return {
                classification: 'expense',
                category: 'tax_payment',
                confidence: 0.95,
                source: 'rule_based',
                reasoning: 'Tax payment to FIRS'
            };
        }

        // Bank charges
        if (description.match(/bank ?charge|commission|service ?charge|sms ?alert/i)) {
            return {
                classification: 'expense',
                category: 'bank_charges',
                confidence: 0.95,
                source: 'rule_based',
                reasoning: 'Bank service charge'
            };
        }

        // EMTL (Electronic Money Transfer Levy)
        if (description.match(/emtl|stamp ?duty|levy/i)) {
            return {
                classification: 'expense',
                category: 'bank_charge_emtl',
                confidence: 0.98,
                source: 'rule_based',
                reasoning: 'EMTL/stamp duty charge'
            };
        }

        // No rule matched - return null to try AI classifier
        return {
            classification: 'unknown',
            confidence: 0.0,
            source: 'rule_based',
            reasoning: 'No rule matched'
        };
    }
}
