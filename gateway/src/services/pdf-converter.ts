/**
 * PDF Converter Service
 * Converts PDF documents to images for OCR processing
 */

import { logger } from '../utils/logger';

export interface PDFPage {
    pageNumber: number;
    imageBuffer: Buffer;
    width: number;
    height: number;
}

export interface PDFConversionResult {
    pages: PDFPage[];
    pageCount: number;
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
 * Convert PDF buffer to array of PNG images using pdf-lib and canvas
 * This is a server-side implementation for Node.js
 */
export async function convertPDFToImages(pdfBuffer: Buffer, options: {
    scale?: number;
    maxPages?: number;
} = {}): Promise<PDFConversionResult> {
    const { scale = 2.0, maxPages = 50 } = options;
    
    try {
        logger.info('[PDF Converter] Starting PDF conversion', {
            bufferSize: pdfBuffer.length,
            scale,
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

        const pages: PDFPage[] = [];

        // Import canvas for Node.js rendering
        const { createCanvas } = await import('canvas');

        for (let i = 1; i <= pageCount; i++) {
            try {
                const page = await pdfDocument.getPage(i);
                const viewport = page.getViewport({ scale });
                
                // Create canvas for rendering
                const canvas = createCanvas(viewport.width, viewport.height);
                const context = canvas.getContext('2d');
                
                // Render PDF page to canvas
                await page.render({
                    canvasContext: context as any,
                    viewport: viewport
                }).promise;
                
                // Convert canvas to PNG buffer
                const pngBuffer = canvas.toBuffer('image/png');
                
                pages.push({
                    pageNumber: i,
                    imageBuffer: pngBuffer,
                    width: viewport.width,
                    height: viewport.height
                });
                
                logger.info('[PDF Converter] Page converted', {
                    pageNumber: i,
                    width: viewport.width,
                    height: viewport.height,
                    imageSize: pngBuffer.length
                });
            } catch (pageError) {
                logger.error('[PDF Converter] Failed to convert page', {
                    pageNumber: i,
                    error: pageError
                });
                // Continue with other pages
            }
        }

        logger.info('[PDF Converter] Conversion complete', {
            totalPagesConverted: pages.length
        });

        return {
            pages,
            pageCount: pages.length
        };
    } catch (error) {
        logger.error('[PDF Converter] Conversion failed:', error);
        throw new Error(`PDF conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Extract base64 images from PDF for Claude API
 */
export async function convertPDFToBase64Images(pdfBuffer: Buffer, options: {
    scale?: number;
    maxPages?: number;
} = {}): Promise<string[]> {
    const result = await convertPDFToImages(pdfBuffer, options);
    return result.pages.map(page => page.imageBuffer.toString('base64'));
}
