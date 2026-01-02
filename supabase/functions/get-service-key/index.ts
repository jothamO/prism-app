import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    // Handle CORS
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // Get the auto-injected Supabase credentials
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

        return new Response(
            JSON.stringify({
                message: "Supabase credentials (auto-injected by Lovable)",
                supabaseUrl,
                supabaseServiceKey: supabaseServiceKey
                    ? `${supabaseServiceKey.substring(0, 50)}...`
                    : "NOT FOUND",
                supabaseAnonKey: supabaseAnonKey
                    ? `${supabaseAnonKey.substring(0, 50)}...`
                    : "NOT FOUND",
                fullServiceKey: supabaseServiceKey, // Full key for copying
                note: "Copy the 'fullServiceKey' value to Railway"
            }, null, 2),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500,
            }
        );
    }
});
