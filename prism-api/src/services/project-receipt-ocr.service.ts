/**
 * Project Receipt OCR Service
 * 
 * Combines OCR extraction with project receipt management.
 * Uses AI to extract vendor name, amount, and date from receipt images,
 * then matches with recorded expenses for verification.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// Initialize clients
const anthropic = new Anthropic();
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export interface ExtractedReceiptData {
  vendor_name: string | null;
  amount: number | null;
  date: string | null;
  description: string | null;
  raw_text?: string;
}

export interface ReceiptOCRResult {
  success: boolean;
  extractedData: ExtractedReceiptData;
  confidence: number;
  matchStatus: 'exact' | 'close' | 'partial' | 'no_match';
  matchedExpenseId?: string;
  matchConfidence?: number;
  warnings?: string[];
}

export interface MatchResult {
  matched: boolean;
  expenseId?: string;
  confidence: number;
  amountDifference?: number;
  vendorSimilarity?: number;
}

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  confidence: number;
}

class ProjectReceiptOCRService {
  private readonly AMOUNT_TOLERANCE = 0.05; // 5% tolerance for amount matching

  /**
   * Process receipt image and extract data using Claude Vision
   */
  async processReceiptImage(imageBuffer: Buffer): Promise<ReceiptOCRResult> {
    try {
      const base64Image = imageBuffer.toString('base64');
      const mediaType = this.detectImageType(imageBuffer);

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: `Analyze this receipt image and extract the following information. Return ONLY a valid JSON object with these exact fields:

{
  "vendor_name": "the business/vendor name",
  "amount": 0.00,
  "date": "YYYY-MM-DD",
  "description": "brief description of items purchased",
  "confidence": 0.0
}

Rules:
- amount must be a number (no currency symbols)
- date must be in YYYY-MM-DD format, use null if not visible
- confidence is a number between 0 and 1 indicating extraction quality
- If a field is not readable, use null
- For Nigerian receipts, look for NGN, ₦, or Naira amounts

Return ONLY the JSON, no other text.`,
              },
            ],
          },
        ],
      });

      // Extract JSON from response
      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const extractedJson = this.parseJsonResponse(content.text);
      const confidence = extractedJson.confidence || 0.5;

      return {
        success: true,
        extractedData: {
          vendor_name: extractedJson.vendor_name,
          amount: extractedJson.amount,
          date: extractedJson.date,
          description: extractedJson.description,
        },
        confidence,
        matchStatus: 'no_match', // Will be updated after matching
      };
    } catch (error) {
      console.error('[OCR] Error processing receipt:', error);
      return {
        success: false,
        extractedData: {
          vendor_name: null,
          amount: null,
          date: null,
          description: null,
        },
        confidence: 0,
        matchStatus: 'no_match',
        warnings: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Match extracted data with recorded project expenses
   */
  async matchWithExpense(
    projectId: string,
    extractedData: ExtractedReceiptData
  ): Promise<MatchResult> {
    if (!extractedData.amount) {
      return { matched: false, confidence: 0 };
    }

    // Get expenses for this project
    const { data: expenses, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_project_expense', true);

    if (error || !expenses || expenses.length === 0) {
      return { matched: false, confidence: 0 };
    }

    let bestMatch: MatchResult = { matched: false, confidence: 0 };

    for (const expense of expenses) {
      const amountMatch = this.matchAmounts(extractedData.amount, expense.amount);
      const vendorMatch = extractedData.vendor_name && expense.supplier_name
        ? this.calculateVendorSimilarity(extractedData.vendor_name, expense.supplier_name)
        : 0.5; // Neutral if no vendor to compare

      // Weighted confidence: 60% amount, 40% vendor
      const matchConfidence = (amountMatch.confidence * 0.6) + (vendorMatch * 0.4);

      if (matchConfidence > bestMatch.confidence) {
        bestMatch = {
          matched: amountMatch.matches || matchConfidence > 0.7,
          expenseId: expense.id,
          confidence: matchConfidence,
          amountDifference: Math.abs(extractedData.amount - expense.amount),
          vendorSimilarity: vendorMatch,
        };
      }
    }

    return bestMatch;
  }

  /**
   * Create verified receipt record with OCR data
   */
  async createVerifiedReceipt(
    projectId: string,
    expenseId: string | undefined,
    ocrResult: ReceiptOCRResult,
    receiptUrl: string
  ): Promise<any> {
    const receiptData = {
      project_id: projectId,
      expense_id: expenseId,
      receipt_url: receiptUrl,
      amount: ocrResult.extractedData.amount || 0,
      date: ocrResult.extractedData.date || new Date().toISOString().split('T')[0],
      vendor_name: ocrResult.extractedData.vendor_name,
      ocr_extracted_amount: ocrResult.extractedData.amount,
      ocr_extracted_vendor: ocrResult.extractedData.vendor_name,
      ocr_confidence: ocrResult.confidence,
      is_verified: ocrResult.matchStatus === 'exact' || ocrResult.matchStatus === 'close',
      verification_method: expenseId ? 'ocr_expense_match' : 'ocr_only',
      bank_match_confidence: ocrResult.matchConfidence,
      description: ocrResult.extractedData.description,
    };

    const { data: receipt, error } = await supabase
      .from('project_receipts')
      .insert(receiptData)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return receipt;
  }

  /**
   * Validate OCR extraction quality
   */
  validateExtraction(extractedData: ExtractedReceiptData): ValidationResult {
    const issues: string[] = [];
    let confidence = 1.0;

    if (!extractedData.amount || extractedData.amount <= 0) {
      issues.push('Amount not extracted or invalid');
      confidence -= 0.4;
    }

    if (!extractedData.vendor_name) {
      issues.push('Vendor name not extracted');
      confidence -= 0.2;
    }

    if (!extractedData.date) {
      issues.push('Date not extracted');
      confidence -= 0.2;
    }

    // Check for suspicious values
    if (extractedData.amount && extractedData.amount > 50000000) {
      issues.push('Amount seems unusually high (>₦50M)');
      confidence -= 0.3;
    }

    if (extractedData.amount && extractedData.amount < 100) {
      issues.push('Amount seems unusually low (<₦100)');
      confidence -= 0.2;
    }

    return {
      isValid: issues.length === 0,
      issues,
      confidence: Math.max(0, confidence),
    };
  }

  /**
   * Match amounts with tolerance
   */
  private matchAmounts(
    ocrAmount: number,
    recordedAmount: number
  ): { matches: boolean; confidence: number } {
    const difference = Math.abs(ocrAmount - recordedAmount);
    const percentDiff = difference / recordedAmount;

    return {
      matches: percentDiff <= this.AMOUNT_TOLERANCE,
      confidence: Math.max(0, 1 - percentDiff),
    };
  }

  /**
   * Calculate vendor name similarity using simple algorithm
   */
  private calculateVendorSimilarity(vendor1: string, vendor2: string): number {
    const s1 = vendor1.toLowerCase().trim();
    const s2 = vendor2.toLowerCase().trim();

    if (s1 === s2) return 1.0;
    if (s1.includes(s2) || s2.includes(s1)) return 0.8;

    // Calculate Jaccard similarity of words
    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Detect image type from buffer
   */
  private detectImageType(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
    const header = buffer.slice(0, 4).toString('hex');

    if (header.startsWith('89504e47')) return 'image/png';
    if (header.startsWith('47494638')) return 'image/gif';
    if (header.startsWith('52494646')) return 'image/webp';
    return 'image/jpeg'; // Default to JPEG
  }

  /**
   * Parse JSON response from Claude, handling potential markdown wrapping
   */
  private parseJsonResponse(text: string): any {
    // Remove markdown code blocks if present
    let jsonStr = text.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }

    return JSON.parse(jsonStr.trim());
  }
}

export const projectReceiptOCRService = new ProjectReceiptOCRService();
