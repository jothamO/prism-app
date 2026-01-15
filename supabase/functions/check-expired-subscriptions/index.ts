import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";


/**
 * Scheduled function to check and downgrade expired subscriptions
 * Should be called daily via cron
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Call the database function to downgrade expired subscriptions
    const { data: downgradeCount, error: downgradeError } = await supabase
      .rpc('downgrade_expired_subscriptions');

    if (downgradeError) {
      console.error('Error downgrading subscriptions:', downgradeError);
      throw downgradeError;
    }

    // Get subscriptions approaching expiry (within 3 days)
    const { data: expiringSubscriptions, error: expiringError } = await supabase
      .from('api_subscriptions')
      .select(`
        id,
        user_id,
        tier,
        current_period_end,
        status
      `)
      .eq('status', 'active')
      .lt('current_period_end', new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString())
      .gt('current_period_end', new Date().toISOString());

    if (expiringError) {
      console.error('Error fetching expiring subscriptions:', expiringError);
    }

    // Get user emails for expiring subscriptions
    if (expiringSubscriptions && expiringSubscriptions.length > 0) {
      const userIds = expiringSubscriptions.map(s => s.user_id);
      
      const { data: users } = await supabase
        .from('users')
        .select('id, email, first_name')
        .in('id', userIds);

      // Log warnings (in production, this would send emails)
      for (const sub of expiringSubscriptions) {
        const user = users?.find(u => u.id === sub.user_id);
        console.log(`[WARNING] Subscription expiring soon for user ${user?.email}: ${sub.tier} tier expires ${sub.current_period_end}`);
        
        // TODO: Integrate with email service to send expiry warning
        // await sendExpiryWarningEmail(user?.email, sub.tier, sub.current_period_end);
      }
    }

    // Get past_due subscriptions and attempt to notify
    const { data: pastDueSubscriptions } = await supabase
      .from('api_subscriptions')
      .select('id, user_id, tier, status')
      .eq('status', 'past_due');

    console.log('[Subscription Check Summary]', {
      downgraded: downgradeCount || 0,
      expiringSoon: expiringSubscriptions?.length || 0,
      pastDue: pastDueSubscriptions?.length || 0,
      timestamp: new Date().toISOString()
    });

    return new Response(JSON.stringify({
      success: true,
      summary: {
        downgraded_count: downgradeCount || 0,
        expiring_soon_count: expiringSubscriptions?.length || 0,
        past_due_count: pastDueSubscriptions?.length || 0,
        checked_at: new Date().toISOString()
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Error in check-expired-subscriptions:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
