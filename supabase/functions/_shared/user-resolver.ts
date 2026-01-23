/**
 * User Resolution Service - V14
 * 
 * Centralized user ID resolution to eliminate 11+ duplicated patterns.
 * Handles auth_user_id → internal users.id mapping.
 */

import { getSupabaseAdmin } from './supabase.ts';

// ============= Types =============

export interface ResolvedUser {
    internalId: string;
    authUserId: string | null;
    email: string | null;
    phone: string | null;
    telegramId: string | null;
    entityType: string | null;
    isBlocked: boolean;
}

// ============= Cache (optional, in-memory for request lifecycle) =============
const userCache = new Map<string, ResolvedUser>();

// ============= Core Resolution Function =============

/**
 * Resolve any user identifier to internal users.id
 * Accepts: auth_user_id, internal UUID, telegram_id, or phone
 */
export async function resolveUserId(identifier: string): Promise<string | null> {
    if (!identifier) return null;

    // Check cache first
    if (userCache.has(identifier)) {
        return userCache.get(identifier)!.internalId;
    }

    const supabase = getSupabaseAdmin();

    // Try as auth_user_id first (most common)
    const { data: byAuth } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', identifier)
        .single();

    if (byAuth) {
        return byAuth.id;
    }

    // Try as direct internal ID
    const { data: byId } = await supabase
        .from('users')
        .select('id')
        .eq('id', identifier)
        .single();

    if (byId) {
        return byId.id;
    }

    return null;
}

/**
 * Get full user object by any identifier
 */
export async function getUser(identifier: string): Promise<ResolvedUser | null> {
    if (!identifier) return null;

    // Check cache
    if (userCache.has(identifier)) {
        return userCache.get(identifier)!;
    }

    const supabase = getSupabaseAdmin();

    // Try as auth_user_id
    let { data: user } = await supabase
        .from('users')
        .select('id, auth_user_id, email, phone, telegram_id, entity_type, is_blocked')
        .eq('auth_user_id', identifier)
        .single();

    // Try as internal ID
    if (!user) {
        const result = await supabase
            .from('users')
            .select('id, auth_user_id, email, phone, telegram_id, entity_type, is_blocked')
            .eq('id', identifier)
            .single();
        user = result.data;
    }

    if (!user) return null;

    const resolved: ResolvedUser = {
        internalId: user.id,
        authUserId: user.auth_user_id,
        email: user.email,
        phone: user.phone,
        telegramId: user.telegram_id,
        entityType: user.entity_type,
        isBlocked: user.is_blocked || false,
    };

    // Cache for this request
    userCache.set(identifier, resolved);
    userCache.set(user.id, resolved);
    if (user.auth_user_id) userCache.set(user.auth_user_id, resolved);

    return resolved;
}

/**
 * Get user by Telegram ID
 */
export async function getUserByTelegram(telegramId: string): Promise<ResolvedUser | null> {
    if (!telegramId) return null;

    const supabase = getSupabaseAdmin();

    const { data: user } = await supabase
        .from('users')
        .select('id, auth_user_id, email, phone, telegram_id, entity_type, is_blocked')
        .eq('telegram_id', telegramId)
        .single();

    if (!user) return null;

    return {
        internalId: user.id,
        authUserId: user.auth_user_id,
        email: user.email,
        phone: user.phone,
        telegramId: user.telegram_id,
        entityType: user.entity_type,
        isBlocked: user.is_blocked || false,
    };
}

/**
 * Get user by phone number
 */
export async function getUserByPhone(phone: string): Promise<ResolvedUser | null> {
    if (!phone) return null;

    const supabase = getSupabaseAdmin();

    // Normalize phone (remove spaces, dashes)
    const normalized = phone.replace(/[\s-]/g, '');

    const { data: user } = await supabase
        .from('users')
        .select('id, auth_user_id, email, phone, telegram_id, entity_type, is_blocked')
        .or(`phone.eq.${normalized},phone.eq.${phone}`)
        .single();

    if (!user) return null;

    return {
        internalId: user.id,
        authUserId: user.auth_user_id,
        email: user.email,
        phone: user.phone,
        telegramId: user.telegram_id,
        entityType: user.entity_type,
        isBlocked: user.is_blocked || false,
    };
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<ResolvedUser | null> {
    if (!email) return null;

    const supabase = getSupabaseAdmin();

    const { data: user } = await supabase
        .from('users')
        .select('id, auth_user_id, email, phone, telegram_id, entity_type, is_blocked')
        .eq('email', email.toLowerCase())
        .single();

    if (!user) return null;

    return {
        internalId: user.id,
        authUserId: user.auth_user_id,
        email: user.email,
        phone: user.phone,
        telegramId: user.telegram_id,
        entityType: user.entity_type,
        isBlocked: user.is_blocked || false,
    };
}

/**
 * Clear the user cache (call between requests if needed)
 */
export function clearUserCache(): void {
    userCache.clear();
}
