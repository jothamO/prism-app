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

    const { userId, telegramId, authUserId, redirectUrl } = await req.json();

    // Use provided redirect URL or fall back to referer/default
    const baseRedirectUrl = redirectUrl || 
      req.headers.get('origin') || 
      'https://prism.tax';

    console.log('[mono-connect-init] Creating session for user:', userId || authUserId, 'redirect:', baseRedirectUrl);

    // Fetch user to get email - try userId first, then authUserId
    let user = null;
    
    if (userId) {
      const { data } = await supabase
        .from('users')
        .select('id, email, full_name')
        .eq('id', userId)
        .single();
      user = data;
    }
    
    // If no user found by id, try auth_user_id
    if (!user && authUserId) {
      const { data } = await supabase
        .from('users')
        .select('id, email, full_name')
        .eq('auth_user_id', authUserId)
        .single();
      user = data;
    }
    
    // If still no user and we have authUserId, create one for legacy users
    if (!user && authUserId) {
      console.log('[mono-connect-init] Creating user profile for legacy user:', authUserId);
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          auth_user_id: authUserId,
          email: `user_${authUserId.slice(0, 8)}@prism.tax`,
          full_name: 'PRISM User',
          onboarding_completed: true,
        })
        .select('id, email, full_name')
        .single();
      
      if (!createError) {
        user = newUser;
      }
    }
    
    const effectiveUserId = user?.id || userId;

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
          ref: effectiveUserId
        },
        scope: 'auth',
        redirect_url: `${baseRedirectUrl}/bank-connected?userId=${effectiveUserId}`
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
