import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  documentId?: string;
  ruleId?: string;
  notificationType: "new_regulation" | "amendment" | "deadline_reminder" | "rate_change" | "threshold_update" | "expiring_exemption";
  title: string;
  message: string;
  severity?: "info" | "warning" | "critical";
  targetUsers?: string[]; // Specific user IDs, or empty to notify all relevant users
  taxTypes?: string[]; // Only notify users interested in these tax types
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: NotificationRequest = await req.json();
    const {
      documentId,
      ruleId,
      notificationType,
      title,
      message,
      severity = "info",
      targetUsers,
      taxTypes,
    } = request;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Determine which users should receive this notification
    let usersToNotify: string[] = [];

    if (targetUsers && targetUsers.length > 0) {
      usersToNotify = targetUsers;
    } else {
      // Get users based on their preferences
      let preferencesQuery = supabase
        .from("user_compliance_preferences")
        .select("user_id, tax_types, notify_new_regulations, notify_amendments, notify_deadlines, notify_rate_changes, in_app_notifications")
        .eq("in_app_notifications", true);

      // Filter by notification type preferences
      switch (notificationType) {
        case "new_regulation":
          preferencesQuery = preferencesQuery.eq("notify_new_regulations", true);
          break;
        case "amendment":
          preferencesQuery = preferencesQuery.eq("notify_amendments", true);
          break;
        case "deadline_reminder":
          preferencesQuery = preferencesQuery.eq("notify_deadlines", true);
          break;
        case "rate_change":
        case "threshold_update":
          preferencesQuery = preferencesQuery.eq("notify_rate_changes", true);
          break;
      }

      const { data: preferences, error: prefError } = await preferencesQuery;

      if (prefError) {
        console.error("[send-notifications] Error fetching preferences:", prefError);
      }

      if (preferences && preferences.length > 0) {
        // Filter by tax types if specified
        for (const pref of preferences) {
          if (taxTypes && taxTypes.length > 0) {
            const userTaxTypes = pref.tax_types || [];
            const hasMatchingTaxType = taxTypes.some(t => userTaxTypes.includes(t));
            if (hasMatchingTaxType || userTaxTypes.length === 0) {
              usersToNotify.push(pref.user_id);
            }
          } else {
            usersToNotify.push(pref.user_id);
          }
        }
      }

      // If no preferences found, fallback to all users with businesses
      if (usersToNotify.length === 0) {
        const { data: businesses } = await supabase
          .from("businesses")
          .select("owner_user_id")
          .not("owner_user_id", "is", null);

        usersToNotify = [...new Set((businesses || []).map(b => b.owner_user_id).filter(Boolean))];
      }
    }

    console.log(`[send-notifications] Sending to ${usersToNotify.length} users`);

    // Create notifications for each user
    const notifications = usersToNotify.map(userId => ({
      user_id: userId,
      document_id: documentId || null,
      rule_id: ruleId || null,
      notification_type: notificationType,
      title,
      message,
      severity,
      action_url: documentId ? `/admin/compliance/documents/${documentId}` : null,
      metadata: { taxTypes },
    }));

    if (notifications.length > 0) {
      const { error: insertError } = await supabase
        .from("compliance_notifications")
        .insert(notifications);

      if (insertError) {
        console.error("[send-notifications] Error inserting notifications:", insertError);
        throw new Error(`Failed to create notifications: ${insertError.message}`);
      }
    }

    // Log the change
    if (documentId) {
      await supabase.from("compliance_change_log").insert({
        entity_type: "notification",
        entity_id: documentId,
        change_type: "created",
        change_reason: `Sent ${notificationType} notification to ${usersToNotify.length} users`,
        new_values: { title, message, severity, recipients: usersToNotify.length },
        source_document_id: documentId,
      });
    }

    console.log(`[send-notifications] Successfully sent ${notifications.length} notifications`);

    return new Response(
      JSON.stringify({
        success: true,
        notificationsSent: notifications.length,
        recipients: usersToNotify.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[send-notifications] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
