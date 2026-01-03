/**
 * PDF Converter Service
 * Extracts text from PDF documents without native dependencies
 */

import { logger } from '../utils/logger';

export interface PDFTextResult {
    text: string;
    pageTexts: string[];
    pageCount: number;
    isTextBased: boolean;
}

/**
 * Check if a buffer contains a PDF file
 */
export function isPDF(buffer: Buffer, mediaType?: string): boolean {
    // Check magic bytes for PDF: %PDF-
    if (buffer.length >= 5) {
        const magic = buffer.slice(0, 5).toString('ascii');
        if (magic === '%PDF-') {
            return true;
        }
    }
    
    // Also check media type
    if (mediaType) {
        return mediaType.toLowerCase() === 'application/pdf' || 
               mediaType.toLowerCase().includes('pdf');
    }
    
    return false;
}

/**
 * Extract text directly from PDF using pdfjs-dist
 * Works for text-based PDFs without needing image rendering
 */
export async function extractTextFromPDF(pdfBuffer: Buffer, options: {
    maxPages?: number;
} = {}): Promise<PDFTextResult> {
    const { maxPages = 50 } = options;
    
    try {
        logger.info('[PDF Converter] Starting PDF text extraction', {
            bufferSize: pdfBuffer.length,
            maxPages
        });

        // Dynamic import for pdfjs-dist (works in Node.js)
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        
        // Load PDF document
        const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(pdfBuffer),
            useSystemFonts: true,
            disableFontFace: true
        });
        
        const pdfDocument = await loadingTask.promise;
        const pageCount = Math.min(pdfDocument.numPages, maxPages);
        
        logger.info('[PDF Converter] PDF loaded', {
            totalPages: pdfDocument.numPages,
            processingPages: pageCount
        });

        const pageTexts: string[] = [];
        let totalCharCount = 0;

        for (let i = 1; i <= pageCount; i++) {
            try {
                const page = await pdfDocument.getPage(i);
                const textContent = await page.getTextContent();
                
                // Extract text from text content items
                const pageText = textContent.items
                    .filter((item: any) => 'str' in item)
                    .map((item: any) => item.str)
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                
                pageTexts.push(pageText);
                totalCharCount += pageText.length;
                
                logger.info('[PDF Converter] Page text extracted', {
                    pageNumber: i,
                    textLength: pageText.length
                });
            } catch (pageError) {
                logger.error('[PDF Converter] Failed to extract page text', {
                    pageNumber: i,
                    error: pageError
                });
                pageTexts.push(''); // Add empty string for failed pages
            }
        }

        const fullText = pageTexts.join('\n\n--- Page Break ---\n\n');
        
        // Heuristic: if we got substantial text, it's a text-based PDF
        // Bank statements typically have at least 500 chars per page
        const isTextBased = totalCharCount > 100 && (totalCharCount / pageCount) > 50;

        logger.info('[PDF Converter] Text extraction complete', {
            totalPagesProcessed: pageTexts.length,
            totalCharCount,
            isTextBased
        });

        return {
            text: fullText,
            pageTexts,
            pageCount: pageTexts.length,
            isTextBased
        };
    } catch (error) {
        logger.error('[PDF Converter] Text extraction failed:', error);
        throw new Error(`PDF text extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Get PDF page count without full extraction
 */
export async function getPDFPageCount(pdfBuffer: Buffer): Promise<number> {
    try {
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(pdfBuffer),
            useSystemFonts: true,
            disableFontFace: true
        });
        const pdfDocument = await loadingTask.promise;
        return pdfDocument.numPages;
    } catch (error) {
        logger.error('[PDF Converter] Failed to get page count:', error);
        return 0;
    }
}
