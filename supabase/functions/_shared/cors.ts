/**
 * Shared CORS Headers and Response Utilities
 * Use this across all edge functions for consistent CORS handling
 */

export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-api-key, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

/**
 * Handle CORS preflight request
 */
export function handleCors(req: Request): Response | null {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }
    return null;
}

/**
 * Create a JSON response with CORS headers
 */
export function jsonResponse(
    data: unknown,
    status: number = 200,
    extraHeaders: Record<string, string> = {}
): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            ...extraHeaders
        }
    });
}

/**
 * Create an error response
 */
export function errorResponse(
    message: string,
    status: number = 400,
    code?: string
): Response {
    return jsonResponse({
        error: message,
        code: code || 'ERROR',
        success: false
    }, status);
}

/**
 * Create a success response
 */
export function successResponse<T>(data: T, meta?: Record<string, unknown>): Response {
    return jsonResponse({
        success: true,
        data,
        ...(meta && { meta })
    });
}
