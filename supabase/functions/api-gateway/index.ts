/**
 * PRISM API Gateway
 * Main entry point for public API endpoints
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";


interface APIKey {
    id: string;
    tier: string;
    is_active: boolean;
    can_access_documents: boolean;
    can_access_ocr: boolean;
    can_use_webhooks: boolean;
    user_id: string;
}

interface SubscriptionStatus {
    tier: string;
    status: string;
    is_valid: boolean;
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

        // 2b. Validate subscription for paid tiers
        if (apiKeyRecord.tier !== 'free') {
            const subscriptionStatus = await validateSubscription(supabase, apiKeyRecord.user_id, apiKeyRecord.tier);
            if (!subscriptionStatus.is_valid) {
                return jsonResponse({
                    error: 'Subscription required for this tier',
                    code: 'SUBSCRIPTION_REQUIRED',
                    message: `Your ${apiKeyRecord.tier} subscription is ${subscriptionStatus.status}. Please update your subscription to continue using this API key.`,
                    current_status: subscriptionStatus.status
                }, 403);
            }
        }

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
 * Now uses the central tax-calculate edge function
 */
async function handleTaxCalculation(
    path: string,
    body: any,
    supabase: any,
    apiKey: APIKey
): Promise<{ body: string; status: number }> {
    const taxType = path.split('/').pop(); // pit, cit, vat, wht, cgt, stamp, levy, metr

    // Map API path to tax_type
    const taxTypeMap: Record<string, string> = {
        'pit': 'pit',
        'calculate': 'pit', // Legacy endpoint
        'cit': 'cit',
        'vat': 'vat',
        'wht': 'wht',
        'cgt': 'cgt',
        'stamp': 'stamp',
        'levy': 'levy',
        'metr': 'metr',
    };

    const mappedType = taxTypeMap[taxType || ''];
    if (!mappedType) {
        return {
            body: JSON.stringify({
                error: `Unknown tax type: ${taxType}`,
                code: 'INVALID_TAX_TYPE',
                supported_types: Object.keys(taxTypeMap)
            }),
            status: 400
        };
    }

    // Build params based on tax type
    let params: Record<string, any> = {};

    switch (mappedType) {
        case 'pit':
            if (!body.income && !body.gross_income) {
                return {
                    body: JSON.stringify({
                        error: 'Missing required field: income or gross_income',
                        code: 'VALIDATION_ERROR'
                    }),
                    status: 400
                };
            }
            params = {
                gross_income: body.income || body.gross_income,
                annual: body.annual ?? true,
                deductions: body.deductions || 0
            };
            break;

        case 'cit':
            if (!body.profits) {
                return {
                    body: JSON.stringify({
                        error: 'Missing required field: profits',
                        code: 'VALIDATION_ERROR'
                    }),
                    status: 400
                };
            }
            params = {
                profits: body.profits,
                turnover: body.turnover,
                assets: body.assets
            };
            break;

        case 'vat':
            if (!body.amount) {
                return {
                    body: JSON.stringify({
                        error: 'Missing required field: amount',
                        code: 'VALIDATION_ERROR'
                    }),
                    status: 400
                };
            }
            params = {
                amount: body.amount,
                is_vatable: body.is_vatable ?? true,
                supply_type: body.supply_type || 'goods'
            };
            break;

        case 'wht':
            if (!body.amount || !body.payment_type) {
                return {
                    body: JSON.stringify({
                        error: 'Missing required fields: amount, payment_type',
                        code: 'VALIDATION_ERROR'
                    }),
                    status: 400
                };
            }
            params = {
                amount: body.amount,
                payment_type: body.payment_type,
                payee_type: body.payee_type || 'individual',
                is_resident: body.is_resident ?? true
            };
            break;

        case 'cgt':
            if (!body.proceeds || !body.cost_basis) {
                return {
                    body: JSON.stringify({
                        error: 'Missing required fields: proceeds, cost_basis',
                        code: 'VALIDATION_ERROR'
                    }),
                    status: 400
                };
            }
            params = {
                proceeds: body.proceeds,
                cost_basis: body.cost_basis,
                expenses: body.expenses || 0,
                asset_type: body.asset_type || 'other'
            };
            break;

        case 'stamp':
            if (!body.amount || !body.instrument_type) {
                return {
                    body: JSON.stringify({
                        error: 'Missing required fields: amount, instrument_type',
                        code: 'VALIDATION_ERROR'
                    }),
                    status: 400
                };
            }
            params = {
                amount: body.amount,
                instrument_type: body.instrument_type
            };
            break;

        case 'levy':
            if (!body.cit_amount) {
                return {
                    body: JSON.stringify({
                        error: 'Missing required field: cit_amount',
                        code: 'VALIDATION_ERROR'
                    }),
                    status: 400
                };
            }
            params = { cit_amount: body.cit_amount };
            break;

        case 'metr':
            if (!body.profits) {
                return {
                    body: JSON.stringify({
                        error: 'Missing required field: profits',
                        code: 'VALIDATION_ERROR'
                    }),
                    status: 400
                };
            }
            params = {
                profits: body.profits,
                losses_brought_forward: body.losses_brought_forward || 0,
                turnover: body.turnover
            };
            break;
    }

    try {
        // Call central tax-calculate function
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const response = await fetch(`${supabaseUrl}/functions/v1/tax-calculate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
            },
            body: JSON.stringify({
                tax_type: mappedType,
                params,
                api_key_id: apiKey.id,
                user_id: apiKey.user_id
            })
        });

        const calcResult = await response.json();

        if (!calcResult.success) {
            return {
                body: JSON.stringify({
                    error: calcResult.error || 'Calculation failed',
                    code: 'CALCULATION_ERROR'
                }),
                status: 400
            };
        }

        return {
            body: JSON.stringify({
                success: true,
                data: calcResult.result,
                meta: {
                    request_id: crypto.randomUUID(),
                    rules_version: calcResult.metadata?.rules_version || new Date().toISOString().split('T')[0],
                    tier: apiKey.tier,
                    tax_type: mappedType
                }
            }),
            status: 200
        };
    } catch (error) {
        console.error('[API Gateway] Tax calculation error:', error);
        return {
            body: JSON.stringify({
                error: 'Tax calculation service unavailable',
                code: 'SERVICE_ERROR'
            }),
            status: 503
        };
    }
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
 * Validate user subscription for paid tiers
 */
async function validateSubscription(
    supabase: any,
    userId: string,
    requiredTier: string
): Promise<SubscriptionStatus> {
    const { data: subscription, error } = await supabase
        .from('api_subscriptions')
        .select('tier, status, current_period_end')
        .eq('user_id', userId)
        .single();

    if (error || !subscription) {
        return { tier: 'free', status: 'none', is_valid: false };
    }

    // Check if subscription is active and not expired
    const isActive = subscription.status === 'active';
    const isNotExpired = !subscription.current_period_end ||
        new Date(subscription.current_period_end) > new Date();

    // Check tier hierarchy (enterprise > business > starter > free)
    const tierHierarchy: Record<string, number> = {
        'free': 0,
        'starter': 1,
        'business': 2,
        'enterprise': 3
    };

    const hasSufficientTier = tierHierarchy[subscription.tier] >= tierHierarchy[requiredTier];

    return {
        tier: subscription.tier,
        status: subscription.status,
        is_valid: isActive && isNotExpired && hasSufficientTier
    };
}

// jsonResponse is imported from _shared/cors.ts
