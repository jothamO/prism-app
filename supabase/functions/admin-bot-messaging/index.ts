import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BotRequest {
  action: 
    | "broadcast" 
    | "segment-broadcast" 
    | "direct-message" 
    | "health"
    | "toggle-bot"
    | "update-commands"
    | "clear-user-data"
    | "clear-all-states"
    | "get-recent-errors"
    | "verify-user"
    | "request-reverify"
    | "update-subscription"
    | "delete-user";
  message?: string;
  platform?: "all" | "telegram" | "whatsapp";
  userId?: string;
  enabled?: boolean;
  clearOption?: "state" | "messages" | "onboarding" | "full";
  subscriptionTier?: "free" | "basic" | "pro" | "enterprise";
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
    console.log("[admin-bot-messaging] Request received");
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const whatsappApiKey = Deno.env.get("WHATSAPP_360DIALOG_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      console.error("[admin-bot-messaging] Missing required env vars:", {
        url: !!supabaseUrl,
        serviceKey: !!supabaseServiceKey,
        anonKey: !!supabaseAnonKey
      });
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify admin authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log("[admin-bot-messaging] No authorization header");
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use anon client with user's token for auth validation
    const token = authHeader.replace("Bearer ", "");
    console.log("[admin-bot-messaging] Validating user token...");
    
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();

    if (authError || !user) {
      console.error("[admin-bot-messaging] Auth error:", authError?.message);
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[admin-bot-messaging] User authenticated: ${user.id}`);

    // Use service role client for admin operations
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check admin role
    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      console.log(`[admin-bot-messaging] User ${user.id} is not an admin`);
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[admin-bot-messaging] Admin verified");

    const body: BotRequest = await req.json();
    const { action, message, platform, userId, filters, enabled, clearOption } = body;

    console.log(`[admin-bot-messaging] Processing action: ${action}, Platform: ${platform}`);

    // ==================== HEALTH CHECK ====================
    if (action === "health") {
      let telegramStatus = "not configured";
      let whatsappStatus = "not configured";

      // Check Telegram
      if (telegramToken) {
        try {
          const response = await fetch(`https://api.telegram.org/bot${telegramToken}/getMe`);
          const result = await response.json();
          telegramStatus = result.ok ? "online" : "error";
        } catch {
          telegramStatus = "offline";
        }
      }

      // Check WhatsApp (360dialog)
      if (whatsappApiKey) {
        try {
          const response = await fetch("https://waba.360dialog.io/v1/configs/webhook", {
            headers: { "D360-API-KEY": whatsappApiKey },
          });
          whatsappStatus = response.ok ? "online" : "error";
        } catch {
          whatsappStatus = "offline";
        }
      }

      return new Response(
        JSON.stringify({ telegram: telegramStatus, whatsapp: whatsappStatus }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== TOGGLE BOT ====================
    if (action === "toggle-bot") {
      if (!platform || platform === "all") {
        return new Response(JSON.stringify({ error: "Specific platform required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update system settings
      const updateField = platform === "telegram" ? "telegram_enabled" : "whatsapp_enabled";
      await supabaseClient
        .from("system_settings")
        .update({ [updateField]: enabled, updated_at: new Date().toISOString(), updated_by: user.id })
        .eq("id", (await supabaseClient.from("system_settings").select("id").single()).data?.id);

      // For Telegram, manage webhook
      if (platform === "telegram" && telegramToken) {
        if (enabled) {
          // Set webhook
          const webhookUrl = `${supabaseUrl}/functions/v1/telegram-bot`;
          await fetch(`https://api.telegram.org/bot${telegramToken}/setWebhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: webhookUrl }),
          });
        } else {
          // Delete webhook
          await fetch(`https://api.telegram.org/bot${telegramToken}/deleteWebhook`, {
            method: "POST",
          });
        }
      }

      console.log(`[admin-bot-messaging] ${platform} bot ${enabled ? "enabled" : "disabled"}`);
      return new Response(
        JSON.stringify({ success: true, platform, enabled }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== UPDATE BOT COMMANDS ====================
    if (action === "update-commands") {
      if (platform !== "telegram") {
        return new Response(JSON.stringify({ error: "Only Telegram commands supported" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get enabled commands
      const { data: commands } = await supabaseClient
        .from("bot_commands")
        .select("command, description")
        .eq("platform", "telegram")
        .eq("is_enabled", true)
        .order("sort_order", { ascending: true });

      if (!commands || commands.length === 0) {
        return new Response(JSON.stringify({ error: "No commands to sync" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Format for Telegram API
      const telegramCommands = commands.map((cmd) => ({
        command: cmd.command.replace("/", ""),
        description: cmd.description,
      }));

      // Call Telegram API
      const response = await fetch(`https://api.telegram.org/bot${telegramToken}/setMyCommands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commands: telegramCommands }),
      });

      const result = await response.json();
      console.log("[admin-bot-messaging] setMyCommands result:", result);

      return new Response(
        JSON.stringify({ success: result.ok, commandsSet: telegramCommands.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== CLEAR USER DATA ====================
    if (action === "clear-user-data") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "User ID required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get user platform IDs
      const { data: userData } = await supabaseClient
        .from("users")
        .select("telegram_id, whatsapp_id")
        .eq("id", userId)
        .single();

      if (!userData) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cleared: string[] = [];

      // Clear conversation state (includes Gateway chatbot_sessions)
      if (clearOption === "state" || clearOption === "full") {
        if (userData.telegram_id) {
          await supabaseClient
            .from("conversation_state")
            .update({ expecting: null, context: {} })
            .eq("telegram_id", userData.telegram_id);
          // Clear Gateway chatbot sessions
          await supabaseClient
            .from("chatbot_sessions")
            .delete()
            .eq("user_id", userData.telegram_id);
        }
        if (userData.whatsapp_id) {
          await supabaseClient
            .from("conversation_state")
            .update({ expecting: null, context: {} })
            .eq("whatsapp_id", userData.whatsapp_id);
          // Clear Gateway chatbot sessions
          await supabaseClient
            .from("chatbot_sessions")
            .delete()
            .eq("user_id", userData.whatsapp_id);
        }
        cleared.push("state");
      }

      // Clear messages
      if (clearOption === "messages" || clearOption === "full") {
        await supabaseClient.from("messages").delete().eq("user_id", userId);
        cleared.push("messages");
      }

      // Reset onboarding (includes onboarding_progress table)
      if (clearOption === "onboarding" || clearOption === "full") {
        // Clear onboarding_progress table
        await supabaseClient
          .from("onboarding_progress")
          .delete()
          .eq("user_id", userId);
        
        // Reset user onboarding fields
        await supabaseClient
          .from("users")
          .update({
            onboarding_completed: false,
            onboarding_step: 0,
            nin: null,
            cac_number: null,
            tin: null,
            entity_type: null,
            business_name: null,
            company_name: null,
            verification_status: "pending",
            verified_at: null,
          })
          .eq("id", userId);
        cleared.push("onboarding");
      }

      // Full reset also clears receipts, bank statements, and document jobs
      if (clearOption === "full") {
        await supabaseClient.from("receipts").delete().eq("user_id", userId);
        await supabaseClient.from("document_processing_jobs").delete().eq("user_id", userId);
        // Delete bank transactions first (FK to statements)
        const { data: statements } = await supabaseClient
          .from("bank_statements")
          .select("id")
          .eq("user_id", userId);
        if (statements && statements.length > 0) {
          const statementIds = statements.map(s => s.id);
          await supabaseClient
            .from("bank_transactions")
            .delete()
            .in("statement_id", statementIds);
        }
        await supabaseClient.from("bank_statements").delete().eq("user_id", userId);
        cleared.push("receipts", "documents", "statements");
      }

      console.log(`[admin-bot-messaging] Cleared for user ${userId}: ${cleared.join(", ")}`);
      return new Response(
        JSON.stringify({ success: true, cleared }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== CLEAR ALL STATES ====================
    if (action === "clear-all-states") {
      console.log("[admin-bot-messaging] Starting clear-all-states with progress tracking");
      
      // Step 1: Count affected states
      const { count: stateCount, error: countError } = await supabaseClient
        .from("conversation_state")
        .select("*", { count: "exact", head: true })
        .or("expecting.not.is.null,context.neq.{}");

      if (countError) {
        console.error("[admin-bot-messaging] Count error:", countError);
        return new Response(
          JSON.stringify({
            success: false,
            steps: [
              { id: "count", label: "Count affected states", status: "error", detail: "Failed to count states" },
              { id: "clear", label: "Clear conversation states", status: "pending" },
              { id: "verify", label: "Verify cleanup", status: "pending" }
            ]
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const affectedCount = stateCount || 0;
      console.log(`[admin-bot-messaging] Found ${affectedCount} conversation states to clear`);

      // Step 2: Clear the states
      const { error: clearError } = await supabaseClient
        .from("conversation_state")
        .update({ expecting: null, context: {} })
        .not("id", "is", null);

      if (clearError) {
        console.error("[admin-bot-messaging] Clear error:", clearError);
        return new Response(
          JSON.stringify({
            success: false,
            steps: [
              { id: "count", label: "Count affected states", status: "completed", detail: `Found ${affectedCount} states` },
              { id: "clear", label: "Clear conversation states", status: "error", detail: "Failed to clear states" },
              { id: "verify", label: "Verify cleanup", status: "pending" }
            ]
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Step 3: Verify cleanup
      const { count: remainingCount } = await supabaseClient
        .from("conversation_state")
        .select("*", { count: "exact", head: true })
        .or("expecting.not.is.null,context.neq.{}");

      const verifyStatus = (remainingCount || 0) === 0 ? "completed" : "error";
      const verifyDetail = verifyStatus === "completed" 
        ? "All states cleared successfully" 
        : `${remainingCount} states still have data`;

      console.log(`[admin-bot-messaging] Cleanup verified: ${verifyDetail}`);

      return new Response(
        JSON.stringify({
          success: verifyStatus === "completed",
          totalCleared: affectedCount,
          steps: [
            { id: "count", label: "Count affected states", status: "completed", detail: `Found ${affectedCount} states` },
            { id: "clear", label: "Clear conversation states", status: "completed", detail: `Cleared ${affectedCount} states` },
            { id: "verify", label: "Verify cleanup", status: verifyStatus, detail: verifyDetail }
          ]
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== GET RECENT ERRORS ====================
    if (action === "get-recent-errors") {
      const { data: errors } = await supabaseClient
        .from("messages")
        .select("id, user_id, content, created_at, whatsapp_status")
        .or("whatsapp_status.eq.failed,message_type.eq.error")
        .order("created_at", { ascending: false })
        .limit(50);

      return new Response(
        JSON.stringify({ errors: errors || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== VERIFY USER ====================
    if (action === "verify-user") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "User ID required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateError } = await supabaseClient
        .from("users")
        .update({
          verification_status: "verified",
          verified_at: new Date().toISOString(),
          verification_source: "admin_manual",
        })
        .eq("id", userId);

      if (updateError) {
        console.error("[admin-bot-messaging] Verify user error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to verify user" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Log audit
      await supabaseClient.from("audit_log").insert({
        admin_id: user.id,
        user_id: userId,
        action: "user_verified",
        entity_type: "user",
        entity_id: userId,
        new_values: { verification_status: "verified", verification_source: "admin_manual" },
      });

      console.log(`[admin-bot-messaging] User ${userId} manually verified by admin ${user.id}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== REQUEST RE-VERIFICATION ====================
    if (action === "request-reverify") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "User ID required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateError } = await supabaseClient
        .from("users")
        .update({
          verification_status: "pending",
          verification_data: null,
          verified_at: null,
          verification_source: null,
        })
        .eq("id", userId);

      if (updateError) {
        console.error("[admin-bot-messaging] Request reverify error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to reset verification" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Log audit
      await supabaseClient.from("audit_log").insert({
        admin_id: user.id,
        user_id: userId,
        action: "verification_reset",
        entity_type: "user",
        entity_id: userId,
      });

      console.log(`[admin-bot-messaging] User ${userId} verification reset by admin ${user.id}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== UPDATE SUBSCRIPTION ====================
    if (action === "update-subscription") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "User ID required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { subscriptionTier } = body;
      if (!subscriptionTier) {
        return new Response(JSON.stringify({ error: "Subscription tier required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: oldData } = await supabaseClient
        .from("users")
        .select("subscription_tier")
        .eq("id", userId)
        .single();

      const { error: updateError } = await supabaseClient
        .from("users")
        .update({
          subscription_tier: subscriptionTier,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (updateError) {
        console.error("[admin-bot-messaging] Update subscription error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to update subscription" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Log audit
      await supabaseClient.from("audit_log").insert({
        admin_id: user.id,
        user_id: userId,
        action: "subscription_updated",
        entity_type: "user",
        entity_id: userId,
        old_values: { subscription_tier: oldData?.subscription_tier },
        new_values: { subscription_tier: subscriptionTier },
      });

      console.log(`[admin-bot-messaging] User ${userId} subscription changed to ${subscriptionTier} by admin ${user.id}`);
      return new Response(
        JSON.stringify({ success: true, tier: subscriptionTier }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ==================== DELETE USER ====================
    if (action === "delete-user") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "User ID required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get user data before deletion for audit
      const { data: userData } = await supabaseClient
        .from("users")
        .select("telegram_id, whatsapp_id, full_name, email")
        .eq("id", userId)
        .single();

      if (!userData) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        // Delete in order of foreign key dependencies (children first)
        
        // 1. Get bank statement IDs for this user
        const { data: statements } = await supabaseClient
          .from("bank_statements")
          .select("id")
          .eq("user_id", userId);
        
        // 2. Delete bank transactions (FK to statements)
        if (statements && statements.length > 0) {
          const statementIds = statements.map(s => s.id);
          await supabaseClient
            .from("bank_transactions")
            .delete()
            .in("statement_id", statementIds);
        }
        
        // 3. Delete document processing jobs (FK to statements)
        await supabaseClient.from("document_processing_jobs").delete().eq("user_id", userId);
        
        // 4. Delete bank statements
        await supabaseClient.from("bank_statements").delete().eq("user_id", userId);
        
        // 5. Delete other user-related data
        await supabaseClient.from("receipts").delete().eq("user_id", userId);
        await supabaseClient.from("messages").delete().eq("user_id", userId);
        await supabaseClient.from("expenses").delete().eq("user_id", userId);
        await supabaseClient.from("invoices").delete().eq("user_id", userId);
        await supabaseClient.from("filings").delete().eq("user_id", userId);
        await supabaseClient.from("reminders").delete().eq("user_id", userId);
        await supabaseClient.from("ai_feedback").delete().eq("user_id", userId);
        await supabaseClient.from("profile_corrections").delete().eq("user_id", userId);
        await supabaseClient.from("analytics_events").delete().eq("user_id", userId);
        await supabaseClient.from("bank_charges").delete().eq("user_id", userId);
        await supabaseClient.from("emtl_charges").delete().eq("user_id", userId);
        
        // 6. Delete onboarding and session data
        await supabaseClient.from("onboarding_progress").delete().eq("user_id", userId);
        
        // 7. Delete conversation state
        if (userData.telegram_id) {
          await supabaseClient.from("conversation_state").delete().eq("telegram_id", userData.telegram_id);
          await supabaseClient.from("chatbot_sessions").delete().eq("user_id", userData.telegram_id);
        }
        if (userData.whatsapp_id) {
          await supabaseClient.from("conversation_state").delete().eq("whatsapp_id", userData.whatsapp_id);
          await supabaseClient.from("chatbot_sessions").delete().eq("user_id", userData.whatsapp_id);
        }
        
        // 8. Get and delete businesses (and their related patterns)
        const { data: businesses } = await supabaseClient
          .from("businesses")
          .select("id")
          .eq("user_id", userId);
        
        if (businesses && businesses.length > 0) {
          const businessIds = businesses.map(b => b.id);
          await supabaseClient
            .from("business_classification_patterns")
            .delete()
            .in("business_id", businessIds);
        }
        await supabaseClient.from("businesses").delete().eq("user_id", userId);
        
        // 9. Delete the user
        const { error: deleteError } = await supabaseClient
          .from("users")
          .delete()
          .eq("id", userId);

        if (deleteError) {
          console.error("[admin-bot-messaging] Delete user error:", deleteError);
          return new Response(JSON.stringify({ error: "Failed to delete user", detail: deleteError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Log audit
        await supabaseClient.from("audit_log").insert({
          admin_id: user.id,
          user_id: userId,
          action: "user_deleted",
          entity_type: "user",
          entity_id: userId,
          old_values: userData,
        });

        console.log(`[admin-bot-messaging] User ${userId} deleted by admin ${user.id}`);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error) {
        console.error("[admin-bot-messaging] Delete user cascade error:", error);
        return new Response(
          JSON.stringify({ 
            error: "Failed to delete user", 
            detail: error instanceof Error ? error.message : String(error) 
          }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // ==================== BROADCAST / DIRECT MESSAGE ====================
    // Validate message for broadcast actions
    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get target users based on action
    let targetUsers: Array<{ id: string; telegram_id: string | null; whatsapp_id: string | null; platform: string | null; is_blocked: boolean | null }> = [];

    if (action === "direct-message") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "User ID required for direct message" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data } = await supabaseClient
        .from("users")
        .select("id, telegram_id, whatsapp_id, platform, is_blocked")
        .eq("id", userId)
        .single();
      if (data) targetUsers = [data];
    } else {
      // Broadcast or segment broadcast
      let query = supabaseClient.from("users").select("id, telegram_id, whatsapp_id, platform, entity_type, onboarding_completed, verification_status, is_blocked");

      // Apply platform filter
      if (platform && platform !== "all") {
        query = query.eq("platform", platform);
      }

      // Exclude blocked users
      query = query.or("is_blocked.is.null,is_blocked.eq.false");

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
      // Skip blocked users
      if (targetUser.is_blocked) {
        failedCount++;
        continue;
      }

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
            await supabaseClient.from("messages").insert({
              user_id: targetUser.id,
              content: message,
              direction: "outgoing",
              message_type: action === "direct-message" ? "direct" : "broadcast",
            });
          } else {
            failedCount++;
            console.error(`[admin-bot-messaging] Telegram send failed for ${targetUser.id}`);
          }
        } else if (targetUser.platform === "whatsapp" && targetUser.whatsapp_id) {
          // WhatsApp sending would go here (360dialog API)
          sentCount++;
          await supabaseClient.from("messages").insert({
            user_id: targetUser.id,
            content: message,
            direction: "outgoing",
            message_type: action === "direct-message" ? "direct" : "broadcast",
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
