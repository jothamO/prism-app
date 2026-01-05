import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RegistrationRequest {
  // Required fields
  fullName: string;
  email: string;
  phone: string;
  password: string;
  consent: boolean;
  platform: 'telegram' | 'whatsapp' | 'web';

  // Legacy fields (for backwards compatibility)
  workStatus?: string;
  incomeType?: string;
  bankSetup?: string;

  // New profile fields (V2)
  accountType?: 'personal' | 'business';
  occupation?: string;
  location?: string;
  taxCategory?: string;
  tellUsAboutYourself?: string;

  // Income source flags
  hasBusinessIncome?: boolean;
  hasSalaryIncome?: boolean;
  hasFreelanceIncome?: boolean;
  hasPensionIncome?: boolean;
  hasRentalIncome?: boolean;
  hasInvestmentIncome?: boolean;
  informalBusiness?: boolean;

  // AI extraction confidence (0.0 - 1.0)
  profileConfidence?: number;

  // Optional KYC fields
  nin?: string;
  bvn?: string;
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
    
    console.log('[register-user] Processing registration for:', body.email, 'accountType:', body.accountType);

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

    // Build user insert payload with new V2 fields
    const userPayload: Record<string, unknown> = {
      full_name: body.fullName,
      email: body.email,
      phone: body.phone,
      consent_given: body.consent,
      auth_user_id: authUserId,
      onboarding_completed: false,

      // Legacy fields
      work_status: body.workStatus,
      income_type: body.incomeType,
      bank_setup: body.bankSetup,

      // V2 profile fields
      account_type: body.accountType || 'personal',
      occupation: body.occupation,
      location: body.location,
      tax_category: body.taxCategory,
      tell_us_about_yourself: body.tellUsAboutYourself,

      // Income flags
      has_business_income: body.hasBusinessIncome || false,
      has_salary_income: body.hasSalaryIncome || false,
      has_freelance_income: body.hasFreelanceIncome || false,
      has_pension_income: body.hasPensionIncome || false,
      has_rental_income: body.hasRentalIncome || false,
      has_investment_income: body.hasInvestmentIncome || false,
      informal_business: body.informalBusiness || false,

      // AI confidence
      profile_confidence: body.profileConfidence,

      // Optional KYC
      nin: body.nin,
      bvn: body.bvn,
    };

    // Remove undefined values
    Object.keys(userPayload).forEach(key => {
      if (userPayload[key] === undefined) {
        delete userPayload[key];
      }
    });

    // Insert into users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert(userPayload)
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
    console.log('[register-user] User created:', userId, 'accountType:', body.accountType);

    // Generate secure token for bot linking
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store token in telegram_auth_tokens
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
    const botUsername = 'PrismTaxBot';
    const telegramLink = `https://t.me/${botUsername}?start=${token}`;

    console.log('[register-user] Registration complete');

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
