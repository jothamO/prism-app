import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Verify Paystack signature
    const signature = req.headers.get('x-paystack-signature');
    const body = await req.text();

    if (!signature || !(await verifySignature(body, signature))) {
      console.error('Invalid Paystack signature');
      return new Response('Invalid signature', { status: 401 });
    }

    const event = JSON.parse(body);
    console.log('Paystack webhook event:', event.event);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Handle different event types
    switch (event.event) {
      case 'subscription.create':
        await handleSubscriptionCreate(supabase, event.data);
        break;

      case 'subscription.not_renew':
        await handleSubscriptionNotRenew(supabase, event.data);
        break;

      case 'subscription.disable':
        await handleSubscriptionDisable(supabase, event.data);
        break;

      case 'charge.success':
        await handleChargeSuccess(supabase, event.data);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(supabase, event.data);
        break;

      case 'invoice.create':
      case 'invoice.update':
        // Log for tracking, no action needed
        console.log('Invoice event received:', event.event, event.data.subscription_code);
        break;

      default:
        console.log('Unhandled event type:', event.event);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Webhook error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

async function verifySignature(body: string, signature: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(PAYSTACK_SECRET_KEY),
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hash === signature;
  } catch {
    return false;
  }
}

async function handleSubscriptionCreate(supabase: any, data: any) {
  const { subscription_code, plan, customer, next_payment_date, status } = data;
  
  // Find user by email
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('email', customer.email)
    .single();

  if (userError || !user) {
    console.error('User not found for subscription:', customer.email);
    return;
  }

  // Determine tier from plan code
  const tier = getTierFromPlan(plan.plan_code);

  // Update subscription
  const { error: updateError } = await supabase
    .from('api_subscriptions')
    .upsert({
      user_id: user.id,
      tier,
      status: status === 'active' ? 'active' : 'inactive',
      paystack_subscription_code: subscription_code,
      paystack_customer_code: customer.customer_code,
      paystack_plan_code: plan.plan_code,
      current_period_start: new Date().toISOString(),
      current_period_end: next_payment_date,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    });

  if (updateError) {
    console.error('Failed to update subscription:', updateError);
    return;
  }

  // Update API keys to new tier
  await supabase
    .from('api_keys')
    .update({ tier })
    .eq('user_id', user.id)
    .eq('is_active', true);

  console.log(`Subscription created for user ${user.id} at tier ${tier}`);
}

async function handleSubscriptionNotRenew(supabase: any, data: any) {
  const { subscription_code } = data;

  // Mark subscription as ending at period end
  const { error } = await supabase
    .from('api_subscriptions')
    .update({ 
      cancel_at_period_end: true,
      updated_at: new Date().toISOString(),
    })
    .eq('paystack_subscription_code', subscription_code);

  if (error) {
    console.error('Failed to mark subscription for cancellation:', error);
  }
}

async function handleSubscriptionDisable(supabase: any, data: any) {
  const { subscription_code } = data;

  // Get subscription to find user
  const { data: sub, error: subError } = await supabase
    .from('api_subscriptions')
    .select('user_id')
    .eq('paystack_subscription_code', subscription_code)
    .single();

  if (subError || !sub) {
    console.error('Subscription not found:', subscription_code);
    return;
  }

  // Downgrade subscription to free
  await supabase
    .from('api_subscriptions')
    .update({ 
      tier: 'free',
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('paystack_subscription_code', subscription_code);

  // Downgrade API keys to free tier
  await supabase
    .from('api_keys')
    .update({ tier: 'free' })
    .eq('user_id', sub.user_id)
    .eq('is_active', true);

  console.log(`Subscription disabled for user ${sub.user_id}, downgraded to free`);
}

async function handleChargeSuccess(supabase: any, data: any) {
  const { reference, amount, customer, metadata, paid_at, channel, authorization } = data;

  // Skip if not an API subscription payment
  if (metadata?.type !== 'api_subscription') {
    console.log('Charge is not for API subscription, skipping');
    return;
  }

  // Find user
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('email', customer.email)
    .single();

  if (userError || !user) {
    console.error('User not found for charge:', customer.email);
    return;
  }

  // Get subscription
  const { data: sub } = await supabase
    .from('api_subscriptions')
    .select('id, tier')
    .eq('user_id', user.id)
    .single();

  // Record payment
  const { error: paymentError } = await supabase
    .from('api_payments')
    .upsert({
      user_id: user.id,
      api_subscription_id: sub?.id,
      paystack_reference: reference,
      amount_kobo: amount,
      currency: 'NGN',
      status: 'success',
      tier: metadata.tier || sub?.tier || 'starter',
      payment_method: channel || authorization?.channel,
      paid_at: paid_at,
      metadata: {
        authorization_code: authorization?.authorization_code,
        card_type: authorization?.card_type,
        last4: authorization?.last4,
        bank: authorization?.bank,
      },
    }, {
      onConflict: 'paystack_reference',
    });

  if (paymentError) {
    console.error('Failed to record payment:', paymentError);
  }

  // Update subscription status if it was past_due
  if (sub) {
    await supabase
      .from('api_subscriptions')
      .update({ 
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', sub.id)
      .eq('status', 'past_due');
  }

  console.log(`Payment recorded for user ${user.id}: ${amount / 100} NGN`);
}

async function handlePaymentFailed(supabase: any, data: any) {
  const { subscription, customer } = data;

  if (!subscription) return;

  // Find user
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', customer.email)
    .single();

  if (!user) return;

  // Mark subscription as past_due (grace period starts)
  await supabase
    .from('api_subscriptions')
    .update({ 
      status: 'past_due',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);

  console.log(`Payment failed for user ${user.id}, entering grace period`);

  // TODO: Send notification to user about failed payment
}

function getTierFromPlan(planCode: string): string {
  const planMap: Record<string, string> = {
    'PLN_starter': 'starter',
    'PLN_business': 'business',
    'PLN_enterprise': 'enterprise',
  };
  
  // Check exact match first
  if (planMap[planCode]) return planMap[planCode];
  
  // Check if plan code contains tier name
  const lowerPlan = planCode.toLowerCase();
  if (lowerPlan.includes('enterprise')) return 'enterprise';
  if (lowerPlan.includes('business')) return 'business';
  if (lowerPlan.includes('starter')) return 'starter';
  
  return 'free';
}
