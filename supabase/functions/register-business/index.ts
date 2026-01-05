import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RegisterBusinessRequest {
  userId: string;
  name: string;
  registrationNumber?: string;
  registrationType?: string;
  tin?: string;
  cacNumber?: string;
  industry?: string;
  industryCode?: string;
  businessType?: string;
  companySize?: string;
  revenueRange?: string;
  taxCategory?: string;
  tellUsAboutBusiness?: string;
  handlesProjectFunds?: boolean;
  receivesCapitalSupport?: boolean;
  capitalSource?: string;
  accountSetup?: string;
  vatRegistered?: boolean;
  informalBusiness?: boolean;
  isPrimary?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: RegisterBusinessRequest = await req.json();

    console.log('Business registration request:', { 
      userId: body.userId, 
      name: body.name,
      registrationNumber: body.registrationNumber 
    });

    // Validate required fields
    if (!body.userId || !body.name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userId, name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, full_name')
      .eq('id', body.userId)
      .single();

    if (userError || !user) {
      console.error('User not found:', userError);
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate registration number if not provided
    const registrationNumber = body.registrationNumber || `PRISM-${Date.now()}`;

    // Check for existing business with same registration number
    const { data: existingBusiness } = await supabase
      .from('businesses')
      .select('id')
      .eq('registration_number', registrationNumber)
      .single();

    if (existingBusiness) {
      return new Response(
        JSON.stringify({ error: 'Business with this registration number already exists' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if this should be the primary business
    const { data: existingBusinesses } = await supabase
      .from('businesses')
      .select('id')
      .eq('owner_user_id', body.userId);

    const isPrimary = body.isPrimary ?? (existingBusinesses?.length === 0);

    // Insert business record
    const { data: business, error: insertError } = await supabase
      .from('businesses')
      .insert({
        user_id: body.userId,
        owner_user_id: body.userId,
        name: body.name,
        registration_number: registrationNumber,
        registration_type: body.registrationType || 'sole_proprietor',
        tin: body.tin,
        cac_number: body.cacNumber,
        cac_registration_number: body.cacNumber,
        industry: body.industry,
        industry_code: body.industryCode,
        business_type: body.businessType,
        company_size: body.companySize || 'small',
        revenue_range: body.revenueRange,
        tax_category: body.taxCategory,
        tell_us_about_business: body.tellUsAboutBusiness,
        handles_project_funds: body.handlesProjectFunds || false,
        receives_capital_support: body.receivesCapitalSupport || false,
        capital_source: body.capitalSource,
        account_setup: body.accountSetup || 'mixed',
        vat_registered: body.vatRegistered || false,
        informal_business: body.informalBusiness || false,
        is_primary: isPrimary,
        is_default: isPrimary,
        onboarding_completed: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Business insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create business', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Business created:', { businessId: business.id, name: business.name });

    // Update user account type to 'business' if registering a business
    await supabase
      .from('users')
      .update({ 
        account_type: 'business',
        has_business_income: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.userId);

    // Trigger CAC/TIN verification if numbers provided
    const verificationStatus = {
      cac: null as boolean | null,
      tin: null as boolean | null,
    };

    const monoSecretKey = Deno.env.get('MONO_SECRET_KEY');
    
    if (monoSecretKey && body.cacNumber) {
      try {
        const cacResponse = await fetch(`https://api.withmono.com/v3/lookup/cac/search?query=${encodeURIComponent(body.cacNumber)}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'mono-sec-key': monoSecretKey,
          },
        });

        if (cacResponse.ok) {
          const cacData = await cacResponse.json();
          await supabase
            .from('businesses')
            .update({
              cac_verified: true,
              cac_data: cacData.data,
            })
            .eq('id', business.id);
          verificationStatus.cac = true;
          console.log('CAC verified:', { businessId: business.id });
        }
      } catch (err) {
        console.error('CAC verification failed:', err);
        verificationStatus.cac = false;
      }
    }

    if (monoSecretKey && body.tin) {
      try {
        const tinResponse = await fetch(`https://api.withmono.com/v3/lookup/tin/${body.tin}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'mono-sec-key': monoSecretKey,
          },
        });

        if (tinResponse.ok) {
          const tinData = await tinResponse.json();
          await supabase
            .from('businesses')
            .update({
              tin_verified: true,
              tin_data: tinData.data,
            })
            .eq('id', business.id);
          verificationStatus.tin = true;
          console.log('TIN verified:', { businessId: business.id });
        }
      } catch (err) {
        console.error('TIN verification failed:', err);
        verificationStatus.tin = false;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        businessId: business.id,
        name: business.name,
        registrationNumber: business.registration_number,
        isPrimary,
        verification: verificationStatus,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Business registration error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
