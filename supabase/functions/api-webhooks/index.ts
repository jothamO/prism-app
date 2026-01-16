/**
 * API Webhook Manager
 * Handles webhook registration and delivery for API users
 * Starter+ tiers only
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";


const WEBHOOK_EVENTS = [
    'document.completed',
    'document.failed',
    'tax.calculated',
    'usage.limit_warning',
    'usage.limit_reached'
];

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Validate API key
        const apiKeyHeader = req.headers.get('x-api-key') ||
            req.headers.get('authorization')?.replace('Bearer ', '');

        if (!apiKeyHeader) {
            return jsonResponse({ error: 'API key required' }, 401);
        }

        const keyHash = await hashKey(apiKeyHeader);
        const { data: apiKey } = await supabase
            .from('api_keys')
            .select('id, user_id, tier, can_use_webhooks')
            .eq('key_hash', keyHash)
            .eq('is_active', true)
            .single();

        if (!apiKey) {
            return jsonResponse({ error: 'Invalid API key' }, 401);
        }

        if (!apiKey.can_use_webhooks) {
            return jsonResponse({
                error: 'Webhooks require Starter tier or higher',
                code: 'TIER_REQUIRED',
                required_tier: 'starter'
            }, 403);
        }

        const url = new URL(req.url);
        const path = url.pathname;

        // POST /api/v1/webhooks - Register new webhook
        if (req.method === 'POST' && path === '/api/v1/webhooks') {
            return await handleRegister(req, supabase, apiKey);
        }

        // GET /api/v1/webhooks - List webhooks
        if (req.method === 'GET' && path === '/api/v1/webhooks') {
            return await handleList(supabase, apiKey);
        }

        // DELETE /api/v1/webhooks/:id - Delete webhook
        if (req.method === 'DELETE' && path.includes('/webhooks/')) {
            const webhookId = path.split('/').pop();
            return await handleDelete(webhookId!, supabase, apiKey);
        }

        // POST /api/v1/webhooks/:id/test - Test webhook
        if (req.method === 'POST' && path.includes('/test')) {
            const webhookId = path.split('/')[4];
            return await handleTest(webhookId, supabase, apiKey);
        }

        return jsonResponse({ error: 'Not found' }, 404);

    } catch (error) {
        console.error('[API Webhooks] Error:', error);
        return jsonResponse({ error: 'Internal server error' }, 500);
    }
});

/**
 * Register a new webhook
 */
async function handleRegister(
    req: Request,
    supabase: any,
    apiKey: any
): Promise<Response> {
    const body = await req.json();
    const { url, events } = body;

    if (!url) {
        return jsonResponse({ error: 'url is required' }, 400);
    }

    // Validate URL
    try {
        new URL(url);
    } catch {
        return jsonResponse({ error: 'Invalid URL format' }, 400);
    }

    // Validate events
    const validEvents = events?.filter((e: string) => WEBHOOK_EVENTS.includes(e)) || WEBHOOK_EVENTS;
    if (validEvents.length === 0) {
        return jsonResponse({
            error: 'No valid events specified',
            available_events: WEBHOOK_EVENTS
        }, 400);
    }

    // Generate signing secret
    const secret = generateSecret();

    const { data, error } = await supabase
        .from('api_webhooks')
        .insert({
            api_key_id: apiKey.id,
            url,
            events: validEvents,
            secret,
            is_active: true
        })
        .select()
        .single();

    if (error) {
        return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({
        success: true,
        webhook: {
            id: data.id,
            url: data.url,
            events: data.events,
            secret: secret, // Only shown once!
            message: 'Save the secret - it will not be shown again!'
        }
    }, 201);
}

/**
 * List all webhooks
 */
async function handleList(supabase: any, apiKey: any): Promise<Response> {
    const { data, error } = await supabase
        .from('api_webhooks')
        .select('id, url, events, is_active, last_triggered_at, failure_count, created_at')
        .eq('api_key_id', apiKey.id)
        .order('created_at', { ascending: false });

    if (error) {
        return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({
        webhooks: data,
        available_events: WEBHOOK_EVENTS
    }, 200);
}

/**
 * Delete a webhook
 */
async function handleDelete(
    webhookId: string,
    supabase: any,
    apiKey: any
): Promise<Response> {
    const { error } = await supabase
        .from('api_webhooks')
        .delete()
        .eq('id', webhookId)
        .eq('api_key_id', apiKey.id);

    if (error) {
        return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({ success: true, message: 'Webhook deleted' }, 200);
}

/**
 * Test a webhook with sample payload
 */
async function handleTest(
    webhookId: string,
    supabase: any,
    apiKey: any
): Promise<Response> {
    const { data: webhook } = await supabase
        .from('api_webhooks')
        .select('url, secret')
        .eq('id', webhookId)
        .eq('api_key_id', apiKey.id)
        .single();

    if (!webhook) {
        return jsonResponse({ error: 'Webhook not found' }, 404);
    }

    // Send test payload
    const testPayload = {
        event: 'webhook.test',
        timestamp: new Date().toISOString(),
        data: {
            message: 'This is a test webhook from PRISM API',
            webhook_id: webhookId
        }
    };

    try {
        const signature = await signPayload(JSON.stringify(testPayload), webhook.secret);

        const response = await fetch(webhook.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-PRISM-Signature': signature,
                'X-PRISM-Event': 'webhook.test'
            },
            body: JSON.stringify(testPayload)
        });

        return jsonResponse({
            success: response.ok,
            status_code: response.status,
            message: response.ok ? 'Webhook delivered successfully' : 'Webhook delivery failed'
        }, 200);

    } catch (error) {
        return jsonResponse({
            success: false,
            error: 'Failed to reach webhook URL'
        }, 200);
    }
}

/**
 * Generate webhook signing secret
 */
function generateSecret(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let secret = 'whsec_';
    for (let i = 0; i < 32; i++) {
        secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
}

/**
 * Sign payload with HMAC-SHA256
 */
async function signPayload(payload: string, secret: string): Promise<string> {
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
 * Hash API key
 */
async function hashKey(key: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// jsonResponse is imported from _shared/cors.ts
