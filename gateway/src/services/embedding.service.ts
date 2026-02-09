/**
 * Embedding Service
 * Connects to local Ollama instance for vector embeddings.
 * Used for QMD semantic search (P6.2, P6.9).
 */

import axios from 'axios';
import { logger } from '../utils/logger';

export class EmbeddingService {
    private static baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    private static model = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

    /**
     * Generate embedding for a given text.
     */
    static async generateEmbedding(text: string): Promise<number[]> {
        try {
            const response = await axios.post(`${this.baseUrl}/api/embeddings`, {
                model: this.model,
                prompt: text
            });

            if (response.data && response.data.embedding) {
                return response.data.embedding;
            }

            throw new Error('Invalid response from Ollama embeddings API');
        } catch (error) {
            logger.error('[EmbeddingService] Failed to generate embedding:', error);
            // Fallback: return empty array if Ollama is down (to prevent total failure)
            return [];
        }
    }
}
