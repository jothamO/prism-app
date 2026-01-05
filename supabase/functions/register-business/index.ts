import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BusinessRegistrationRequest {
    // Business info
    businessName: string;
    cacNumber: string;
    cacVerified: boolean;
    cacData?: any;
    tin: string;
    tinVerified: boolean;
    tinData?: any;
    // Admin user
    adminName: string;
    adminRole: string;
    adminEmail: string;
    adminPhone: string;
    password: string;
    // Business context
    tellUsAboutBusiness: string;
    industry: string;
    revenueRange: string;
    handlesProjectFunds: string;
    // Compliance
    authorized: boolean;
    consent: boolean;
    bankSetup: string;
}

/**
 * Determine company size from revenue range
 */
function getCompanySize(revenueRange: string): 'small' | 'medium' | 'large' {
    switch (revenueRange) {
        case 'under_25m': return 'small';
        case '25m_100m': return 'medium';
        case 'over_100m': return 'large';
        default: return 'small';
    }
}

/**
 * Determine tax category based on company size and VAT status
 */
function getTaxCategory(revenueRange: string, vatRegistered: boolean): string {
    const size = getCompanySize(revenueRange);
    if (size === 'small') return 'small_company';
    if (size === 'medium') return vatRegistered ? 'medium_vat' : 'medium_company';
    return vatRegistered ? 'large_vat' : 'large_company';
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

        const body: BusinessRegistrationRequest = await req.json();

        console.log('[register-business] Processing registration for:', body.businessName);

        // Validate required fields
        if (!body.businessName || !body.cacNumber || !body.adminName || !body.adminEmail || !body.password) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing required fields' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!body.authorized || !body.consent) {
            return new Response(
                JSON.stringify({ success: false, error: 'Authorization and consent are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Check if email already exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', body.adminEmail)
            .single();

        if (existingUser) {
            return new Response(
                JSON.stringify({ success: false, error: 'Email already registered. Please log in instead.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Check if CAC already registered
        const { data: existingBusiness } = await supabase
            .from('businesses')
            .select('id')
            .eq('cac_number', body.cacNumber)
            .single();

        if (existingBusiness) {
            return new Response(
                JSON.stringify({ success: false, error: 'This business is already registered' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Determine VAT registration status
        const vatRegistered = body.tinData?.vat_registered || false;
        const taxCategory = getTaxCategory(body.revenueRange, vatRegistered);
        const companySize = getCompanySize(body.revenueRange);

        // Create Supabase Auth user
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: body.adminEmail,
            password: body.password,
            email_confirm: true,
            user_metadata: {
                full_name: body.adminName,
                phone: body.adminPhone,
                account_type: 'business',
                business_name: body.businessName,
            }
        });

        if (authError) {
            console.error('[register-business] Auth error:', authError);
            return new Response(
                JSON.stringify({ success: false, error: authError.message }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const authUserId = authData.user.id;
        console.log('[register-business] Auth user created:', authUserId);

        // Create user record
        const { data: userData, error: userError } = await supabase
            .from('users')
            .insert({
                full_name: body.adminName,
                email: body.adminEmail,
                phone: body.adminPhone,
                auth_user_id: authUserId,
                account_type: 'business',
                work_status: 'business',
                tax_category: taxCategory,
                bank_setup: body.bankSetup,
                consent_given: body.consent,
                onboarding_completed: false,
            })
            .select('id')
            .single();

        if (userError) {
            console.error('[register-business] User insert error:', userError);
            await supabase.auth.admin.deleteUser(authUserId);
            return new Response(
                JSON.stringify({ success: false, error: 'Failed to create user profile' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const userId = userData.id;

        // Create business record
        const { data: businessData, error: businessError } = await supabase
            .from('businesses')
            .insert({
                owner_user_id: userId,
                name: body.businessName,
                cac_number: body.cacNumber,
                cac_verified: body.cacVerified,
                cac_data: body.cacData,
                tin: body.tin || null,
                tin_verified: body.tinVerified,
                tin_data: body.tinData,
                vat_registered: vatRegistered,
                industry_code: body.industry,
                company_size: companySize,
                revenue_range: body.revenueRange,
                handles_project_funds: body.handlesProjectFunds === 'yes' || body.handlesProjectFunds === 'sometimes',
                tell_us_about_business: body.tellUsAboutBusiness,
                tax_category: taxCategory,
            })
            .select('id')
            .single();

        if (businessError) {
            console.error('[register-business] Business insert error:', businessError);
            // Don't delete user - they can link business later
        }

        console.log('[register-business] Business registered:', businessData?.id);

        return new Response(
            JSON.stringify({
                success: true,
                userId: userId,
                businessId: businessData?.id,
                profile: {
                    taxCategory,
                    companySize,
                    vatRegistered,
                }
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[register-business] Unexpected error:', error);
        return new Response(
            JSON.stringify({ success: false, error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
