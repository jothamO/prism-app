/**
 * Idempotency Handler
 * Prevents duplicate message processing
 */

import { LRUCache } from 'lru-cache';
import { config } from './config';
import { logger } from './utils/logger';

interface IdempotencyRecord {
    key: string;
    response: any;
    timestamp: number;
}

export class IdempotencyHandler {
    private cache: LRUCache<string, IdempotencyRecord>;

    constructor() {
        this.cache = new LRUCache<string, IdempotencyRecord>({
            max: config.idempotency.maxKeys,
            ttl: config.idempotency.ttlMinutes * 60 * 1000, // Convert to ms
            updateAgeOnGet: false // Don't extend TTL on get
        });
    }

    /**
     * Check if request is duplicate
     */
    isDuplicate(key: string): boolean {
        return this.cache.has(key);
    }

    /**
     * Get cached response for duplicate request
     */
    getCachedResponse(key: string): any | null {
        const record = this.cache.get(key);
        if (record) {
            logger.debug(`Idempotency cache hit: ${key}`);
            return record.response;
        }
        return null;
    }

    /**
     * Store response for idempotency
     */
    storeResponse(key: string, response: any): void {
        this.cache.set(key, {
            key,
            response,
            timestamp: Date.now()
        });
        logger.debug(`Stored idempotency key: ${key}`);
    }

    /**
     * Clear specific key
     */
    clear(key: string): void {
        this.cache.delete(key);
    }

    /**
     * Get cache stats
     */
    getStats() {
        return {
            size: this.cache.size,
            max: this.cache.max
        };
    }
}
