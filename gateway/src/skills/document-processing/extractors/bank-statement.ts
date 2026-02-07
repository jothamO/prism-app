/**
 * Bank Statement Extractor
 * Uses Google Cloud Vision for OCR + Claude Haiku for structured extraction
 * Supports both text-based and scanned PDFs without native dependencies
 */

import { aiClient, AIMessage, MessageContent } from '../../../utils/ai-client';
import { logger } from '../../../utils/logger';
import { ocrService } from '../../../services/ocr-service';
import { config } from '../../../config';
import { isPDF, extractTextFromPDF } from '../../../services/pdf-converter';
import { GhostService } from '../../../services/ghost-service';

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
    fileHash?: string;
}

export class BankStatementExtractor {
    constructor() { }

    /**
     * Extract transactions from bank statement document
     * Uses hybrid approach: Vision API for OCR, Claude for interpretation
     * Now supports multi-page PDFs
     */
    async extract(documentUrl: string): Promise<ExtractionResult> {
        try {
            logger.info('[Extractor] Processing document', { documentUrl });

            // Get document content - prefer OCR if available
            const documentContent = await this.getDocumentContent(documentUrl);
            const fileHash = documentContent.fileHash;

            // Handle multi-page PDF with Claude vision (when OCR failed)
            if (documentContent.pageImages && documentContent.pageImages.length > 0 && !documentContent.data) {
                const transactions = await this.extractFromMultiplePages(documentContent.pageImages);
                return { transactions, fileHash };
            }

            // Use Claude to extract structured transaction data
            const prompt = this.buildExtractionPrompt(documentContent.ocrConfidence);

            const messages: AIMessage[] = [
                {
                    role: 'user',
                    content: documentContent.type === 'text'
                        ? `${prompt}\n\nDocument Content:\n${documentContent.data}`
                        : [
                            { type: 'text', text: prompt },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:${documentContent.mediaType || 'image/jpeg'};base64,${documentContent.data}`
                                }
                            }
                        ]
                }
            ];

            const responseText = await aiClient.chat({
                tier: 'reasoning',
                maxTokens: 16000,
                messages
            });

            const transactions = this.parseExtractedData(responseText);

            // Verify extraction quality
            const debits = transactions.filter(t => t.debit && t.debit > 0);
            const credits = transactions.filter(t => t.credit && t.credit > 0);

            logger.info('[Extractor] Extracted transactions', {
                count: transactions.length,
                debits: debits.length,
                credits: credits.length,
                ocrUsed: documentContent.ocrUsed,
                ocrConfidence: documentContent.ocrConfidence
            });

            if (debits.length === 0 && credits.length > 5) {
                logger.warn('[Extractor] WARNING: No debit transactions found - may indicate extraction issue');
            }

            return { transactions, fileHash };
        } catch (error) {
            logger.error('[Extractor] Extraction failed:', error);
            throw error;
        }
    }

    /**
     * Extract transactions from multiple PDF page images using Claude vision
     */
    private async extractFromMultiplePages(pageImages: string[]): Promise<ExtractedTransaction[]> {
        logger.info('[Extractor] Processing multi-page PDF with Claude vision', {
            pageCount: pageImages.length
        });

        const allTransactions: ExtractedTransaction[] = [];
        const prompt = this.buildExtractionPrompt();

        // Process pages in batches (Claude can handle multiple images per request)
        const batchSize = 5; // Process 5 pages at a time to stay within limits

        for (let i = 0; i < pageImages.length; i += batchSize) {
            const batch = pageImages.slice(i, i + batchSize);

            logger.info('[Extractor] Processing page batch', {
                startPage: i + 1,
                endPage: i + batch.length
            });

            try {
                // Build multimodal message for AIClient
                const messageContent: MessageContent[] = [
                    { type: 'text', text: `${prompt}\n\nThese are pages ${i + 1} to ${i + batch.length} of a bank statement. Extract all transactions from all pages.` }
                ];

                for (const pageImage of batch) {
                    messageContent.push({
                        type: 'image_url',
                        image_url: {
                            url: `data:image/png;base64,${pageImage}`
                        }
                    });
                }

                const responseText = await aiClient.chat({
                    tier: 'reasoning',
                    maxTokens: 64000,
                    messages: [{ role: 'user', content: messageContent }]
                });

                if (responseText) {
                    const batchTransactions = this.parseExtractedData(responseText);
                    allTransactions.push(...batchTransactions);

                    logger.info('[Extractor] Batch processed', {
                        pagesProcessed: batch.length,
                        transactionsFound: batchTransactions.length
                    });
                }
            } catch (batchError) {
                logger.error('[Extractor] Batch processing failed', {
                    startPage: i + 1,
                    error: batchError
                });
                // Continue with next batch
            }
        }

        // Deduplicate transactions (same date + description + amount)
        const deduplicated = this.deduplicateTransactions(allTransactions);

        logger.info('[Extractor] Multi-page extraction complete', {
            totalTransactions: allTransactions.length,
            afterDeduplication: deduplicated.length
        });

        return deduplicated;
    }

    /**
     * Remove duplicate transactions from multi-page extraction
     */
    private deduplicateTransactions(transactions: ExtractedTransaction[]): ExtractedTransaction[] {
        const seen = new Map<string, ExtractedTransaction>();

        for (const txn of transactions) {
            const key = `${txn.date}|${txn.description}|${txn.debit || ''}|${txn.credit || ''}`;
            if (!seen.has(key)) {
                seen.set(key, txn);
            }
        }

        return Array.from(seen.values());
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

CRITICAL: Extract ALL transactions - both CREDITS and DEBITS. Do not skip any rows.

Nigerian bank statements typically show:
- DEBITS: Money going out (withdrawals, transfers, payments, charges, fees, airtime, POS purchases)
- CREDITS: Money coming in (deposits, transfers received, refunds)

For each transaction, extract:
- date: YYYY-MM-DD format
- description: Full transaction description/narration  
- debit: Amount debited (money OUT) - look for "DR" column or amounts in debit column
- credit: Amount credited (money IN) - look for "CR" column or amounts in credit column
- balance: Account balance after transaction
- reference: Transaction reference number (if visible)

Nigerian bank charge patterns to look for (these are DEBITS):
- SMS Alert Fee, SMS Notification
- VAT on fees
- Stamp Duty
- EMTL (Electronic Money Transfer Levy) - usually ₦50
- Account maintenance fee
- Card maintenance fee
- Transfer fees
- POS charges

Common DEBIT transaction patterns:
- "Transfer to [NAME]" - outgoing transfer
- "ATM WDL" or "ATM Withdrawal" - ATM withdrawal  
- "POS" - Point of sale purchase
- "Airtime" - mobile recharge
- "Third party merchant" - third party payments
- Bill payments
- "NIP" transfers out

Common CREDIT transaction patterns:
- "Transfer from [NAME]" - incoming transfer
- "Salary" - salary credit
- "Reversal" - refund

Important:
- Convert all amounts to numbers (remove commas, currency symbols)
- Handle Nigerian bank formats (GTBank, Access, Zenith, First Bank, UBA, Fidelity, etc.)
- Preserve exact description text (important for classification)
- If a field is not available, omit it or use null

IMPORTANT: Count your transactions. A typical monthly statement has 20-50 transactions.
If you only found 10-15, you may have missed the debit transactions. Go back and check!

Return ONLY valid JSON in this exact format:
{
  "bank": "Bank Name",
  "accountNumber": "1234567890",
  "period": "Month Year",
  "transactionCount": {"debits": 31, "credits": 11},
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
      "description": "Salary Credit",
      "credit": 125000,
      "balance": 575000
    }
  ]
}

Extract ALL transactions now - ensure you capture every debit AND credit row.
`.trim();
    }

    /**
     * Get document content using OCR (preferred) or fallback to Claude vision
     * Now supports PDF files by converting them to images first
     */
    private async getDocumentContent(url: string): Promise<{
        type: 'image' | 'text';
        data: string;
        mediaType?: string;
        ocrUsed?: boolean;
        ocrConfidence?: number;
        pageImages?: string[]; // For multi-page PDFs
        fileHash?: string;
    }> {
        try {
            // Download the document first
            const { buffer, mediaType } = await ocrService.downloadImage(url);
            const fileHash = GhostService.calculateHash(buffer);

            // Check if it's a PDF - if so, convert to images
            if (isPDF(buffer, mediaType)) {
                logger.info('[Extractor] PDF detected, converting to images');
                const result = await this.processPDFDocument(buffer);
                return { ...result, fileHash };
            }

            // For regular images, use existing OCR flow
            const result = await this.processImageDocument(buffer, mediaType);
            return { ...result, fileHash };
        } catch (error) {
            logger.error('[Extractor] Failed to get document content:', error);
            throw error;
        }
    }

    /**
     * Process PDF document using hybrid approach:
     * 1. First try extracting text directly (for text-based PDFs)
     * 2. If that fails, use Google Vision's native PDF OCR
     * 3. As last resort, report as unprocessable
     * 
     * This approach eliminates the need for the 'canvas' package
     */
    private async processPDFDocument(pdfBuffer: Buffer): Promise<{
        type: 'text';
        data: string;
        ocrUsed: boolean;
        ocrConfidence: number;
        pageImages?: string[];
    }> {
        try {
            // Step 1: Try direct text extraction (works for text-based PDFs)
            logger.info('[Extractor] Attempting PDF text extraction');

            try {
                const textResult = await extractTextFromPDF(pdfBuffer, { maxPages: 50 });

                if (textResult.isTextBased && textResult.text.length > 100) {
                    logger.info('[Extractor] PDF is text-based, extracted directly', {
                        pageCount: textResult.pageCount,
                        textLength: textResult.text.length
                    });

                    return {
                        type: 'text',
                        data: textResult.text,
                        ocrUsed: false,
                        ocrConfidence: 0.95 // High confidence for native text extraction
                    };
                }

                logger.info('[Extractor] PDF appears to be scanned/image-based', {
                    extractedChars: textResult.text.length,
                    isTextBased: textResult.isTextBased
                });
            } catch (textError) {
                logger.warn('[Extractor] PDF text extraction failed:', textError);
            }

            // Step 2: Use Google Vision's native PDF processing
            if (ocrService.isAvailable() && config.vision.enabled) {
                try {
                    logger.info('[Extractor] Using Google Vision PDF OCR');
                    const ocrResult = await ocrService.processPDF(pdfBuffer, 5);

                    if (ocrResult.text && ocrResult.text.length > 50) {
                        logger.info('[Extractor] Google Vision PDF OCR successful', {
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

                    logger.warn('[Extractor] Vision API returned insufficient text');
                } catch (visionError) {
                    logger.error('[Extractor] Google Vision PDF OCR failed:', visionError);
                }
            } else {
                logger.warn('[Extractor] Google Vision not available for PDF OCR');
            }

            // Step 3: No canvas fallback - report the issue
            throw new Error('Unable to process PDF: text extraction failed and Google Vision OCR unavailable or insufficient');

        } catch (error) {
            logger.error('[Extractor] PDF processing failed:', error);
            throw error;
        }
    }

    /**
     * Process regular image document using existing OCR flow
     */
    private async processImageDocument(buffer: Buffer, mediaType: string): Promise<{
        type: 'image' | 'text';
        data: string;
        mediaType?: string;
        ocrUsed?: boolean;
        ocrConfidence?: number;
    }> {
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
