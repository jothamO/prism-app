import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, handleCors } from '../_shared/cors.ts';

const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY');
const PAYSTACK_API = 'https://api.paystack.co';

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
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        const anonSupabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
            { global: { headers: { Authorization: authHeader } } }
        );

        const { data: { user }, error: authError } = await anonSupabase.auth.getUser();
        if (authError || !user) {
            return jsonResponse({ error: 'Unauthorized' }, 401);
        }

        // Parse request
        const { reference } = await req.json();

        if (!reference) {
            return jsonResponse({ error: 'reference is required' }, 400);
        }

        // Verify transaction with Paystack
        const verifyRes = await fetch(`${PAYSTACK_API}/transaction/verify/${reference}`, {
            headers: {
                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
            }
        });

        const verifyData = await verifyRes.json();
        console.log('Paystack verification response:', JSON.stringify(verifyData));

        if (!verifyData.status || verifyData.data.status !== 'success') {
            return jsonResponse({ 
                success: false, 
                message: verifyData.data?.gateway_response || 'Payment not successful' 
            });
        }

        const paymentData = verifyData.data;
        const metadata = paymentData.metadata || {};

        // Verify this payment belongs to the authenticated user
        if (metadata.user_id && metadata.user_id !== user.id) {
            return jsonResponse({ error: 'Payment does not belong to this user' }, 403);
        }

        const tier_id = metadata.tier_id;
        const billing_cycle = metadata.billing_cycle || 'monthly';

        // Get tier details
        const { data: tier, error: tierError } = await supabase
            .from('user_pricing_tiers')
            .select('*')
            .eq('id', tier_id)
            .single();

        if (tierError || !tier) {
            console.error('Tier not found:', tier_id);
            return jsonResponse({ 
                success: false, 
                message: 'Subscription tier not found' 
            });
        }

        // Calculate period dates
        const now = new Date();
        const periodEnd = new Date(now);
        if (billing_cycle === 'yearly') {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        } else {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
        }

        // Update user subscription to active
        const { error: subError } = await supabase
            .from('user_subscriptions')
            .upsert({
                user_id: user.id,
                tier_id: tier.id,
                status: 'active',
                billing_cycle,
                current_period_start: now.toISOString(),
                current_period_end: periodEnd.toISOString(),
                paystack_reference: reference,
                updated_at: now.toISOString()
            }, { onConflict: 'user_id' });

        if (subError) {
            console.error('Failed to update subscription:', subError);
            return jsonResponse({ 
                success: false, 
                message: 'Failed to activate subscription' 
            });
        }

        // Record payment
        await supabase.from('user_payments').insert({
            user_id: user.id,
            paystack_reference: reference,
            amount_kobo: paymentData.amount,
            currency: paymentData.currency || 'NGN',
            status: 'success',
            tier_id: tier.id,
            billing_cycle,
            payment_method: paymentData.channel,
            paid_at: paymentData.paid_at,
            metadata: {
                authorization_code: paymentData.authorization?.authorization_code,
                card_type: paymentData.authorization?.card_type,
                last4: paymentData.authorization?.last4,
                bank: paymentData.authorization?.bank,
            }
        });

        console.log(`User ${user.id} subscribed to ${tier.name} (${billing_cycle})`);

        return jsonResponse({
            success: true,
            subscription: {
                tier_name: tier.name,
                display_name: tier.display_name,
                billing_cycle,
                amount: paymentData.amount
            }
        });

    } catch (error) {
        console.error('Verification error:', error);
        return jsonResponse({ error: 'Internal server error' }, 500);
    }
});
