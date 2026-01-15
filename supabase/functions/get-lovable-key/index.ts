import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";


serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

        if (!lovableApiKey) {
            return new Response(JSON.stringify({
                error: 'LOVABLE_API_KEY not configured',
                configured: false
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Return masked key for security (show first 8 and last 4 chars)
        const maskedKey = lovableApiKey.length > 12
            ? `${lovableApiKey.substring(0, 8)}...${lovableApiKey.substring(lovableApiKey.length - 4)}`
            : '***configured***';

        console.log('[get-lovable-key] Key retrieved successfully');

        return new Response(JSON.stringify({
            configured: true,
            keyPreview: maskedKey,
            keyLength: lovableApiKey.length,
            // For debugging - remove in production
            fullKey: lovableApiKey
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('[get-lovable-key] Error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
