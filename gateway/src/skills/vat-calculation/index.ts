/**
 * VAT Calculation Skill
 * Handles VAT calculations per Nigeria Tax Act 2025
 * Uses Central Rules Engine for dynamic VAT rate
 */

import { logger } from '../../utils/logger';
import { Session as SessionContext } from '../../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';
import { PersonalityFormatter } from '../../utils/personality';
import { getVATRate } from '../../services/rules-fetcher';

// Fallback VAT rate (used only if rules-fetcher fails)
const FALLBACK_VAT_RATE = 0.075; // 7.5% per Tax Act 2025 Section 148

// Zero-rated items per Tax Act 2025 Section 186
const ZERO_RATED_KEYWORDS = [
    'rice', 'beans', 'yam', 'cassava', 'maize', 'millet', 'sorghum', 'wheat',
    'bread', 'flour', 'garri', 'plantain', 'potato', 'tomato', 'onion', 'pepper',
    'palm oil', 'groundnut oil', 'vegetable oil', 'salt', 'milk', 'baby food',
    'medicine', 'drug', 'pharmaceutical', 'medical equipment', 'hospital',
    'vaccine', 'syringe', 'bandage', 'first aid', 'diagnostic',
    'textbook', 'exercise book', 'pencil', 'pen', 'school uniform', 'educational',
    'fertilizer', 'seedling', 'pesticide', 'herbicide', 'tractor', 'farm equipment',
    'export', 'exported', 'foreign buyer', 'international shipment'
];

// Exempt items per Tax Act 2025 Section 187
const EXEMPT_KEYWORDS = [
    'land', 'building', 'property', 'real estate', 'rent', 'lease',
    'bank charges', 'interest', 'insurance premium', 'forex', 'stock trading',
    'public transport', 'bus fare', 'train ticket', 'ferry',
    'medical consultation', 'hospital services', 'diagnostic services',
    'school fees', 'tuition', 'training course'
];

export interface VATClassification {
    category: 'standard' | 'zero-rated' | 'exempt';
    rate: number;
    canClaimInputVAT: boolean;
    actReference: string;
    matchedKeyword?: string;
}

export interface VATCalculationResult {
    subtotal: number;
    vatAmount: number;
    total: number;
    classification: VATClassification;
}

export class VATCalculationSkill {
    private vatRateCache: number | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    /**
     * Get current VAT rate from Central Rules Engine
     */
    private async getVATRateWithCache(): Promise<number> {
        if (this.vatRateCache !== null && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
            return this.vatRateCache;
        }

        try {
            const rate = await getVATRate();
            this.vatRateCache = rate;
            this.cacheTimestamp = Date.now();
            logger.info(`[VAT Skill] Loaded VAT rate from Central Rules Engine: ${rate * 100}%`);
            return rate;
        } catch (error) {
            logger.warn('[VAT Skill] Failed to fetch VAT rate, using fallback:', error);
            return FALLBACK_VAT_RATE;
        }
    }

    /**
     * Classify supply for VAT purposes
     */
    async classifySupply(description: string, category?: string): Promise<VATClassification> {
        const lowerDesc = description.toLowerCase();
        const lowerCat = category?.toLowerCase() || '';

        // Check zero-rated first
        for (const keyword of ZERO_RATED_KEYWORDS) {
            if (lowerDesc.includes(keyword) || lowerCat.includes(keyword)) {
                return {
                    category: 'zero-rated',
                    rate: 0,
                    canClaimInputVAT: true,
                    actReference: 'Section 186',
                    matchedKeyword: keyword
                };
            }
        }

        // Check exempt
        for (const keyword of EXEMPT_KEYWORDS) {
            if (lowerDesc.includes(keyword) || lowerCat.includes(keyword)) {
                return {
                    category: 'exempt',
                    rate: 0,
                    canClaimInputVAT: false,
                    actReference: 'Section 187',
                    matchedKeyword: keyword
                };
            }
        }

        // Default to standard rate from Central Rules Engine
        const standardRate = await this.getVATRateWithCache();
        return {
            category: 'standard',
            rate: standardRate,
            canClaimInputVAT: true,
            actReference: 'Section 148'
        };
    }

    /**
     * Calculate VAT for an amount
     */
    calculateVAT(
        amount: number,
        includesVAT: boolean,
        classification: VATClassification
    ): { subtotal: number; vatAmount: number; total: number } {
        if (includesVAT) {
            const divisor = 1 + classification.rate;
            const subtotal = amount / divisor;
            const vatAmount = amount - subtotal;
            return {
                subtotal: Math.round(subtotal * 100) / 100,
                vatAmount: Math.round(vatAmount * 100) / 100,
                total: amount
            };
        } else {
            const vatAmount = amount * classification.rate;
            return {
                subtotal: amount,
                vatAmount: Math.round(vatAmount * 100) / 100,
                total: Math.round((amount + vatAmount) * 100) / 100
            };
        }
    }

    /**
     * Format currency
     */
    private formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
    }

    /**
     * Handle VAT calculation request
     */
    async handle(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            logger.info('[VAT Skill] Processing request', { userId: context.userId, message });

            // Extract amount and description from message
            const vatMatch = message.match(/vat\s+[₦n]?(\d[\d,]*)\s*(.*)?/i);
            if (!vatMatch) {
                return {
                    message: "💡 To calculate VAT, use: *vat [amount] [description]*\n\nExample: `vat 50000 electronics`",
                    metadata: { skill: 'vat-calculation' }
                };
            }

            const amount = parseInt(vatMatch[1].replace(/,/g, ''));
            const description = vatMatch[2]?.trim() || 'goods';

            // Classify and calculate using dynamic rate
            const classification = await this.classifySupply(description);
            const calculation = this.calculateVAT(amount, false, classification);

            // Format response based on classification
            let response: string;
            if (classification.category === 'exempt') {
                response = `📋 VAT Classification Result\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `Item: ${description}\n` +
                    `Amount: ${this.formatCurrency(amount)}\n\n` +
                    `✅ *EXEMPT* from VAT\n` +
                    `Matched: "${classification.matchedKeyword}"\n\n` +
                    `⚠️ Cannot claim input VAT on exempt supplies\n\n` +
                    `Reference: ${classification.actReference} NTA 2025`;
            } else if (classification.category === 'zero-rated') {
                response = `📋 VAT Classification Result\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `Item: ${description}\n` +
                    `Amount: ${this.formatCurrency(amount)}\n\n` +
                    `✅ *ZERO-RATED* (0% VAT)\n` +
                    `Matched: "${classification.matchedKeyword}"\n\n` +
                    `✅ Can claim input VAT on related purchases\n\n` +
                    `Reference: ${classification.actReference} NTA 2025`;
            } else {
                const ratePercent = classification.rate * 100;
                response = `📋 VAT Calculation\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `Item: ${description}\n` +
                    `Subtotal: ${this.formatCurrency(calculation.subtotal)}\n` +
                    `VAT @ ${ratePercent}%: ${this.formatCurrency(calculation.vatAmount)}\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `*Total: ${this.formatCurrency(calculation.total)}*\n\n` +
                    `✅ Can claim as input VAT if business expense\n\n` +
                    `Reference: ${classification.actReference} NTA 2025`;
            }

            return {
                message: response,
                metadata: {
                    skill: 'vat-calculation',
                    amount,
                    description,
                    classification: classification.category,
                    vatRate: classification.rate,
                    vatAmount: calculation.vatAmount,
                    total: calculation.total,
                    rulesSource: 'central-engine'
                }
            };
        } catch (error) {
            logger.error('[VAT Skill] Error:', error);
            return {
                message: PersonalityFormatter.error("Failed to calculate VAT. Please try again with format: `vat [amount] [description]`", true),
                metadata: { skill: 'vat-calculation', error: (error as Error).message }
            };
        }
    }
}

export const vatCalculationSkill = new VATCalculationSkill();
