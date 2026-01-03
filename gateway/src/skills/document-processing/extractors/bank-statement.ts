/**
 * Bank Statement Extractor
 * Uses Claude Haiku 4.5 to extract transactions from PDF/image bank statements
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../../utils/logger';

export interface ExtractedTransaction {
    date: string;
    description: string;
    debit?: number;
    credit?: number;
    balance?: number;
    reference?: string;
}

export class BankStatementExtractor {
    constructor(private claude: Anthropic) { }

    /**
     * Extract transactions from bank statement document
     */
    async extract(documentUrl: string): Promise<ExtractedTransaction[]> {
        try {
            logger.info('[Extractor] Processing document', { documentUrl });

            // Download document (in production, this would handle PDFs/images)
            // For now, we'll use Claude's vision API for images or text extraction for PDFs
            const documentContent = await this.getDocumentContent(documentUrl);

            // Use Claude to extract structured transaction data
            const prompt = this.buildExtractionPrompt();

            const response = await this.claude.messages.create({
                model: 'claude-3-5-haiku-20241022',
                max_tokens: 4000,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: prompt
                            },
                            ...(documentContent.type === 'image' ? [{
                                type: 'image' as const,
                                source: {
                                    type: 'base64' as const,
                                    media_type: documentContent.mediaType,
                                    data: documentContent.data
                                }
                            }] : [{
                                type: 'text' as const,
                                text: `\n\nDocument Content:\n${documentContent.data}`
                            }])
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
                count: transactions.length
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
    private buildExtractionPrompt(): string {
        return `
You are extracting transaction data from a Nigerian bank statement.

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
     * Get document content (image or text)
     * In production, this would handle PDF parsing, OCR, etc.
     */
    private async getDocumentContent(url: string): Promise<{
        type: 'image' | 'text';
        data: string;
        mediaType?: string;
    }> {
        // TODO: Implement actual document download and processing
        // For now, return placeholder
        return {
            type: 'text',
            data: 'Sample bank statement content...'
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
