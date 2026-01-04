import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const monoSecretKey = Deno.env.get('MONO_SECRET_KEY');

    if (!monoSecretKey) {
      return new Response(
        JSON.stringify({ error: 'Mono API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { userId, telegramId } = await req.json();

    console.log('[mono-connect-init] Creating session for user:', userId);

    // Fetch user to get email
    const { data: user } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('id', userId)
      .single();

    // Create Mono Connect session
    const monoResponse = await fetch('https://api.withmono.com/v2/accounts/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'mono-sec-key': monoSecretKey
      },
      body: JSON.stringify({
        customer: {
          name: user?.full_name || 'PRISM User',
          email: user?.email || `user_${userId}@prism.tax`
        },
        meta: {
          ref: userId
        },
        scope: 'auth',
        redirect_url: `https://prism.tax/bank-connected?userId=${userId}`
      })
    });

    if (!monoResponse.ok) {
      const errorText = await monoResponse.text();
      console.error('[mono-connect-init] Mono API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to initialize Mono Connect' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const monoData = await monoResponse.json();
    console.log('[mono-connect-init] Mono session created');

    return new Response(
      JSON.stringify({
        success: true,
        connectUrl: monoData.mono_url || monoData.data?.mono_url,
        sessionId: monoData.id || monoData.data?.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[mono-connect-init] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
