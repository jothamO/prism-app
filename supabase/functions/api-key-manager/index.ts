/**
 * API Key Generation
 * Creates and manages API keys for developers
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, jsonResponse, handleCors } from '../_shared/cors.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';

serve(async (req) => {
    // Handle CORS preflight
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
        const supabase = getSupabaseAdmin();

        // Get authenticated user
        const authHeader = req.headers.get('authorization');
        if (!authHeader) {
            return jsonResponse({ error: 'Authorization required' }, 401);
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser(
            authHeader.replace('Bearer ', '')
        );

        if (authError || !user) {
            return jsonResponse({ error: 'Invalid token' }, 401);
        }

        // Look up the user in the public.users table by email
        const { data: publicUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', user.email)
            .single();

        if (!publicUser) {
            return jsonResponse({ error: 'User profile not found. Please complete registration first.' }, 404);
        }

        const { action, key_id, tier, name, environment } = await req.json();

        switch (action) {
            case 'create': {
                // Generate a new API key
                const rawKey = generateAPIKey(environment || 'test');
                const keyHash = await hashKey(rawKey);
                const keyPrefix = rawKey.substring(0, 12) + '...';

                const { data, error } = await supabase
                    .from('api_keys')
                    .insert({
                        user_id: publicUser.id,
                        key_hash: keyHash,
                        key_prefix: keyPrefix,
                        name: name || 'Default Key',
                        tier: tier || 'free',
                        environment: environment || 'test',
                    })
                    .select()
                    .single();

                if (error) {
                    return jsonResponse({ error: error.message }, 400);
                }

                // IMPORTANT: Return the raw key only once!
                return jsonResponse({
                    success: true,
                    key: rawKey,
                    key_id: data.id,
                    message: 'Save this key securely - it will not be shown again!'
                }, 201);
            }

            case 'list': {
                const { data, error } = await supabase
                    .from('api_keys')
                    .select('id, key_prefix, name, tier, environment, is_active, last_used_at, created_at')
                    .eq('user_id', publicUser.id)
                    .order('created_at', { ascending: false });

                if (error) {
                    return jsonResponse({ error: error.message }, 400);
                }

                return jsonResponse({ keys: data });
            }

            case 'revoke': {
                if (!key_id) {
                    return jsonResponse({ error: 'key_id required' }, 400);
                }

                const { error } = await supabase
                    .from('api_keys')
                    .update({ is_active: false })
                    .eq('id', key_id)
                    .eq('user_id', publicUser.id);

                if (error) {
                    return jsonResponse({ error: error.message }, 400);
                }

                return jsonResponse({ success: true, message: 'Key revoked' });
            }

            case 'rotate': {
                if (!key_id) {
                    return jsonResponse({ error: 'key_id required' }, 400);
                }

                // Get existing key details
                const { data: existing } = await supabase
                    .from('api_keys')
                    .select('tier, environment, name')
                    .eq('id', key_id)
                    .eq('user_id', publicUser.id)
                    .single();

                if (!existing) {
                    return jsonResponse({ error: 'Key not found' }, 404);
                }

                // Revoke old key
                await supabase
                    .from('api_keys')
                    .update({ is_active: false })
                    .eq('id', key_id);

                // Create new key
                const rawKey = generateAPIKey(existing.environment);
                const keyHash = await hashKey(rawKey);
                const keyPrefix = rawKey.substring(0, 12) + '...';

                const { data, error } = await supabase
                    .from('api_keys')
                    .insert({
                        user_id: publicUser.id,
                        key_hash: keyHash,
                        key_prefix: keyPrefix,
                        name: existing.name + ' (rotated)',
                        tier: existing.tier,
                        environment: existing.environment,
                    })
                    .select()
                    .single();

                if (error) {
                    return jsonResponse({ error: error.message }, 400);
                }

                return jsonResponse({
                    success: true,
                    key: rawKey,
                    key_id: data.id,
                    message: 'Key rotated. Save new key securely!'
                }, 201);
            }

            case 'usage': {
                if (!key_id) {
                    return jsonResponse({ error: 'key_id required' }, 400);
                }

                // Get usage stats
                const { data: usage } = await supabase
                    .from('api_usage')
                    .select('endpoint, method, status_code, response_time_ms, created_at')
                    .eq('api_key_id', key_id)
                    .order('created_at', { ascending: false })
                    .limit(100);

                // Get daily counts
                const { data: dailyStats } = await supabase
                    .rpc('get_api_usage_stats', { p_key_id: key_id });

                return jsonResponse({
                    recent_requests: usage,
                    daily_stats: dailyStats
                });
            }

            default:
                return jsonResponse({ error: 'Invalid action' }, 400);
        }

    } catch (error) {
        console.error('[API Key Manager] Error:', error);
        return jsonResponse({ error: 'Internal server error' }, 500);
    }
});

/**
 * Generate a prefixed API key
 */
function generateAPIKey(environment: string): string {
    const prefix = environment === 'live' ? 'pk_live_' : 'pk_test_';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = prefix;
    for (let i = 0; i < 32; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

/**
 * Hash API key
 */
async function hashKey(key: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
