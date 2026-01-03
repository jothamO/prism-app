/**
 * OCR Service using Google Cloud Vision API
 * Provides enhanced text extraction for documents before AI interpretation
 */

import { ImageAnnotatorClient } from '@google-cloud/vision';
import { logger } from '../utils/logger';

export interface OCRResult {
    text: string;
    confidence: number;
    pages?: Array<{
        width: number;
        height: number;
        blocks: Array<{
            text: string;
            confidence: number;
            boundingBox?: {
                x: number;
                y: number;
                width: number;
                height: number;
            };
        }>;
    }>;
}

export class OCRService {
    private client: ImageAnnotatorClient | null = null;
    private initialized = false;

    constructor() {
        this.initializeClient();
    }

    /**
     * Initialize the Google Cloud Vision client
     */
    private initializeClient(): void {
        try {
            const credentials = process.env.GOOGLE_CLOUD_CREDENTIALS;
            const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;

            if (!credentials || !projectId) {
                logger.warn('[OCR Service] Google Cloud credentials not configured - OCR will use fallback');
                return;
            }

            const parsedCredentials = JSON.parse(credentials);

            this.client = new ImageAnnotatorClient({
                credentials: parsedCredentials,
                projectId: projectId
            });

            this.initialized = true;
            logger.info('[OCR Service] Google Cloud Vision client initialized');
        } catch (error) {
            logger.error('[OCR Service] Failed to initialize Vision client:', error);
        }
    }

    /**
     * Check if OCR service is available
     */
    isAvailable(): boolean {
        return this.initialized && this.client !== null;
    }

    /**
     * Extract text from document image using DOCUMENT_TEXT_DETECTION
     * Best for bank statements, structured documents with tables
     */
    async extractDocumentText(imageData: Buffer | string): Promise<OCRResult> {
        if (!this.client) {
            throw new Error('OCR Service not initialized');
        }

        try {
            logger.info('[OCR Service] Extracting document text');

            const image = typeof imageData === 'string'
                ? { source: { imageUri: imageData } }
                : { content: imageData.toString('base64') };

            const [result] = await this.client.documentTextDetection(image);

            const fullText = result.fullTextAnnotation?.text || '';
            const confidence = this.calculateConfidence(result);
            const pages = this.extractPages(result);

            logger.info('[OCR Service] Document text extracted', {
                textLength: fullText.length,
                confidence,
                pageCount: pages.length
            });

            return { text: fullText, confidence, pages };
        } catch (error) {
            logger.error('[OCR Service] Document text extraction failed:', error);
            throw error;
        }
    }

    /**
     * Extract text from receipt image using TEXT_DETECTION
     * Good for simpler documents like receipts
     */
    async extractReceiptText(imageData: Buffer | string): Promise<OCRResult> {
        if (!this.client) {
            throw new Error('OCR Service not initialized');
        }

        try {
            logger.info('[OCR Service] Extracting receipt text');

            const image = typeof imageData === 'string'
                ? { source: { imageUri: imageData } }
                : { content: imageData.toString('base64') };

            const [result] = await this.client.textDetection(image);

            const annotations = result.textAnnotations || [];
            const fullText = annotations[0]?.description || '';

            // Calculate confidence from individual text detections
            let totalConfidence = 0;
            let count = 0;
            annotations.slice(1).forEach(annotation => {
                if (annotation.confidence !== undefined) {
                    totalConfidence += annotation.confidence;
                    count++;
                }
            });

            const confidence = count > 0 ? totalConfidence / count : 0.85;

            logger.info('[OCR Service] Receipt text extracted', {
                textLength: fullText.length,
                confidence
            });

            return { text: fullText, confidence };
        } catch (error) {
            logger.error('[OCR Service] Receipt text extraction failed:', error);
            throw error;
        }
    }

    /**
     * Download image from URL and return as buffer
     */
    async downloadImage(url: string): Promise<{ buffer: Buffer; mediaType: string }> {
        try {
            logger.info('[OCR Service] Downloading image', { url: url.substring(0, 50) + '...' });

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to download image: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const mediaType = response.headers.get('content-type') || 'image/jpeg';

            logger.info('[OCR Service] Image downloaded', {
                size: buffer.length,
                mediaType
            });

            return { buffer, mediaType };
        } catch (error) {
            logger.error('[OCR Service] Image download failed:', error);
            throw error;
        }
    }

    /**
     * Calculate overall confidence from Vision API response
     */
    private calculateConfidence(result: any): number {
        try {
            const pages = result.fullTextAnnotation?.pages || [];
            if (pages.length === 0) return 0;

            let totalConfidence = 0;
            let blockCount = 0;

            for (const page of pages) {
                for (const block of (page.blocks || [])) {
                    if (block.confidence !== undefined) {
                        totalConfidence += block.confidence;
                        blockCount++;
                    }
                }
            }

            return blockCount > 0 ? totalConfidence / blockCount : 0.85;
        } catch {
            return 0.85;
        }
    }

    /**
     * Extract page structure from Vision API response
     */
    private extractPages(result: any): OCRResult['pages'] {
        try {
            const pages = result.fullTextAnnotation?.pages || [];
            return pages.map((page: any) => ({
                width: page.width || 0,
                height: page.height || 0,
                blocks: (page.blocks || []).map((block: any) => ({
                    text: this.extractBlockText(block),
                    confidence: block.confidence || 0,
                    boundingBox: block.boundingBox?.vertices ? {
                        x: block.boundingBox.vertices[0]?.x || 0,
                        y: block.boundingBox.vertices[0]?.y || 0,
                        width: (block.boundingBox.vertices[2]?.x || 0) - (block.boundingBox.vertices[0]?.x || 0),
                        height: (block.boundingBox.vertices[2]?.y || 0) - (block.boundingBox.vertices[0]?.y || 0)
                    } : undefined
                }))
            }));
        } catch {
            return [];
        }
    }

    /**
     * Extract text from a block
     */
    private extractBlockText(block: any): string {
        try {
            let text = '';
            for (const paragraph of (block.paragraphs || [])) {
                for (const word of (paragraph.words || [])) {
                    for (const symbol of (word.symbols || [])) {
                        text += symbol.text || '';
                    }
                    text += ' ';
                }
                text += '\n';
            }
            return text.trim();
        } catch {
            return '';
        }
    }
}

// Export singleton instance
export const ocrService = new OCRService();
