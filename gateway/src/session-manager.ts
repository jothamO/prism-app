/**
 * Session Manager
 * Manages user sessions with Supabase persistence and LRU cache
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { LRUCache } from 'lru-cache';
import { Session, Platform } from './protocol';
import { config } from './config';
import { logger } from './utils/logger';

export class SessionManager {
    private supabase: SupabaseClient;
    private cache: LRUCache<string, Session>;

    constructor() {
        this.supabase = createClient(
            config.supabase.url,
            config.supabase.serviceKey
        );

        this.cache = new LRUCache<string, Session>({
            max: config.sessionCache.maxSessions,
            ttl: config.sessionCache.ttlMinutes * 60 * 1000, // Convert to ms
            updateAgeOnGet: true
        });
    }

    /**
     * Get session by userId and platform
     */
    async getSession(userId: string, platform: Platform): Promise<Session | null> {
        const cacheKey = this.getCacheKey(userId, platform);

        // Check cache first
        const cached = this.cache.get(cacheKey);
        if (cached) {
            logger.debug(`Session cache hit: ${cacheKey}`);
            return cached;
        }

        // Fetch from database
        const { data, error } = await this.supabase
            .from('chatbot_sessions')
            .select('*')
            .eq('user_id', userId)
            .eq('platform', platform)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // Not found
                return null;
            }
            logger.error('Error fetching session:', error);
            throw error;
        }

        const session: Session = {
            userId: data.user_id,
            platform: data.platform,
            context: data.context || {},
            createdAt: data.created_at,
            updatedAt: data.updated_at
        };

        // Cache it
        this.cache.set(cacheKey, session);

        return session;
    }

    /**
     * Create or update session
     */
    async upsertSession(
        userId: string,
        platform: Platform,
        context: Record<string, any>
    ): Promise<Session> {
        const now = new Date().toISOString();

        const { data, error } = await this.supabase
            .from('chatbot_sessions')
            .upsert({
                user_id: userId,
                platform,
                context,
                updated_at: now
            }, {
                onConflict: 'user_id,platform'
            })
            .select()
            .single();

        if (error) {
            logger.error('Error upserting session:', error);
            throw error;
        }

        const session: Session = {
            userId: data.user_id,
            platform: data.platform,
            context: data.context || {},
            createdAt: data.created_at,
            updatedAt: data.updated_at
        };

        // Update cache
        const cacheKey = this.getCacheKey(userId, platform);
        this.cache.set(cacheKey, session);

        return session;
    }

    /**
     * Update session context
     */
    async updateContext(
        userId: string,
        platform: Platform,
        contextUpdate: Record<string, any>
    ): Promise<Session> {
        const existing = await this.getSession(userId, platform);
        const newContext = { ...(existing?.context || {}), ...contextUpdate };

        return this.upsertSession(userId, platform, newContext);
    }

    /**
     * Delete session
     */
    async deleteSession(userId: string, platform: Platform): Promise<void> {
        const { error } = await this.supabase
            .from('chatbot_sessions')
            .delete()
            .eq('user_id', userId)
            .eq('platform', platform);

        if (error) {
            logger.error('Error deleting session:', error);
            throw error;
        }

        // Remove from cache
        const cacheKey = this.getCacheKey(userId, platform);
        this.cache.delete(cacheKey);
    }

    /**
     * List all sessions (for admin)
     */
    async listSessions(limit: number = 100): Promise<Session[]> {
        const { data, error } = await this.supabase
            .from('chatbot_sessions')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(limit);

        if (error) {
            logger.error('Error listing sessions:', error);
            throw error;
        }

        return data.map(row => ({
            userId: row.user_id,
            platform: row.platform,
            context: row.context || {},
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }));
    }

    /**
     * Get cache key
     */
    private getCacheKey(userId: string, platform: Platform): string {
        return `${platform}:${userId}`;
    }

    /**
     * Get cache stats (for monitoring)
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            max: this.cache.max,
            hitRate: this.cache.calculatedSize / (this.cache.calculatedSize + this.cache.size)
        };
    }
}
