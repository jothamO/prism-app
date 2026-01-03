/**
 * Receipt Processing Skill
 * Handles receipt OCR and categorization with feedback collection
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../utils/logger';
import { config, supabase } from '../../config';
import { Session as SessionContext } from '../../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';

export interface ExtractedReceipt {
    vendor: string;
    amount: number;
    date: string;
    category: string;
    vatAmount?: number;
    confidence: number;
    items?: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        total: number;
    }>;
}

// Category definitions for Nigerian business expenses
const EXPENSE_CATEGORIES = {
    'office_supplies': { label: 'Office Supplies', vatDeductible: true },
    'equipment': { label: 'Equipment', vatDeductible: true },
    'utilities': { label: 'Utilities', vatDeductible: true },
    'transport': { label: 'Transport', vatDeductible: false },
    'fuel': { label: 'Fuel & Transport', vatDeductible: true },
    'meals': { label: 'Meals & Entertainment', vatDeductible: false },
    'professional_fees': { label: 'Professional Fees', vatDeductible: true },
    'subscriptions': { label: 'Subscriptions', vatDeductible: true },
    'inventory': { label: 'Inventory/Stock', vatDeductible: true },
    'other': { label: 'Other', vatDeductible: true }
};

export class ReceiptProcessingSkill {
    private anthropic: Anthropic;

    constructor() {
        this.anthropic = new Anthropic({
            apiKey: config.anthropic.apiKey
        });
    }

    /**
     * Format currency
     */
    private formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
    }

    /**
     * Handle receipt processing request
     */
    async handle(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            logger.info('[Receipt Skill] Processing request', { userId: context.userId });

            // Check if we have a receipt image URL
            const receiptUrl = context.metadata?.receiptUrl || context.metadata?.documentUrl;
            
            if (!receiptUrl) {
                return {
                    message: `📸 Receipt Processing\n\n` +
                        `Send me a photo of your receipt and I'll:\n` +
                        `• Extract vendor and amount\n` +
                        `• Categorize the expense\n` +
                        `• Calculate VAT (if applicable)\n` +
                        `• Store for tax records\n\n` +
                        `💡 Tip: Ensure the receipt is clear and well-lit.`,
                    metadata: { skill: 'receipt-processing', status: 'awaiting_receipt' }
                };
            }

            // Process the receipt
            const extracted = await this.extractReceiptData(receiptUrl);

            if (!extracted) {
                return {
                    message: `❌ Could not read receipt clearly.\n\n` +
                        `Please try again with:\n` +
                        `• Better lighting\n` +
                        `• Clearer image\n` +
                        `• Full receipt visible`,
                    metadata: { skill: 'receipt-processing', status: 'failed' }
                };
            }

            // Store receipt data for feedback loop
            await this.storeReceiptForFeedback(context.userId, extracted, receiptUrl);

            const categoryInfo = EXPENSE_CATEGORIES[extracted.category as keyof typeof EXPENSE_CATEGORIES] 
                || EXPENSE_CATEGORIES.other;

            return {
                message: `📸 Receipt Extracted\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `🏪 Vendor: ${extracted.vendor}\n` +
                    `💰 Amount: ${this.formatCurrency(extracted.amount)}\n` +
                    `📅 Date: ${extracted.date}\n` +
                    `📁 Category: ${categoryInfo.label}\n` +
                    `${extracted.vatAmount ? `💹 VAT: ${this.formatCurrency(extracted.vatAmount)}\n` : ''}` +
                    `📊 Confidence: ${(extracted.confidence * 100).toFixed(0)}%\n\n` +
                    `${categoryInfo.vatDeductible ? '✅ VAT Deductible' : '⚠️ Not VAT Deductible'}\n\n` +
                    `Is this correct?`,
                buttons: [
                    [
                        { text: '✅ Correct', callback_data: 'receipt_confirm' },
                        { text: '❌ Wrong Category', callback_data: 'receipt_recategorize' }
                    ],
                    [
                        { text: '✏️ Edit Amount', callback_data: 'receipt_edit_amount' },
                        { text: '🗑️ Discard', callback_data: 'receipt_discard' }
                    ]
                ],
                metadata: {
                    skill: 'receipt-processing',
                    status: 'extracted',
                    extracted,
                    receiptUrl
                }
            };
        } catch (error) {
            logger.error('[Receipt Skill] Error:', error);
            return {
                message: "❌ Failed to process receipt. Please try again.",
                metadata: { skill: 'receipt-processing', error: (error as Error).message }
            };
        }
    }

    /**
     * Extract data from receipt image using OCR + AI
     */
    private async extractReceiptData(imageUrl: string): Promise<ExtractedReceipt | null> {
        try {
            // Import OCR service
            const { ocrService } = await import('../../services/ocr-service');

            // Download image
            const { buffer, mediaType } = await ocrService.downloadImage(imageUrl);
            const base64 = buffer.toString('base64');

            let extractedText: string | null = null;
            let ocrConfidence = 0;

            // Try Google Cloud Vision OCR if available
            if (ocrService.isAvailable() && config.vision.enabled) {
                try {
                    logger.info('[Receipt Skill] Using Google Cloud Vision OCR');
                    const ocrResult = await ocrService.extractReceiptText(buffer);

                    if (ocrResult.text && ocrResult.text.length > 20) {
                        extractedText = ocrResult.text;
                        ocrConfidence = ocrResult.confidence;
                        logger.info('[Receipt Skill] OCR successful', {
                            textLength: ocrResult.text.length,
                            confidence: ocrResult.confidence
                        });
                    }
                } catch (ocrError) {
                    logger.error('[Receipt Skill] OCR failed, falling back to vision:', ocrError);
                }
            }

            // Build AI request - use text if OCR succeeded, otherwise use image
            const promptText = `Extract receipt information from this ${extractedText ? 'text' : 'image'}.
${extractedText ? `\nOCR Extracted Text (${(ocrConfidence * 100).toFixed(0)}% confidence):\n${extractedText}\n` : ''}
Return a JSON object with:
{
  "vendor": "store/business name",
  "amount": total amount as number,
  "date": "YYYY-MM-DD",
  "category": one of [office_supplies, equipment, utilities, transport, fuel, meals, professional_fees, subscriptions, inventory, other],
  "vatAmount": VAT amount if shown (number or null),
  "confidence": your confidence 0-1,
  "items": [{"description": "", "quantity": 1, "unitPrice": 0, "total": 0}] if line items visible
}

If Nigerian receipt, look for:
- VAT @ 7.5%
- Common vendors: Shoprite, Spar, Total, NNPC, MTN, etc.

Return ONLY the JSON, no other text.`;

            const aiResponse = await this.anthropic.messages.create({
                model: config.anthropic.model,
                max_tokens: 1024,
                messages: [{
                    role: 'user',
                    content: extractedText
                        ? [{ type: 'text' as const, text: promptText }]
                        : [
                            {
                                type: 'image' as const,
                                source: {
                                    type: 'base64' as const,
                                    media_type: (mediaType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                                    data: base64
                                }
                            },
                            { type: 'text' as const, text: promptText }
                        ]
                }]
            });

            const textContent = aiResponse.content.find(c => c.type === 'text');
            if (!textContent || textContent.type !== 'text') {
                return null;
            }

            // Parse JSON from response
            const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                return null;
            }

            const parsed = JSON.parse(jsonMatch[0]);

            // Combine OCR confidence with AI confidence
            const finalConfidence = extractedText
                ? (ocrConfidence * 0.4 + (parsed.confidence || 0.5) * 0.6)
                : (parsed.confidence || 0.5);

            return {
                vendor: parsed.vendor || 'Unknown Vendor',
                amount: parsed.amount || 0,
                date: parsed.date || new Date().toISOString().split('T')[0],
                category: parsed.category || 'other',
                vatAmount: parsed.vatAmount,
                confidence: finalConfidence,
                items: parsed.items
            };
        } catch (error) {
            logger.error('[Receipt Skill] Extraction error:', error);
            return null;
        }
    }

    /**
     * Store receipt for feedback/ML training
     */
    private async storeReceiptForFeedback(
        userId: string,
        extracted: ExtractedReceipt,
        receiptUrl: string
    ): Promise<void> {
        try {
            await supabase.from('receipts').insert({
                user_id: userId,
                image_url: receiptUrl,
                merchant: extracted.vendor,
                amount: extracted.amount,
                date: extracted.date,
                category: extracted.category,
                confidence: extracted.confidence,
                confirmed: false
            });
        } catch (error) {
            logger.error('[Receipt Skill] Failed to store receipt:', error);
        }
    }

    /**
     * Handle user feedback on extraction
     */
    async handleFeedback(
        userId: string,
        receiptId: string,
        feedback: 'confirm' | 'reject',
        correction?: Partial<ExtractedReceipt>
    ): Promise<void> {
        try {
            if (feedback === 'confirm') {
                await supabase.from('receipts')
                    .update({ confirmed: true })
                    .eq('id', receiptId);
            } else if (correction) {
                // Store feedback for ML training
                await supabase.from('ai_feedback').insert({
                    user_id: userId,
                    entity_type: 'receipt',
                    entity_id: receiptId,
                    correction_type: 'category',
                    ai_prediction: { category: correction.category },
                    user_correction: correction,
                    item_description: correction.vendor || ''
                });
            }
        } catch (error) {
            logger.error('[Receipt Skill] Failed to store feedback:', error);
        }
    }
}

export const receiptProcessingSkill = new ReceiptProcessingSkill();
