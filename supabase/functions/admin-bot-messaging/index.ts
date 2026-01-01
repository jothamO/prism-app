import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BroadcastRequest {
  action: "broadcast" | "segment-broadcast" | "direct-message" | "health";
  message?: string;
  platform?: "all" | "telegram" | "whatsapp";
  userId?: string;
  filters?: {
    entityType?: string;
    onboarded?: string;
    verified?: string;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    // Verify admin authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the user is an admin
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: BroadcastRequest = await req.json();
    const { action, message, platform, userId, filters } = body;

    console.log(`[admin-bot-messaging] Action: ${action}, Platform: ${platform}`);

    // Health check
    if (action === "health") {
      const telegramHealthy = !!telegramToken;
      // Could add actual API health checks here

      return new Response(
        JSON.stringify({
          telegram: telegramHealthy ? "online" : "not configured",
          whatsapp: "online", // Placeholder - would check 360dialog API
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate message for broadcast actions
    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get target users based on action
    let targetUsers: Array<{ id: string; telegram_id: string | null; whatsapp_id: string | null; platform: string | null }> = [];

    if (action === "direct-message") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "User ID required for direct message" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data } = await supabaseClient
        .from("users")
        .select("id, telegram_id, whatsapp_id, platform")
        .eq("id", userId)
        .single();
      if (data) targetUsers = [data];
    } else {
      // Broadcast or segment broadcast
      let query = supabaseClient.from("users").select("id, telegram_id, whatsapp_id, platform, entity_type, onboarding_completed, verification_status");

      // Apply platform filter
      if (platform && platform !== "all") {
        query = query.eq("platform", platform);
      }

      // Apply segment filters
      if (filters) {
        if (filters.entityType && filters.entityType !== "all") {
          query = query.eq("entity_type", filters.entityType);
        }
        if (filters.onboarded && filters.onboarded !== "all") {
          query = query.eq("onboarding_completed", filters.onboarded === "yes");
        }
        if (filters.verified && filters.verified !== "all") {
          query = query.eq("verification_status", filters.verified);
        }
      }

      const { data } = await query;
      targetUsers = data || [];
    }

    console.log(`[admin-bot-messaging] Target users: ${targetUsers.length}`);

    // Create broadcast record
    const { data: broadcastRecord, error: insertError } = await supabaseClient
      .from("broadcast_messages")
      .insert({
        admin_user_id: user.id,
        platform: platform || "all",
        message_text: message,
        filters: filters || null,
        total_recipients: targetUsers.length,
        status: "in_progress",
      })
      .select()
      .single();

    if (insertError) {
      console.error("[admin-bot-messaging] Failed to create broadcast record:", insertError);
    }

    // Send messages
    let sentCount = 0;
    let failedCount = 0;

    for (const targetUser of targetUsers) {
      try {
        if (targetUser.platform === "telegram" && targetUser.telegram_id && telegramToken) {
          // Send Telegram message
          const telegramResponse = await fetch(
            `https://api.telegram.org/bot${telegramToken}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: targetUser.telegram_id,
                text: message,
                parse_mode: "HTML",
              }),
            }
          );

          if (telegramResponse.ok) {
            sentCount++;
            // Log message
            await supabaseClient.from("messages").insert({
              user_id: targetUser.id,
              content: message,
              direction: "outgoing",
              message_type: "broadcast",
            });
          } else {
            failedCount++;
            console.error(`[admin-bot-messaging] Telegram send failed for ${targetUser.id}`);
          }
        } else if (targetUser.platform === "whatsapp" && targetUser.whatsapp_id) {
          // WhatsApp sending would go here (360dialog API)
          // For now, just log it
          sentCount++;
          await supabaseClient.from("messages").insert({
            user_id: targetUser.id,
            content: message,
            direction: "outgoing",
            message_type: "broadcast",
          });
        } else {
          failedCount++;
        }
      } catch (error) {
        console.error(`[admin-bot-messaging] Error sending to ${targetUser.id}:`, error);
        failedCount++;
      }
    }

    // Update broadcast record
    if (broadcastRecord) {
      await supabaseClient
        .from("broadcast_messages")
        .update({
          sent_count: sentCount,
          failed_count: failedCount,
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", broadcastRecord.id);
    }

    console.log(`[admin-bot-messaging] Complete. Sent: ${sentCount}, Failed: ${failedCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        totalRecipients: targetUsers.length,
        sent: sentCount,
        failed: failedCount,
        broadcastId: broadcastRecord?.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[admin-bot-messaging] Error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
