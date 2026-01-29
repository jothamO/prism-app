/**
 * Context Cache - V22
 * 
 * Simple in-memory cache for high-read, low-write data like tax rules.
 * TTL: 5 minutes (300,000ms)
 */

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached value or fetch and cache it
 */
export async function getCached<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
    const now = Date.now();
    const existing = cache.get(key) as CacheEntry<T> | undefined;

    if (existing && existing.expiresAt > now) {
        console.log(`[context-cache] Cache HIT for ${key}`);
        return existing.data;
    }

    console.log(`[context-cache] Cache MISS for ${key}, fetching...`);
    const data = await fetcher();

    cache.set(key, {
        data,
        expiresAt: now + ttlMs
    });

    return data;
}

/**
 * Manually invalidate a cache key
 */
export function invalidateCache(key: string): void {
    cache.delete(key);
    console.log(`[context-cache] Invalidated ${key}`);
}

/**
 * Clear entire cache
 */
export function clearCache(): void {
    cache.clear();
    console.log(`[context-cache] Cache cleared`);
}

// Export cache keys as constants for consistency
export const CACHE_KEYS = {
    TAX_RULES: 'tax_rules_summary',
    COMPLIANCE_RULES: 'compliance_rules_active',
} as const;
