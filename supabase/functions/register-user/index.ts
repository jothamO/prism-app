import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RegistrationRequest {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  workStatus: string;
  incomeType: string;
  bankSetup: string;
  consent: boolean;
  platform: 'telegram' | 'whatsapp';
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body: RegistrationRequest = await req.json();
    
    console.log('[register-user] Processing registration for:', body.email);

    // Validate required fields
    if (!body.fullName || !body.email || !body.phone || !body.password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!body.consent) {
      return new Response(
        JSON.stringify({ success: false, error: 'Consent is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if email already exists in users table
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', body.email)
      .single();

    if (existingUser) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email already registered. Please log in instead.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase Auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: body.fullName,
        phone: body.phone
      }
    });

    if (authError) {
      console.error('[register-user] Auth error:', authError);
      return new Response(
        JSON.stringify({ success: false, error: authError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authUserId = authData.user.id;
    console.log('[register-user] Auth user created:', authUserId);

    // Insert into users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert({
        full_name: body.fullName,
        email: body.email,
        phone: body.phone,
        work_status: body.workStatus,
        income_type: body.incomeType,
        bank_setup: body.bankSetup,
        consent_given: body.consent,
        auth_user_id: authUserId,
        onboarding_completed: false
      })
      .select('id')
      .single();

    if (userError) {
      console.error('[register-user] User insert error:', userError);
      // Rollback: delete auth user
      await supabase.auth.admin.deleteUser(authUserId);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = userData.id;
    console.log('[register-user] User created:', userId);

    // Generate secure token
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store token
    const { error: tokenError } = await supabase
      .from('telegram_auth_tokens')
      .insert({
        user_id: userId,
        token: token,
        expires_at: expiresAt.toISOString()
      });

    if (tokenError) {
      console.error('[register-user] Token insert error:', tokenError);
      // Continue anyway - user can request new token later
    }

    // Generate Telegram deep link
    // Replace with your actual bot username
    const botUsername = 'PrismTaxBot';
    const telegramLink = `https://t.me/${botUsername}?start=${token}`;

    console.log('[register-user] Registration complete, telegram link generated');

    return new Response(
      JSON.stringify({
        success: true,
        userId: userId,
        telegramLink: telegramLink,
        expiresIn: 900 // 15 minutes in seconds
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[register-user] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
