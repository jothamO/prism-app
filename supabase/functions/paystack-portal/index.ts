import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";


const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!PAYSTACK_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required environment variables');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return jsonResponse({ error: 'Invalid token' }, 401);
    }

    const { action } = await req.json();

    // Get user's subscription
    const { data: publicUser } = await supabase
      .from('users')
      .select('id, paystack_customer_code')
      .eq('email', user.email)
      .single();

    if (!publicUser?.paystack_customer_code) {
      return jsonResponse({ error: 'No payment profile found' }, 404);
    }

    // Get subscription
    const { data: subscription } = await supabase
      .from('api_subscriptions')
      .select('*')
      .eq('user_id', publicUser.id)
      .single();

    if (action === 'get_subscription') {
      return jsonResponse({ 
        subscription: subscription || { tier: 'free', status: 'inactive' },
      });
    }

    if (action === 'cancel') {
      if (!subscription?.paystack_subscription_code) {
        return jsonResponse({ error: 'No active subscription to cancel' }, 400);
      }

      // Cancel subscription via Paystack
      const cancelResponse = await fetch(
        `https://api.paystack.co/subscription/disable`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: subscription.paystack_subscription_code,
            token: subscription.paystack_customer_code,
          }),
        }
      );

      const cancelData = await cancelResponse.json();

      if (!cancelData.status) {
        console.error('Failed to cancel subscription:', cancelData);
        return jsonResponse({ error: 'Failed to cancel subscription' }, 500);
      }

      // Update local subscription
      await supabase
        .from('api_subscriptions')
        .update({ 
          cancel_at_period_end: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id);

      return jsonResponse({ 
        message: 'Subscription will be cancelled at the end of the billing period',
        ends_at: subscription.current_period_end,
      });
    }

    if (action === 'get_payment_history') {
      const { data: payments } = await supabase
        .from('api_payments')
        .select('*')
        .eq('user_id', publicUser.id)
        .order('created_at', { ascending: false })
        .limit(20);

      return jsonResponse({ payments: payments || [] });
    }

    if (action === 'get_invoices') {
      // Fetch invoices from Paystack
      const invoicesResponse = await fetch(
        `https://api.paystack.co/subscription/${subscription?.paystack_subscription_code}/invoices`,
        {
          headers: {
            'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
          },
        }
      );

      const invoicesData = await invoicesResponse.json();

      return jsonResponse({ 
        invoices: invoicesData.status ? invoicesData.data : [],
      });
    }

    return jsonResponse({ error: 'Invalid action' }, 400);

  } catch (error: unknown) {
    console.error('Error in paystack-portal:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonResponse({ error: message }, 500);
  }
});
// jsonResponse is imported from _shared/cors.ts
