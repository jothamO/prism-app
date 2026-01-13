/**
 * PRISM API Gateway
 * Main entry point for public API endpoints
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHash } from 'https://deno.land/std@0.168.0/crypto/mod.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

interface APIKey {
    id: string;
    tier: string;
    is_active: boolean;
    can_access_documents: boolean;
    can_access_ocr: boolean;
    can_use_webhooks: boolean;
    user_id: string;
}

interface RateLimitResult {
    allowed: boolean;
    minute_remaining: number;
    day_remaining: number;
    retry_after_seconds: number;
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const startTime = Date.now();
    const url = new URL(req.url);
    const path = url.pathname;

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Extract and validate API key
        const apiKey = req.headers.get('x-api-key') ||
            req.headers.get('authorization')?.replace('Bearer ', '');

        if (!apiKey) {
            return jsonResponse({
                error: 'API key required',
                code: 'MISSING_API_KEY'
            }, 401);
        }

        // Hash the key for lookup
        const keyHash = await hashKey(apiKey);

        // 2. Lookup API key
        const { data: keyData, error: keyError } = await supabase
            .from('api_keys')
            .select('id, tier, is_active, can_access_documents, can_access_ocr, can_use_webhooks, user_id')
            .eq('key_hash', keyHash)
            .single();

        if (keyError || !keyData) {
            return jsonResponse({
                error: 'Invalid API key',
                code: 'INVALID_API_KEY'
            }, 401);
        }

        if (!keyData.is_active) {
            return jsonResponse({
                error: 'API key is inactive',
                code: 'INACTIVE_API_KEY'
            }, 403);
        }

        const apiKeyRecord = keyData as APIKey;

        // 3. Check rate limits
        const { data: rateLimitData } = await supabase
            .rpc('check_api_rate_limit', {
                p_key_id: apiKeyRecord.id,
                p_tier: apiKeyRecord.tier
            });

        const rateLimit = rateLimitData?.[0] as RateLimitResult;

        if (!rateLimit?.allowed) {
            return jsonResponse({
                error: 'Rate limit exceeded',
                code: 'RATE_LIMITED',
                retry_after: rateLimit?.retry_after_seconds || 60
            }, 429, {
                'Retry-After': String(rateLimit?.retry_after_seconds || 60),
                'X-RateLimit-Remaining-Minute': '0',
                'X-RateLimit-Remaining-Day': String(rateLimit?.day_remaining || 0)
            });
        }

        // 4. Route to appropriate handler
        const response = await routeRequest(path, req, supabase, apiKeyRecord);

        // 5. Log usage
        await logUsage(supabase, apiKeyRecord.id, path, req.method, response.status, Date.now() - startTime);

        // Update last used
        await supabase
            .from('api_keys')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', apiKeyRecord.id);

        // Add rate limit headers
        const headers = {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining-Minute': String(rateLimit?.minute_remaining || 0),
            'X-RateLimit-Remaining-Day': String(rateLimit?.day_remaining || 0),
        };

        return new Response(response.body, {
            status: response.status,
            headers
        });

    } catch (error) {
        console.error('[API Gateway] Error:', error);
        return jsonResponse({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        }, 500);
    }
});

/**
 * Route request to appropriate handler
 */
async function routeRequest(
    path: string,
    req: Request,
    supabase: any,
    apiKey: APIKey
): Promise<{ body: string; status: number }> {
    const body = req.method === 'POST' ? await req.json() : {};

    // Tax calculations (all tiers)
    if (path.startsWith('/api/v1/tax/')) {
        return handleTaxCalculation(path, body, supabase, apiKey);
    }

    // Rules API (all tiers)
    if (path.startsWith('/api/v1/rules')) {
        return handleRulesAPI(path, supabase);
    }

    // Documents API (business+ only)
    if (path.startsWith('/api/v1/documents')) {
        if (!apiKey.can_access_documents) {
            return {
                body: JSON.stringify({
                    error: 'Document API requires Business tier or higher',
                    code: 'TIER_REQUIRED',
                    required_tier: 'business'
                }),
                status: 403
            };
        }
        return handleDocumentsAPI(path, body, supabase, apiKey);
    }

    // Webhooks API (starter+ only)
    if (path.startsWith('/api/v1/webhooks')) {
        if (!apiKey.can_use_webhooks) {
            return {
                body: JSON.stringify({
                    error: 'Webhooks require Starter tier or higher',
                    code: 'TIER_REQUIRED',
                    required_tier: 'starter'
                }),
                status: 403
            };
        }
        return handleWebhooksAPI(path, body, supabase, apiKey);
    }

    // Health check
    if (path === '/api/v1/health') {
        return {
            body: JSON.stringify({ status: 'ok', tier: apiKey.tier }),
            status: 200
        };
    }

    return {
        body: JSON.stringify({ error: 'Not found', code: 'NOT_FOUND' }),
        status: 404
    };
}

/**
 * Handle tax calculation endpoints
 */
async function handleTaxCalculation(
    path: string,
    body: any,
    supabase: any,
    apiKey: APIKey
): Promise<{ body: string; status: number }> {
    const taxType = path.split('/').pop(); // pit, cit, vat, etc.

    // Get tax rules
    const { data: rules } = await supabase
        .from('active_tax_rules')
        .select('*');

    // Basic validation
    if (!body.income && !body.amount && !body.profits) {
        return {
            body: JSON.stringify({
                error: 'Missing required field: income, amount, or profits',
                code: 'VALIDATION_ERROR'
            }),
            status: 400
        };
    }

    const amount = body.income || body.amount || body.profits || 0;

    // Simple calculation example (would use actual skill logic)
    let result: any = {};

    switch (taxType) {
        case 'pit':
        case 'calculate':
            result = calculatePIT(amount, rules);
            break;
        case 'vat':
            result = calculateVAT(amount, body.vat_inclusive);
            break;
        case 'cit':
            result = calculateCIT(amount, body.turnover);
            break;
        default:
            result = { tax_payable: 0, message: 'Tax type not implemented yet' };
    }

    return {
        body: JSON.stringify({
            success: true,
            data: result,
            meta: {
                request_id: crypto.randomUUID(),
                rules_version: new Date().toISOString().split('T')[0],
                tier: apiKey.tier
            }
        }),
        status: 200
    };
}

/**
 * PIT calculation
 */
function calculatePIT(income: number, rules: any[]): any {
    const bands = [
        { min: 0, max: 800000, rate: 0 },
        { min: 800000, max: 3000000, rate: 0.15 },
        { min: 3000000, max: 12000000, rate: 0.18 },
        { min: 12000000, max: 25000000, rate: 0.21 },
        { min: 25000000, max: 50000000, rate: 0.23 },
        { min: 50000000, max: Infinity, rate: 0.25 },
    ];

    let totalTax = 0;
    let remaining = income;
    const breakdown: any[] = [];

    for (const band of bands) {
        if (remaining <= 0) break;
        const bandWidth = band.max === Infinity ? remaining : band.max - band.min;
        const taxableInBand = Math.min(remaining, bandWidth);
        const taxInBand = taxableInBand * band.rate;

        if (taxInBand > 0) {
            breakdown.push({
                band: band.max === Infinity ? `Above ₦${band.min.toLocaleString()}` : `₦${band.min.toLocaleString()} - ₦${band.max.toLocaleString()}`,
                rate: band.rate * 100,
                tax: taxInBand
            });
        }

        totalTax += taxInBand;
        remaining -= taxableInBand;
    }

    return {
        gross_income: income,
        tax_payable: totalTax,
        effective_rate: (totalTax / income * 100).toFixed(2),
        breakdown,
        act_reference: 'Section 58 NTA 2025'
    };
}

/**
 * VAT calculation
 */
function calculateVAT(amount: number, inclusive: boolean = false): any {
    const rate = 0.075;
    let vatAmount: number;
    let netAmount: number;
    let grossAmount: number;

    if (inclusive) {
        grossAmount = amount;
        netAmount = amount / (1 + rate);
        vatAmount = grossAmount - netAmount;
    } else {
        netAmount = amount;
        vatAmount = amount * rate;
        grossAmount = amount + vatAmount;
    }

    return {
        net_amount: netAmount,
        vat_amount: vatAmount,
        gross_amount: grossAmount,
        rate: rate * 100,
        act_reference: 'Section 83 NTA 2025'
    };
}

/**
 * CIT calculation
 */
function calculateCIT(profits: number, turnover?: number): any {
    const isSmallCompany = (turnover || profits) <= 50000000;
    const citRate = isSmallCompany ? 0 : 0.30;
    const devLevyRate = isSmallCompany ? 0 : 0.04;

    const cit = profits * citRate;
    const devLevy = profits * devLevyRate;
    const totalTax = cit + devLevy;

    return {
        assessable_profits: profits,
        is_small_company: isSmallCompany,
        cit: cit,
        cit_rate: citRate * 100,
        development_levy: devLevy,
        total_tax: totalTax,
        effective_rate: (totalTax / profits * 100).toFixed(2),
        act_reference: 'Section 56-57 NTA 2025'
    };
}

/**
 * Handle rules API
 */
async function handleRulesAPI(path: string, supabase: any): Promise<{ body: string; status: number }> {
    const { data: rules, error } = await supabase
        .from('active_tax_rules')
        .select('rule_code, rule_name, rule_type, parameters, description, effective_from')
        .order('priority');

    if (error) {
        return {
            body: JSON.stringify({ error: 'Failed to fetch rules' }),
            status: 500
        };
    }

    return {
        body: JSON.stringify({
            success: true,
            data: rules,
            count: rules?.length || 0
        }),
        status: 200
    };
}

/**
 * Handle documents API (placeholder)
 */
async function handleDocumentsAPI(
    path: string,
    body: any,
    supabase: any,
    apiKey: APIKey
): Promise<{ body: string; status: number }> {
    return {
        body: JSON.stringify({
            success: true,
            message: 'Document processing queued',
            job_id: crypto.randomUUID()
        }),
        status: 202
    };
}

/**
 * Handle webhooks API (placeholder)
 */
async function handleWebhooksAPI(
    path: string,
    body: any,
    supabase: any,
    apiKey: APIKey
): Promise<{ body: string; status: number }> {
    return {
        body: JSON.stringify({
            success: true,
            message: 'Webhook registered',
            webhook_id: crypto.randomUUID()
        }),
        status: 201
    };
}

/**
 * Hash API key for secure storage
 */
async function hashKey(key: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Log API usage
 */
async function logUsage(
    supabase: any,
    apiKeyId: string,
    endpoint: string,
    method: string,
    statusCode: number,
    responseTimeMs: number
): Promise<void> {
    try {
        await supabase.from('api_usage').insert({
            api_key_id: apiKeyId,
            endpoint,
            method,
            status_code: statusCode,
            response_time_ms: responseTimeMs
        });
    } catch (e) {
        console.error('[API Gateway] Failed to log usage:', e);
    }
}

/**
 * JSON response helper
 */
function jsonResponse(data: any, status: number, extraHeaders: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            ...extraHeaders
        }
    });
}
