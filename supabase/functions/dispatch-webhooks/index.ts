import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";


interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, any>;
}

interface WebhookSubscription {
  id: string;
  business_id: string;
  name: string;
  endpoint_url: string;
  secret_key: string;
  events: string[];
  is_active: boolean;
  failure_count: number;
}

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
async function generateSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const payloadData = encoder.encode(payload);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, payloadData);
  const signatureBytes = new Uint8Array(signature);
  return encode(signatureBytes as unknown as ArrayBuffer);
}

/**
 * Deliver webhook with retry logic
 */
async function deliverWebhook(
  subscription: WebhookSubscription,
  payload: WebhookPayload,
  supabase: any
): Promise<{ success: boolean; status?: number; error?: string }> {
  const payloadString = JSON.stringify(payload);
  const signature = await generateSignature(payloadString, subscription.secret_key);
  
  const maxAttempts = 3;
  let lastError: string | undefined;
  let lastStatus: number | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(subscription.endpoint_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PRISM-Signature': signature,
          'X-PRISM-Event': payload.event,
          'X-PRISM-Delivery': crypto.randomUUID(),
          'X-PRISM-Attempt': attempt.toString(),
        },
        body: payloadString,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      lastStatus = response.status;
      
      // Log delivery attempt
      await supabase.from('webhook_delivery_log').insert({
        subscription_id: subscription.id,
        event_type: payload.event,
        payload: payload,
        response_status: response.status,
        response_body: await response.text().catch(() => null),
        success: response.ok,
        attempt_count: attempt,
      });
      
      if (response.ok) {
        // Reset failure count on success
        await supabase
          .from('webhook_subscriptions')
          .update({ 
            failure_count: 0, 
            last_triggered_at: new Date().toISOString() 
          })
          .eq('id', subscription.id);
        
        return { success: true, status: response.status };
      }
      
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      
      // Log failed attempt
      await supabase.from('webhook_delivery_log').insert({
        subscription_id: subscription.id,
        event_type: payload.event,
        payload: payload,
        response_status: null,
        response_body: lastError,
        success: false,
        attempt_count: attempt,
      });
    }
    
    // Exponential backoff between retries
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  
  // All attempts failed - increment failure count
  await supabase
    .from('webhook_subscriptions')
    .update({ 
      failure_count: subscription.failure_count + 1,
      last_triggered_at: new Date().toISOString()
    })
    .eq('id', subscription.id);
  
  // Disable webhook if too many failures
  if (subscription.failure_count + 1 >= 10) {
    await supabase
      .from('webhook_subscriptions')
      .update({ is_active: false })
      .eq('id', subscription.id);
    
    console.log(`[dispatch-webhooks] Disabled webhook ${subscription.id} due to too many failures`);
  }
  
  return { success: false, status: lastStatus, error: lastError };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const body = await req.json();
    const { event, data, business_ids } = body;
    
    if (!event) {
      return new Response(JSON.stringify({ error: 'Missing event type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[dispatch-webhooks] Processing event: ${event}`);

    // Find active subscriptions for this event
    let query = supabase
      .from('webhook_subscriptions')
      .select('*')
      .eq('is_active', true)
      .contains('events', [event]);
    
    // Optionally filter by business IDs
    if (business_ids && business_ids.length > 0) {
      query = query.in('business_id', business_ids);
    }
    
    const { data: subscriptions, error: subError } = await query;
    
    if (subError) {
      console.error('[dispatch-webhooks] Error fetching subscriptions:', subError);
      return new Response(JSON.stringify({ error: 'Failed to fetch subscriptions' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No active subscriptions for this event',
        dispatched: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data: data || {},
    };

    // Dispatch to all matching subscriptions
    const results = await Promise.allSettled(
      subscriptions.map(sub => deliverWebhook(sub as WebhookSubscription, payload, supabase))
    );

    const successful = results.filter(
      r => r.status === 'fulfilled' && (r.value as any).success
    ).length;
    
    const failed = results.length - successful;

    console.log(`[dispatch-webhooks] Dispatched: ${successful} success, ${failed} failed`);

    return new Response(JSON.stringify({
      success: true,
      event,
      dispatched: subscriptions.length,
      successful,
      failed,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[dispatch-webhooks] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
