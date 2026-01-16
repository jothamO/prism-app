/**
 * VAT Calculation Skill
 * Handles VAT calculations via central tax-calculate edge function
 * Uses Central Rules Engine for dynamic VAT rate
 * 
 * Migrated to use taxService wrapper for:
 * - Consistent calculation logging
 * - Single source of truth for VAT rate
 * - Centralized rules updates
 */

import { logger } from '../../utils/logger';
import { Session as SessionContext } from '../../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';
import { PersonalityFormatter } from '../../utils/personality';
import { taxService, VATResult } from '../../utils/tax-service';

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

export class VATCalculationSkill {
    private formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
    }

    /**
     * Classify supply for VAT purposes based on keywords
     * This is NLU logic that stays in the skill
     */
    classifySupply(description: string, category?: string): VATClassification {
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

        // Default to standard rate (calculated by tax-calculate)
        return {
            category: 'standard',
            rate: 0.075, // Display hint, actual rate from tax-calculate
            canClaimInputVAT: true,
            actReference: 'Section 148'
        };
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
            const vatMatch = message.match(/vat\s+[₦n]?([\d,]+)\s*(.*)?/i);
            if (!vatMatch) {
                return {
                    message: "💡 To calculate VAT, use: *vat [amount] [description]*\n\nExample: `vat 50000 electronics`",
                    metadata: { skill: 'vat-calculation' }
                };
            }

            const amount = parseInt(vatMatch[1].replace(/,/g, ''));
            const description = vatMatch[2]?.trim() || 'goods';

            // Classify using NLU keywords
            const classification = this.classifySupply(description);

            let response: string;

            if (classification.category === 'exempt') {
                // Exempt items - no VAT calculation needed
                response = `📋 VAT Classification Result\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `Item: ${description}\n` +
                    `Amount: ${this.formatCurrency(amount)}\n\n` +
                    `✅ *EXEMPT* from VAT\n` +
                    `Matched: "${classification.matchedKeyword}"\n\n` +
                    `⚠️ Cannot claim input VAT on exempt supplies\n\n` +
                    `Reference: ${classification.actReference} NTA 2025`;

                return {
                    message: response,
                    metadata: {
                        skill: 'vat-calculation',
                        source: 'local-classification',
                        amount,
                        description,
                        classification: 'exempt',
                        vatRate: 0,
                        vatAmount: 0,
                        total: amount
                    }
                };
            } else if (classification.category === 'zero-rated') {
                // Zero-rated items
                response = `📋 VAT Classification Result\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `Item: ${description}\n` +
                    `Amount: ${this.formatCurrency(amount)}\n\n` +
                    `✅ *ZERO-RATED* (0% VAT)\n` +
                    `Matched: "${classification.matchedKeyword}"\n\n` +
                    `✅ Can claim input VAT on related purchases\n\n` +
                    `Reference: ${classification.actReference} NTA 2025`;

                return {
                    message: response,
                    metadata: {
                        skill: 'vat-calculation',
                        source: 'local-classification',
                        amount,
                        description,
                        classification: 'zero-rated',
                        vatRate: 0,
                        vatAmount: 0,
                        total: amount
                    }
                };
            }

            // Standard VAT - call central tax-calculate
            const result = await taxService.calculateVAT(
                {
                    amount,
                    is_vatable: true,
                    supply_type: 'goods'
                },
                context.userId
            );

            logger.info('[VAT Skill] Calculation complete via tax-calculate', {
                userId: context.userId,
                amount,
                vatRate: result.vat_rate,
                vatAmount: result.vat_amount
            });

            const ratePercent = result.vat_rate * 100;
            response = `📋 VAT Calculation\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `Item: ${description}\n` +
                `Subtotal: ${this.formatCurrency(result.base_amount)}\n` +
                `VAT @ ${ratePercent}%: ${this.formatCurrency(result.vat_amount)}\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `*Total: ${this.formatCurrency(result.total_amount)}*\n\n` +
                `✅ Can claim as input VAT if business expense\n\n` +
                `Reference: ${classification.actReference} NTA 2025`;

            return {
                message: response,
                metadata: {
                    skill: 'vat-calculation',
                    source: 'tax-calculate',
                    amount,
                    description,
                    classification: 'standard',
                    ...result
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
