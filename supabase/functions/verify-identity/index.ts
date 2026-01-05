import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerifyRequest {
  userId: string;
  type: 'nin' | 'tin' | 'cac' | 'bvn';
  value: string;
  businessId?: string;
}

interface MonoResponse {
  status: string;
  message: string;
  data?: Record<string, unknown>;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const monoSecretKey = Deno.env.get('MONO_SECRET_KEY');

    if (!monoSecretKey) {
      console.error('MONO_SECRET_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Identity verification service not configured' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body: VerifyRequest = await req.json();

    console.log('Verification request:', { userId: body.userId, type: body.type, valueLength: body.value?.length });

    // Validate request
    if (!body.userId || !body.type || !body.value) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userId, type, value' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate verification type
    const validTypes = ['nin', 'tin', 'cac', 'bvn'];
    if (!validTypes.includes(body.type)) {
      return new Response(
        JSON.stringify({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call Mono API based on type
    let monoEndpoint: string;
    let monoMethod: 'GET' | 'POST' = 'GET';
    let monoBody: Record<string, unknown> | undefined;

    switch (body.type) {
      case 'nin':
        monoEndpoint = `https://api.withmono.com/v3/lookup/nin/${body.value}`;
        break;
      case 'bvn':
        monoEndpoint = `https://api.withmono.com/v3/lookup/bvn/accounts`;
        monoMethod = 'POST';
        monoBody = { bvn: body.value };
        break;
      case 'tin':
        monoEndpoint = `https://api.withmono.com/v3/lookup/tin/${body.value}`;
        break;
      case 'cac':
        monoEndpoint = `https://api.withmono.com/v3/lookup/cac/search?query=${encodeURIComponent(body.value)}`;
        break;
    }

    console.log('Calling Mono API:', { endpoint: monoEndpoint, method: monoMethod });

    const monoResponse = await fetch(monoEndpoint, {
      method: monoMethod,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'mono-sec-key': monoSecretKey,
      },
      body: monoBody ? JSON.stringify(monoBody) : undefined,
    });

    const monoData: MonoResponse = await monoResponse.json();
    console.log('Mono API response:', { status: monoResponse.status, message: monoData.message });

    if (!monoResponse.ok) {
      console.error('Mono API error:', monoData);
      return new Response(
        JSON.stringify({ 
          error: 'Verification failed', 
          details: monoData.message || 'Unknown error from verification service'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update database based on verification type
    let updateResult;
    const verifiedAt = new Date().toISOString();

    if (body.type === 'nin') {
      const ninData = monoData.data as { first_name?: string; last_name?: string; middle_name?: string } | undefined;
      const verifiedName = ninData 
        ? `${ninData.first_name || ''} ${ninData.middle_name || ''} ${ninData.last_name || ''}`.trim()
        : null;

      updateResult = await supabase
        .from('users')
        .update({
          nin: body.value,
          nin_verified: true,
          nin_verified_name: verifiedName,
          kyc_level: 1,
          updated_at: verifiedAt,
        })
        .eq('id', body.userId);

      console.log('Updated user NIN verification:', { userId: body.userId, verifiedName });

    } else if (body.type === 'bvn') {
      const bvnData = monoData.data as { accounts?: Array<{ name?: string }> } | undefined;
      const verifiedName = bvnData?.accounts?.[0]?.name || null;

      updateResult = await supabase
        .from('users')
        .update({
          bvn: body.value,
          bvn_verified: true,
          bvn_verified_name: verifiedName,
          kyc_level: 2,
          updated_at: verifiedAt,
        })
        .eq('id', body.userId);

      console.log('Updated user BVN verification:', { userId: body.userId, verifiedName });

    } else if (body.type === 'tin') {
      if (!body.businessId) {
        return new Response(
          JSON.stringify({ error: 'businessId required for TIN verification' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      updateResult = await supabase
        .from('businesses')
        .update({
          tin: body.value,
          tin_verified: true,
          tin_data: monoData.data,
          updated_at: verifiedAt,
        })
        .eq('id', body.businessId);

      console.log('Updated business TIN verification:', { businessId: body.businessId });

    } else if (body.type === 'cac') {
      if (!body.businessId) {
        return new Response(
          JSON.stringify({ error: 'businessId required for CAC verification' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      updateResult = await supabase
        .from('businesses')
        .update({
          cac_number: body.value,
          cac_verified: true,
          cac_data: monoData.data,
          updated_at: verifiedAt,
        })
        .eq('id', body.businessId);

      console.log('Updated business CAC verification:', { businessId: body.businessId });
    }

    if (updateResult?.error) {
      console.error('Database update error:', updateResult.error);
      return new Response(
        JSON.stringify({ error: 'Failed to save verification result', details: updateResult.error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        type: body.type,
        verified: true,
        data: monoData.data,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Verification error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
