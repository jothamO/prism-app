import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { extractProfileWithAI } from '../_shared/profile-extractor.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RegistrationRequest {
  accountType: 'personal' | 'business';
  fullName: string;
  email: string;
  phone: string;
  password: string;
  // Freeform profile
  tellUsAboutYourself?: string;
  // Quick-select options
  workStatus?: string;
  incomeType?: string;
  // KYC fields
  nin?: string;
  ninVerified?: boolean;
  ninVerifiedName?: string;
  bvn?: string;
  bvnVerified?: boolean;
  bvnVerifiedName?: string;
  // Bank intent
  bankSetup: string;
  consent: boolean;
  platform: 'telegram' | 'whatsapp';
}

serve(async (req) => {
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

    // Check if email already exists
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

    // Extract profile using Claude Haiku AI
    console.log('[register-user] Extracting profile with Claude Haiku...');
    const profile = await extractProfileWithAI(
      body.tellUsAboutYourself || '',
      body.fullName,
      body.workStatus
    );
    console.log('[register-user] Extracted profile:', profile);

    // Create Supabase Auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        full_name: body.fullName,
        phone: body.phone,
        account_type: body.accountType || 'personal',
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

    // Calculate KYC level
    let kycLevel = 0;
    if (body.ninVerified) kycLevel++;
    if (body.bvnVerified) kycLevel++;

    // Insert into users table with AI-extracted profile data
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert({
        full_name: body.fullName,
        email: body.email,
        phone: body.phone,
        auth_user_id: authUserId,
        // Profile data
        account_type: body.accountType || 'personal',
        work_status: body.workStatus || profile.entityType,
        income_type: body.incomeType,
        tell_us_about_yourself: body.tellUsAboutYourself,
        // AI-extracted fields (from Claude Haiku)
        tax_category: profile.taxCategory,
        entity_type: profile.entityType,
        occupation: profile.occupation,
        location: profile.location,
        has_business_income: profile.hasBusinessIncome,
        has_salary_income: profile.hasSalaryIncome,
        has_freelance_income: profile.hasFreelanceIncome,
        has_pension_income: profile.hasPensionIncome,
        has_rental_income: profile.hasRentalIncome,
        has_investment_income: profile.hasInvestmentIncome,
        informal_business: profile.informalBusiness,
        profile_confidence: profile.confidence,
        // KYC fields
        nin: body.nin,
        nin_verified: body.ninVerified || false,
        nin_verified_name: body.ninVerifiedName,
        bvn: body.bvn,
        bvn_verified: body.bvnVerified || false,
        bvn_verified_name: body.bvnVerifiedName,
        kyc_level: kycLevel,
        // Other
        bank_setup: body.bankSetup,
        consent_given: body.consent,
        onboarding_completed: false,
      })
      .select('id')
      .single();

    if (userError) {
      console.error('[register-user] User insert error:', userError);
      await supabase.auth.admin.deleteUser(authUserId);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = userData.id;
    console.log('[register-user] User created:', userId, 'with AI-extracted profile');

    return new Response(
      JSON.stringify({
        success: true,
        userId: userId,
        profile: {
          taxCategory: profile.taxCategory,
          entityType: profile.entityType,
          occupation: profile.occupation,
          kycLevel,
          aiConfidence: profile.confidence,
        }
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
