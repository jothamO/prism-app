/**
 * Supply Classification Service
 * Tax Act 2025 - Sections 186 (Exempt), 187 (Zero-Rated), 148 (Standard)
 * 
 * Classifies supplies for correct VAT treatment:
 * - Standard: 7.5% VAT
 * - Zero-Rated: 0% VAT (can claim input VAT)
 * - Exempt: 0% VAT (cannot claim input VAT)
 */

export interface VATClassification {
    category: 'standard' | 'zero-rated' | 'exempt';
    rate: number; // 0.075, 0, or 0
    canClaimInputVAT: boolean;
    actReference: string;
    reason?: string;
}

/**
 * Get VAT treatment for a simplified item category
 * This bridges ML classification (what IS it) with VAT rules (how is it taxed)
 */
export function getCategoryVATTreatment(category: string): VATClassification {
    const normalized = category.toLowerCase().trim();
    
    // Zero-rated categories (0% VAT, can claim input)
    const zeroRated = ['food', 'medical', 'education', 'agriculture', 'export'];
    if (zeroRated.includes(normalized)) {
        return {
            category: 'zero-rated',
            rate: 0,
            canClaimInputVAT: true,
            actReference: 'Section 187 & Thirteenth Schedule',
            reason: `${normalized} is zero-rated under Tax Act 2025`
        };
    }
    
    // Exempt categories (0% VAT, cannot claim input)
    const exempt = ['rent', 'financial', 'insurance', 'transport'];
    if (exempt.includes(normalized)) {
        return {
            category: 'exempt',
            rate: 0,
            canClaimInputVAT: false,
            actReference: 'Section 186',
            reason: `${normalized} is exempt under Tax Act 2025`
        };
    }
    
    // Standard rate for everything else (7.5% VAT)
    return {
        category: 'standard',
        rate: 0.075,
        canClaimInputVAT: true,
        actReference: 'Section 148',
        reason: 'Standard VAT rate applies'
    };
}

export class SupplyClassificationService {
    /**
     * Classify a supply for VAT purposes
     */
    classify(itemDescription: string, category?: string): VATClassification {
        const normalized = itemDescription.toLowerCase().trim();

        // Check zero-rated first (Section 187)
        if (this.isZeroRated(normalized, category)) {
            return {
                category: 'zero-rated',
                rate: 0,
                canClaimInputVAT: true,
                actReference: 'Section 187 & Thirteenth Schedule',
                reason: 'Basic food, medical, education, or export'
            };
        }

        // Check exempt (Section 186)
        if (this.isExempt(normalized, category)) {
            return {
                category: 'exempt',
                rate: 0,
                canClaimInputVAT: false,
                actReference: 'Section 186',
                reason: 'Land, buildings, financial services, or transport'
            };
        }

        // Default: Standard rate (Section 148)
        return {
            category: 'standard',
            rate: 0.075,
            canClaimInputVAT: true,
            actReference: 'Section 148'
        };
    }

    /**
     * Check if supply is zero-rated (0% VAT, can claim input)
     * Section 187 & Thirteenth Schedule
     */
    private isZeroRated(item: string, category?: string): boolean {
        // Category-based classification (fastest) - using simplified categories
        if (category) {
            const zeroRatedCategories = ['food', 'medical', 'education', 'export', 'agriculture'];
            const normalizedCat = category.toLowerCase()
                .replace(/_zero_rated$/, '')
                .replace(/_exempt$/, '')
                .replace(/_standard$/, '');
            if (zeroRatedCategories.includes(normalizedCat)) {
                return true;
            }
        }

        // Keyword-based classification
        const zeroRatedKeywords = {
            // Food items (Thirteenth Schedule)
            food: [
                'rice', 'bread', 'fish', 'yam', 'cassava', 'vegetable', 'fruit',
                'flour', 'beans', 'garri', 'millet', 'sorghum', 'maize',
                'cooking oil', 'vegetable oil', 'palm oil',
                'salt', 'water', 'milk', 'eggs',
                'tomato', 'pepper', 'onion', 'potato'
            ],

            // Medical/Pharmaceutical (Section 187)
            medical: [
                'medicine', 'drug', 'pharmaceutical', 'vaccine', 'injection',
                'tablet', 'capsule', 'syrup', 'antibiotic',
                'medical equipment', 'surgical', 'hospital bed',
                'x-ray', 'ultrasound', 'mri', 'ct scan',
                'medical service', 'consultation', 'surgery', 'treatment'
            ],

            // Education (Section 187)
            education: [
                'textbook', 'notebook', 'educational material', 'learning material',
                'tuition', 'school fee', 'course', 'training',
                'university', 'college', 'primary school', 'secondary school',
                'nursery', 'kindergarten', 'lecture', 'seminar'
            ],

            // Agriculture (Thirteenth Schedule)
            agriculture: [
                'fertilizer', 'pesticide', 'herbicide', 'insecticide',
                'seed', 'seedling', 'animal feed', 'poultry feed', 'livestock feed',
                'cattle', 'goat', 'sheep', 'chicken', 'pig',
                'tractor', 'plough', 'irrigation', 'veterinary'
            ],

            // Exports (Section 187)
            exports: [
                'export', 'shipped abroad', 'foreign customer', 'overseas',
                'international shipment', 'export service'
            ],

            // Other zero-rated
            other: [
                'electricity', 'power generation', 'transmission',
                'electric vehicle', 'ev battery'
            ]
        };

        // Check all keyword categories
        for (const keywords of Object.values(zeroRatedKeywords)) {
            if (keywords.some(kw => item.includes(kw))) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if supply is exempt (0% VAT, cannot claim input)
     * Section 186
     */
    private isExempt(item: string, category?: string): boolean {
        // Category-based classification - using simplified categories
        if (category) {
            const exemptCategories = ['rent', 'land', 'financial', 'transport', 'insurance'];
            const normalizedCat = category.toLowerCase()
                .replace(/_zero_rated$/, '')
                .replace(/_exempt$/, '')
                .replace(/_standard$/, '');
            if (exemptCategories.includes(normalizedCat)) {
                return true;
            }
        }

        const exemptKeywords = [
            // Land and buildings (Section 186)
            'rent', 'lease', 'land', 'building', 'property', 'real estate',
            'office space', 'warehouse', 'apartment', 'house',

            // Financial services (Section 186)
            'loan', 'mortgage', 'interest', 'credit', 'debit',
            'bank charge', 'transaction fee', 'insurance premium',
            'securities', 'bond', 'stock', 'shares', 'dividend',

            // Transport (Section 186)
            'bus fare', 'taxi fare', 'passenger transport',
            'road transport', 'public transport', 'shuttle',

            // Other exempt
            'government license', 'government fee',
            'diplomatic', 'educational play', 'performance art',
            'petroleum', 'crude oil', 'gas export'
        ];

        return exemptKeywords.some(kw => item.includes(kw));
    }

    /**
     * Get detailed classification breakdown
     */
    getDetailedClassification(items: Array<{ description: string, amount: number, category?: string }>) {
        const breakdown = {
            standard: { items: [], subtotal: 0, vat: 0 },
            zeroRated: { items: [], subtotal: 0, vat: 0 },
            exempt: { items: [], subtotal: 0, vat: 0 }
        };

        items.forEach(item => {
            const classification = this.classify(item.description, item.category);
            const vat = item.amount * classification.rate;

            const entry = {
                description: item.description,
                amount: item.amount,
                vat,
                classification: classification.category
            };

            if (classification.category === 'zero-rated') {
                breakdown.zeroRated.items.push(entry);
                breakdown.zeroRated.subtotal += item.amount;
                breakdown.zeroRated.vat += vat;
            } else if (classification.category === 'exempt') {
                breakdown.exempt.items.push(entry);
                breakdown.exempt.subtotal += item.amount;
                breakdown.exempt.vat += vat;
            } else {
                breakdown.standard.items.push(entry);
                breakdown.standard.subtotal += item.amount;
                breakdown.standard.vat += vat;
            }
        });

        return breakdown;
    }
}

export const supplyClassificationService = new SupplyClassificationService();
