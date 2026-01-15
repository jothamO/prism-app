import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { extractProfileWithAI } from '../_shared/profile-extractor.ts';
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";


interface RegistrationRequest {
  // Required fields
  fullName: string;
  email: string;
  phone: string;
  password: string;
  consent: boolean;
  platform: 'telegram' | 'whatsapp' | 'web';

  // V2 profile fields
  accountType?: 'personal' | 'business';
  workStatus?: string;
  incomeType?: string;
  bankSetup?: string;
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
  profileConfidence?: number;

  // KYC fields
  nin?: string;
  ninVerified?: boolean;
  ninVerifiedName?: string;
  bvn?: string;
  bvnVerified?: boolean;
  bvnVerifiedName?: string;
}

/**
 * Validate password strength
 * Must have: 8+ chars, uppercase, lowercase, number, special char
 */
function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain an uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain a lowercase letter');
  }
  if (!/\d/.test(password)) {
    errors.push('Password must contain a number');
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain a special character');
  }
  
  return { valid: errors.length === 0, errors };
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

    console.log('[register-user] Processing registration for:', body.email, 'platform:', body.platform);

    // Validate required fields
    if (!body.fullName || !body.email || !body.phone || !body.password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(body.password);
    if (!passwordValidation.valid) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Password does not meet requirements',
          passwordErrors: passwordValidation.errors 
        }),
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

    // Extract profile using Claude Haiku AI (if text provided)
    let profile = {
      entityType: body.workStatus || 'individual',
      taxCategory: body.taxCategory || 'salary_earner',
      occupation: body.occupation,
      location: body.location,
      hasBusinessIncome: body.hasBusinessIncome || false,
      hasSalaryIncome: body.hasSalaryIncome || false,
      hasFreelanceIncome: body.hasFreelanceIncome || false,
      hasPensionIncome: body.hasPensionIncome || false,
      hasRentalIncome: body.hasRentalIncome || false,
      hasInvestmentIncome: body.hasInvestmentIncome || false,
      informalBusiness: body.informalBusiness || false,
      confidence: body.profileConfidence || 0.5,
    };

    if (body.tellUsAboutYourself) {
      console.log('[register-user] Extracting profile with Claude Haiku...');
      try {
        const aiProfile = await extractProfileWithAI(
          body.tellUsAboutYourself,
          body.fullName,
          body.workStatus
        );
        profile = { ...profile, ...aiProfile };
        console.log('[register-user] AI extracted profile:', profile);
      } catch (aiError) {
        console.warn('[register-user] AI extraction failed, using defaults:', aiError);
      }
    }

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

    // Build user payload
    const userPayload: Record<string, unknown> = {
      full_name: body.fullName,
      email: body.email,
      phone: body.phone,
      auth_user_id: authUserId,
      consent_given: body.consent,
      onboarding_completed: false,
      // Profile
      account_type: body.accountType || 'personal',
      work_status: body.workStatus || profile.entityType,
      income_type: body.incomeType,
      bank_setup: body.bankSetup,
      tell_us_about_yourself: body.tellUsAboutYourself,
      // AI-extracted fields
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
      // KYC
      nin: body.nin,
      nin_verified: body.ninVerified || false,
      nin_verified_name: body.ninVerifiedName,
      bvn: body.bvn,
      bvn_verified: body.bvnVerified || false,
      bvn_verified_name: body.bvnVerifiedName,
      kyc_level: kycLevel,
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
      await supabase.auth.admin.deleteUser(authUserId);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = userData.id;
    console.log('[register-user] User created:', userId);

    // For telegram platform, generate token immediately
    let telegramLink = null;
    if (body.platform === 'telegram') {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      const { error: tokenError } = await supabase
        .from('telegram_auth_tokens')
        .insert({
          user_id: userId,
          token: token,
          expires_at: expiresAt.toISOString()
        });

      if (!tokenError) {
        const botUsername = 'prism_tax_bot';
        telegramLink = `https://t.me/${botUsername}?start=${token}`;
      } else {
        console.error('[register-user] Token insert error:', tokenError);
      }
    }

    console.log('[register-user] Registration complete');

    return new Response(
      JSON.stringify({
        success: true,
        userId: userId,
        telegramLink,
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
