import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Paystack plan codes - create these in your Paystack dashboard
const PLAN_CODES: Record<string, string> = {
  starter: Deno.env.get('PAYSTACK_PLAN_STARTER') || 'PLN_starter',
  business: Deno.env.get('PAYSTACK_PLAN_BUSINESS') || 'PLN_business',
  enterprise: Deno.env.get('PAYSTACK_PLAN_ENTERPRISE') || 'PLN_enterprise',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate environment
    if (!PAYSTACK_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required environment variables');
    }

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401);
    }

    // Create Supabase client with user token
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Get user from token
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return jsonResponse({ error: 'Invalid token' }, 401);
    }

    // Parse request body
    const { tier, callback_url } = await req.json();

    if (!tier || !['starter', 'business', 'enterprise'].includes(tier)) {
      return jsonResponse({ error: 'Invalid tier. Must be starter, business, or enterprise' }, 400);
    }

    // Look up user in public.users table
    const { data: publicUser, error: userError } = await supabase
      .from('users')
      .select('id, email, full_name, paystack_customer_code')
      .eq('email', user.email)
      .single();

    if (userError || !publicUser) {
      return jsonResponse({ error: 'User not found in system' }, 404);
    }

    let paystackCustomerCode = publicUser.paystack_customer_code;

    // Create Paystack customer if doesn't exist
    if (!paystackCustomerCode) {
      const customerResponse = await fetch('https://api.paystack.co/customer', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: publicUser.email,
          first_name: publicUser.full_name?.split(' ')[0] || '',
          last_name: publicUser.full_name?.split(' ').slice(1).join(' ') || '',
          metadata: {
            user_id: publicUser.id,
            source: 'prism_api',
          },
        }),
      });

      const customerData = await customerResponse.json();

      if (!customerData.status) {
        console.error('Paystack customer creation failed:', customerData);
        return jsonResponse({ error: 'Failed to create payment profile' }, 500);
      }

      paystackCustomerCode = customerData.data.customer_code;

      // Save customer code to user
      await supabase
        .from('users')
        .update({ paystack_customer_code: paystackCustomerCode })
        .eq('id', publicUser.id);
    }

    // Check for existing active subscription
    const { data: existingSub } = await supabase
      .from('api_subscriptions')
      .select('*')
      .eq('user_id', publicUser.id)
      .eq('status', 'active')
      .single();

    if (existingSub && existingSub.tier === tier) {
      return jsonResponse({ 
        error: 'You already have an active subscription for this tier',
        current_tier: existingSub.tier 
      }, 400);
    }

    // Generate unique reference
    const reference = `PRISM_API_${publicUser.id.substring(0, 8)}_${Date.now()}`;

    // Initialize subscription transaction
    const initResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: publicUser.email,
        plan: PLAN_CODES[tier],
        reference,
        callback_url: callback_url || `${req.headers.get('origin')}/developers?subscription=success`,
        metadata: {
          user_id: publicUser.id,
          tier,
          type: 'api_subscription',
          cancel_action: callback_url || `${req.headers.get('origin')}/developers?subscription=cancelled`,
        },
      }),
    });

    const initData = await initResponse.json();

    if (!initData.status) {
      console.error('Paystack initialization failed:', initData);
      return jsonResponse({ error: 'Failed to initialize payment' }, 500);
    }

    // Create or update subscription record as pending
    const { error: subError } = await supabase
      .from('api_subscriptions')
      .upsert({
        user_id: publicUser.id,
        tier: tier,
        status: 'inactive', // Will be activated by webhook
        paystack_customer_code: paystackCustomerCode,
        paystack_plan_code: PLAN_CODES[tier],
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (subError) {
      console.error('Failed to create subscription record:', subError);
    }

    return jsonResponse({
      authorization_url: initData.data.authorization_url,
      access_code: initData.data.access_code,
      reference: initData.data.reference,
    });

  } catch (error: unknown) {
    console.error('Error in paystack-initialize:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonResponse({ error: message }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
