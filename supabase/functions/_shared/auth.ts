/**
 * Shared Auth Utilities
 * API key hashing, validation, and authentication helpers
 */

import { getSupabaseAdmin } from './supabase.ts';

/**
 * Hash an API key using SHA-256
 */
export async function hashApiKey(key: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a new API key
 */
export function generateApiKey(environment: 'test' | 'live' = 'test'): string {
    const prefix = environment === 'live' ? 'pk_live_' : 'pk_test_';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = prefix;
    for (let i = 0; i < 32; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

/**
 * Generate a webhook signing secret
 */
export function generateWebhookSecret(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let secret = 'whsec_';
    for (let i = 0; i < 32; i++) {
        secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
}

/**
 * Validate an API key and return key data
 */
export interface ApiKeyData {
    id: string;
    user_id: string;
    tier: 'free' | 'starter' | 'business' | 'enterprise';
    environment: 'test' | 'live';
    is_active: boolean;
    can_access_documents: boolean;
    can_access_ocr: boolean;
    can_use_webhooks: boolean;
}

export async function validateApiKey(apiKey: string): Promise<ApiKeyData | null> {
    const keyHash = await hashApiKey(apiKey);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
        .from('api_keys')
        .select('id, user_id, tier, environment, is_active, can_access_documents, can_access_ocr, can_use_webhooks')
        .eq('key_hash', keyHash)
        .eq('is_active', true)
        .single();

    if (error || !data) return null;

    // Update last used timestamp
    await supabase
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', data.id);

    return data as ApiKeyData;
}

/**
 * Extract API key from request headers
 */
export function extractApiKey(req: Request): string | null {
    return req.headers.get('x-api-key') ||
        req.headers.get('authorization')?.replace('Bearer ', '') ||
        null;
}

/**
 * Sign a payload with HMAC-SHA256 for webhooks
 */
export async function signPayload(payload: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const hashArray = Array.from(new Uint8Array(signature));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify an HMAC signature
 */
export async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
    const expectedSignature = await signPayload(payload, secret);
    return signature === expectedSignature;
}
