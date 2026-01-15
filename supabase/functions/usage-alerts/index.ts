import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";


interface UsageAlert {
  userId: string;
  email: string;
  tier: string;
  usagePercent: number;
  currentUsage: number;
  limit: number;
}

/**
 * Scheduled function to check API usage and send alerts
 * Should be called hourly via cron
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

    // Get all active API keys with their usage
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys')
      .select('id, user_id, tier')
      .eq('is_active', true);

    if (keysError) {
      throw keysError;
    }

    const alerts: UsageAlert[] = [];
    const tierLimits: Record<string, { daily: number; monthly: number }> = {
      'free': { daily: 100, monthly: 3000 },
      'starter': { daily: 5000, monthly: 150000 },
      'business': { daily: 50000, monthly: 1500000 },
      'enterprise': { daily: 999999, monthly: 999999999 }
    };

    // Check usage for each user
    const userUsage: Record<string, { daily: number; monthly: number; tier: string }> = {};

    for (const key of apiKeys || []) {
      if (!userUsage[key.user_id]) {
        // Get daily usage
        const { count: dailyCount } = await supabase
          .from('api_usage')
          .select('*', { count: 'exact', head: true })
          .eq('api_key_id', key.id)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        // Get monthly usage
        const { count: monthlyCount } = await supabase
          .from('api_usage')
          .select('*', { count: 'exact', head: true })
          .eq('api_key_id', key.id)
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

        userUsage[key.user_id] = {
          daily: dailyCount || 0,
          monthly: monthlyCount || 0,
          tier: key.tier
        };
      }
    }

    // Check for users approaching limits
    for (const [userId, usage] of Object.entries(userUsage)) {
      const limits = tierLimits[usage.tier] || tierLimits.free;
      const dailyPercent = (usage.daily / limits.daily) * 100;
      const monthlyPercent = (usage.monthly / limits.monthly) * 100;

      // Get user email
      const { data: user } = await supabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .single();

      // Alert at 80%, 90%, and 100%
      if (dailyPercent >= 80 || monthlyPercent >= 80) {
        const isDaily = dailyPercent > monthlyPercent;
        alerts.push({
          userId,
          email: user?.email || 'unknown',
          tier: usage.tier,
          usagePercent: Math.round(isDaily ? dailyPercent : monthlyPercent),
          currentUsage: isDaily ? usage.daily : usage.monthly,
          limit: isDaily ? limits.daily : limits.monthly
        });

        console.log(`[USAGE ALERT] User ${user?.email}: ${isDaily ? 'Daily' : 'Monthly'} usage at ${Math.round(isDaily ? dailyPercent : monthlyPercent)}%`);

        // TODO: Integrate with email service
        // if (dailyPercent >= 100 || monthlyPercent >= 100) {
        //   await sendLimitReachedEmail(user?.email, usage.tier);
        // } else if (dailyPercent >= 90 || monthlyPercent >= 90) {
        //   await sendUsageWarningEmail(user?.email, 90, usage.tier);
        // } else {
        //   await sendUsageWarningEmail(user?.email, 80, usage.tier);
        // }
      }
    }

    console.log('[Usage Alerts Summary]', {
      totalKeysChecked: apiKeys?.length || 0,
      usersChecked: Object.keys(userUsage).length,
      alertsGenerated: alerts.length,
      timestamp: new Date().toISOString()
    });

    return new Response(JSON.stringify({
      success: true,
      summary: {
        total_keys_checked: apiKeys?.length || 0,
        users_checked: Object.keys(userUsage).length,
        alerts_generated: alerts.length,
        alerts: alerts.slice(0, 10), // Return top 10 alerts
        checked_at: new Date().toISOString()
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Error in usage-alerts:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
