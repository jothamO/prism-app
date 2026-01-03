/**
 * Bank Statement Extractor
 * Uses Google Cloud Vision for OCR + Claude Haiku for structured extraction
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../../utils/logger';
import { ocrService } from '../../../services/ocr-service';
import { config } from '../../../config';

export interface ExtractedTransaction {
    date: string;
    description: string;
    debit?: number;
    credit?: number;
    balance?: number;
    reference?: string;
}

export interface ExtractionResult {
    transactions: ExtractedTransaction[];
    bank?: string;
    accountNumber?: string;
    period?: string;
    ocrConfidence?: number;
}

export class BankStatementExtractor {
    constructor(private claude: Anthropic) { }

    /**
     * Extract transactions from bank statement document
     * Uses hybrid approach: Vision API for OCR, Claude for interpretation
     */
    async extract(documentUrl: string): Promise<ExtractedTransaction[]> {
        try {
            logger.info('[Extractor] Processing document', { documentUrl });

            // Get document content - prefer OCR if available
            const documentContent = await this.getDocumentContent(documentUrl);

            // Use Claude to extract structured transaction data
            const prompt = this.buildExtractionPrompt(documentContent.ocrConfidence);

            const response = await this.claude.messages.create({
                model: 'claude-3-5-haiku-20241022',
                max_tokens: 4000,
                messages: [
                    {
                        role: 'user',
                        content: documentContent.type === 'text'
                            ? [{ type: 'text' as const, text: `${prompt}\n\nDocument Content:\n${documentContent.data}` }]
                            : [
                                { type: 'text' as const, text: prompt },
                                {
                                    type: 'image' as const,
                                    source: {
                                        type: 'base64' as const,
                                        media_type: (documentContent.mediaType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                                        data: documentContent.data
                                    }
                                }
                            ]
                    }
                ]
            });

            // Parse response
            const content = response.content[0];
            if (content.type !== 'text') {
                throw new Error('Unexpected response type from Claude');
            }

            const transactions = this.parseExtractedData(content.text);

            logger.info('[Extractor] Extracted transactions', {
                count: transactions.length,
                ocrUsed: documentContent.ocrUsed,
                ocrConfidence: documentContent.ocrConfidence
            });

            return transactions;
        } catch (error) {
            logger.error('[Extractor] Extraction failed:', error);
            throw error;
        }
    }

    /**
     * Build extraction prompt for Claude
     */
    private buildExtractionPrompt(ocrConfidence?: number): string {
        const confidenceNote = ocrConfidence !== undefined
            ? `\nNote: This text was extracted via OCR with ${(ocrConfidence * 100).toFixed(0)}% confidence. Account for potential OCR errors.`
            : '';

        return `
You are extracting transaction data from a Nigerian bank statement.${confidenceNote}

Extract ALL transactions in the statement and return them as a JSON array.

For each transaction, extract:
- date: YYYY-MM-DD format
- description: Full transaction description/narration
- debit: Amount debited (if applicable)
- credit: Amount credited (if applicable)
- balance: Account balance after transaction
- reference: Transaction reference number (if visible)

Important:
- Convert all amounts to numbers (remove commas, currency symbols)
- Handle Nigerian bank formats (GTBank, Access, Zenith, First Bank, UBA, etc.)
- Preserve exact description text (important for classification)
- If a field is not available, omit it or use null

Return ONLY valid JSON in this exact format:
{
  "bank": "Bank Name",
  "accountNumber": "1234567890",
  "period": "Month Year",
  "transactions": [
    {
      "date": "2025-12-01",
      "description": "Transfer to Chidi",
      "debit": 50000,
      "balance": 450000,
      "reference": "TRF123456"
    },
    {
      "date": "2025-12-05",
      "description": "POS TERMINAL PAYMENT",
      "credit": 125000,
      "balance": 575000
    }
  ]
}

Extract the data now.
`.trim();
    }

    /**
     * Get document content using OCR (preferred) or fallback to Claude vision
     */
    private async getDocumentContent(url: string): Promise<{
        type: 'image' | 'text';
        data: string;
        mediaType?: string;
        ocrUsed?: boolean;
        ocrConfidence?: number;
    }> {
        try {
            // Download the image first
            const { buffer, mediaType } = await ocrService.downloadImage(url);

            // Try Google Cloud Vision OCR if available
            if (ocrService.isAvailable() && config.vision.enabled) {
                try {
                    logger.info('[Extractor] Using Google Cloud Vision OCR');
                    const ocrResult = await ocrService.extractDocumentText(buffer);

                    if (ocrResult.text && ocrResult.text.length > 50) {
                        logger.info('[Extractor] OCR successful', {
                            textLength: ocrResult.text.length,
                            confidence: ocrResult.confidence
                        });

                        return {
                            type: 'text',
                            data: ocrResult.text,
                            ocrUsed: true,
                            ocrConfidence: ocrResult.confidence
                        };
                    }

                    logger.warn('[Extractor] OCR returned insufficient text, falling back to vision');
                } catch (ocrError) {
                    logger.error('[Extractor] OCR failed, falling back to vision:', ocrError);
                }
            } else {
                logger.info('[Extractor] OCR not available, using Claude vision');
            }

            // Fallback to Claude's vision capability
            return {
                type: 'image',
                data: buffer.toString('base64'),
                mediaType,
                ocrUsed: false
            };
        } catch (error) {
            logger.error('[Extractor] Failed to get document content:', error);
            throw error;
        }
    }

    /**
     * Parse Claude's JSON response into transactions
     */
    private parseExtractedData(response: string): ExtractedTransaction[] {
        try {
            // Extract JSON from response (Claude might include explanation)
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            const parsed = JSON.parse(jsonMatch[0]);

            if (!parsed.transactions || !Array.isArray(parsed.transactions)) {
                throw new Error('Invalid transaction format');
            }

            return parsed.transactions.map((txn: any) => ({
                date: txn.date,
                description: txn.description,
                debit: txn.debit || undefined,
                credit: txn.credit || undefined,
                balance: txn.balance || undefined,
                reference: txn.reference || undefined
            }));
        } catch (error) {
            logger.error('[Extractor] Failed to parse response:', error);
            throw new Error('Failed to parse extracted data');
        }
    }
}
