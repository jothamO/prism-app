import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";


serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const accessToken = Deno.env.get('SUPABASE_ACCESS_TOKEN');

        if (!accessToken) {
            return new Response(JSON.stringify({
                error: 'SUPABASE_ACCESS_TOKEN not configured',
                configured: false,
                help: 'Generate a token at https://supabase.com/dashboard/account/tokens'
            }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Return masked key for security (show first 8 and last 4 chars)
        const maskedKey = accessToken.length > 12
            ? `${accessToken.substring(0, 8)}...${accessToken.substring(accessToken.length - 4)}`
            : '***configured***';

        console.log('[get-supabase-access-token] Token retrieved successfully');

        return new Response(JSON.stringify({
            configured: true,
            keyPreview: maskedKey,
            keyLength: accessToken.length,
            // For CLI deployment - full token needed
            fullKey: accessToken
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('[get-supabase-access-token] Error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
