import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!serviceKey) {
            return new Response(JSON.stringify({
                error: 'SUPABASE_SERVICE_ROLE_KEY not configured',
                configured: false
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Return masked key for security (show first 8 and last 4 chars)
        const maskedKey = serviceKey.length > 12
            ? `${serviceKey.substring(0, 8)}...${serviceKey.substring(serviceKey.length - 4)}`
            : '***configured***';

        console.log('[get-service-key] Key retrieved successfully');

        return new Response(JSON.stringify({
            configured: true,
            keyPreview: maskedKey,
            keyLength: serviceKey.length,
            // For debugging - remove in production
            fullKey: serviceKey
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('[get-service-key] Error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
