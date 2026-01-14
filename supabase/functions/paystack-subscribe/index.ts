import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, handleCors } from '../_shared/cors.ts';

const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY');
const PAYSTACK_API = 'https://api.paystack.co';

interface SubscribeRequest {
    tier_id: string;
    billing_cycle: 'monthly' | 'yearly';
}

serve(async (req) => {
    // Handle CORS preflight
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
        // Get authenticated user
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return jsonResponse({ error: 'Unauthorized' }, 401);
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
            { global: { headers: { Authorization: authHeader } } }
        );

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return jsonResponse({ error: 'Unauthorized' }, 401);
        }

        // Parse request
        const { tier_id, billing_cycle = 'monthly' }: SubscribeRequest = await req.json();

        if (!tier_id) {
            return jsonResponse({ error: 'tier_id is required' }, 400);
        }

        // Get tier details
        const { data: tier, error: tierError } = await supabase
            .from('user_pricing_tiers')
            .select('*')
            .eq('id', tier_id)
            .single();

        if (tierError || !tier) {
            return jsonResponse({ error: 'Invalid tier' }, 400);
        }

        if (tier.name === 'free') {
            return jsonResponse({ error: 'Cannot subscribe to free tier via payment' }, 400);
        }

        if (tier.name === 'enterprise') {
            return jsonResponse({ error: 'Enterprise requires contacting sales' }, 400);
        }

        // Calculate amount
        const amount = billing_cycle === 'yearly' && tier.price_yearly
            ? tier.price_yearly
            : tier.price_monthly;

        // Get or create Paystack customer
        let paystackCustomerCode: string | null = null;

        // Check if user already has a Paystack customer code
        const { data: existingSub } = await supabase
            .from('user_subscriptions')
            .select('paystack_customer_code')
            .eq('user_id', user.id)
            .single();

        if (existingSub?.paystack_customer_code) {
            paystackCustomerCode = existingSub.paystack_customer_code;
        } else {
            // Create Paystack customer
            const customerRes = await fetch(`${PAYSTACK_API}/customer`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: user.email,
                    first_name: user.user_metadata?.first_name || '',
                    last_name: user.user_metadata?.last_name || '',
                    metadata: {
                        user_id: user.id
                    }
                })
            });

            const customerData = await customerRes.json();
            if (!customerData.status) {
                return jsonResponse({ error: 'Failed to create Paystack customer', details: customerData.message }, 500);
            }
            paystackCustomerCode = customerData.data.customer_code;
        }

        // Initialize transaction
        const callback_url = `${Deno.env.get('PUBLIC_URL') || 'https://prismtaxassistant.lovable.app'}/subscription/success`;

        const transactionRes = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: user.email,
                amount: amount, // Paystack expects kobo
                currency: 'NGN',
                callback_url,
                metadata: {
                    user_id: user.id,
                    tier_id: tier.id,
                    billing_cycle,
                    custom_fields: [
                        {
                            display_name: 'Plan',
                            variable_name: 'plan',
                            value: tier.display_name
                        },
                        {
                            display_name: 'Billing',
                            variable_name: 'billing',
                            value: billing_cycle
                        }
                    ]
                },
                plan: null, // One-time payment, subscription created in webhook
                channels: ['card', 'bank', 'ussd', 'bank_transfer']
            })
        });

        const transactionData = await transactionRes.json();
        if (!transactionData.status) {
            return jsonResponse({ error: 'Failed to initialize payment', details: transactionData.message }, 500);
        }

        // Store pending subscription
        await supabase.from('user_subscriptions').upsert({
            user_id: user.id,
            tier_id: tier.id,
            status: 'trialing', // Will be updated to 'active' on successful payment
            billing_cycle,
            paystack_customer_code: paystackCustomerCode,
            trial_ends_at: null
        }, { onConflict: 'user_id' });

        return jsonResponse({
            success: true,
            authorization_url: transactionData.data.authorization_url,
            access_code: transactionData.data.access_code,
            reference: transactionData.data.reference
        });

    } catch (error) {
        console.error('Subscription error:', error);
        return jsonResponse({ error: 'Internal server error' }, 500);
    }
});
