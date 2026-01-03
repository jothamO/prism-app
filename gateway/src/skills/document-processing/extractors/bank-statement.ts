/**
 * Bank Statement Extractor
 * Uses Google Cloud Vision for OCR + Claude Haiku for structured extraction
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../../utils/logger';
import { ocrService } from '../../../services/ocr-service';
import { config } from '../../../config';
import { isPDF, convertPDFToImages } from '../../../services/pdf-converter';

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
     * Now supports multi-page PDFs
     */
    async extract(documentUrl: string): Promise<ExtractedTransaction[]> {
        try {
            logger.info('[Extractor] Processing document', { documentUrl });

            // Get document content - prefer OCR if available
            const documentContent = await this.getDocumentContent(documentUrl);

            // Handle multi-page PDF with Claude vision (when OCR failed)
            if (documentContent.pageImages && documentContent.pageImages.length > 0 && !documentContent.data) {
                return await this.extractFromMultiplePages(documentContent.pageImages);
            }

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
                // Build content array with all images in batch
                const content: any[] = [
                    { type: 'text' as const, text: `${prompt}\n\nThese are pages ${i + 1} to ${i + batch.length} of a bank statement. Extract all transactions from all pages.` }
                ];
                
                for (const pageImage of batch) {
                    content.push({
                        type: 'image' as const,
                        source: {
                            type: 'base64' as const,
                            media_type: 'image/png' as const,
                            data: pageImage
                        }
                    });
                }

                const response = await this.claude.messages.create({
                    model: 'claude-3-5-haiku-20241022',
                    max_tokens: 4000,
                    messages: [{ role: 'user', content }]
                });

                const responseContent = response.content[0];
                if (responseContent.type === 'text') {
                    const batchTransactions = this.parseExtractedData(responseContent.text);
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
     * Now supports PDF files by converting them to images first
     */
    private async getDocumentContent(url: string): Promise<{
        type: 'image' | 'text';
        data: string;
        mediaType?: string;
        ocrUsed?: boolean;
        ocrConfidence?: number;
        pageImages?: string[]; // For multi-page PDFs
    }> {
        try {
            // Download the document first
            const { buffer, mediaType } = await ocrService.downloadImage(url);

            // Check if it's a PDF - if so, convert to images
            if (isPDF(buffer, mediaType)) {
                logger.info('[Extractor] PDF detected, converting to images');
                return await this.processPDFDocument(buffer);
            }

            // For regular images, use existing OCR flow
            return await this.processImageDocument(buffer, mediaType);
        } catch (error) {
            logger.error('[Extractor] Failed to get document content:', error);
            throw error;
        }
    }

    /**
     * Process PDF document by converting to images and running OCR on each page
     */
    private async processPDFDocument(pdfBuffer: Buffer): Promise<{
        type: 'text';
        data: string;
        ocrUsed: boolean;
        ocrConfidence: number;
        pageImages?: string[];
    }> {
        try {
            // Convert PDF pages to images
            const conversionResult = await convertPDFToImages(pdfBuffer, {
                scale: 2.0, // Higher resolution for better OCR
                maxPages: 50
            });

            if (conversionResult.pages.length === 0) {
                throw new Error('No pages could be extracted from PDF');
            }

            logger.info('[Extractor] PDF converted', {
                pageCount: conversionResult.pages.length
            });

            // If OCR is available, process each page
            if (ocrService.isAvailable() && config.vision.enabled) {
                const allTexts: string[] = [];
                let totalConfidence = 0;
                let confidenceCount = 0;

                for (const page of conversionResult.pages) {
                    try {
                        logger.info('[Extractor] OCR processing page', { pageNumber: page.pageNumber });
                        const ocrResult = await ocrService.extractDocumentText(page.imageBuffer);
                        
                        if (ocrResult.text && ocrResult.text.length > 10) {
                            allTexts.push(`--- Page ${page.pageNumber} ---\n${ocrResult.text}`);
                            totalConfidence += ocrResult.confidence;
                            confidenceCount++;
                        }
                    } catch (pageError) {
                        logger.error('[Extractor] OCR failed for page', {
                            pageNumber: page.pageNumber,
                            error: pageError
                        });
                        // Continue with other pages
                    }
                }

                if (allTexts.length > 0) {
                    const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0.85;
                    
                    logger.info('[Extractor] PDF OCR complete', {
                        pagesProcessed: allTexts.length,
                        totalTextLength: allTexts.join('\n').length,
                        avgConfidence
                    });

                    return {
                        type: 'text',
                        data: allTexts.join('\n\n'),
                        ocrUsed: true,
                        ocrConfidence: avgConfidence
                    };
                }
            }

            // Fallback: Return page images for Claude vision processing
            logger.info('[Extractor] Using Claude vision for PDF pages');
            const pageImages = conversionResult.pages.map(p => p.imageBuffer.toString('base64'));
            
            // For multi-page, we'll process each page and combine results
            // Return first page for now, but store all for multi-page handling
            return {
                type: 'text',
                data: '', // Will trigger multi-page vision processing
                ocrUsed: false,
                ocrConfidence: 0,
                pageImages
            };
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
