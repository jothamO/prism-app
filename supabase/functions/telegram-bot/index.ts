import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============= Rate Limiting =============

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number; // seconds
}

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 30; // max 30 requests per minute per user
const RATE_LIMIT_BURST_MAX = 10; // max 10 requests in 5 seconds (burst protection)
const RATE_LIMIT_BURST_WINDOW_MS = 5 * 1000;

// In-memory rate limit store (reset on cold start, but good enough for most cases)
const rateLimitStore = new Map<string, { requests: number[]; blocked_until?: number }>();

function checkRateLimit(telegramId: string): RateLimitResult {
  const now = Date.now();
  const key = `telegram:${telegramId}`;
  
  // Get or create rate limit entry
  let entry = rateLimitStore.get(key);
  if (!entry) {
    entry = { requests: [] };
    rateLimitStore.set(key, entry);
  }
  
  // Check if user is temporarily blocked
  if (entry.blocked_until && now < entry.blocked_until) {
    const resetIn = Math.ceil((entry.blocked_until - now) / 1000);
    console.log(`[Rate Limit] User ${telegramId} blocked for ${resetIn}s more`);
    return { allowed: false, remaining: 0, resetIn };
  }
  
  // Clear expired block
  if (entry.blocked_until && now >= entry.blocked_until) {
    entry.blocked_until = undefined;
    entry.requests = [];
  }
  
  // Remove expired requests outside the window
  entry.requests = entry.requests.filter(ts => ts > now - RATE_LIMIT_WINDOW_MS);
  
  // Check burst limit (short window)
  const burstRequests = entry.requests.filter(ts => ts > now - RATE_LIMIT_BURST_WINDOW_MS);
  if (burstRequests.length >= RATE_LIMIT_BURST_MAX) {
    // Block for 30 seconds on burst detection
    entry.blocked_until = now + 30 * 1000;
    console.warn(`[Rate Limit] User ${telegramId} BURST BLOCKED (${burstRequests.length} requests in 5s)`);
    return { allowed: false, remaining: 0, resetIn: 30 };
  }
  
  // Check main rate limit
  if (entry.requests.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldestRequest = Math.min(...entry.requests);
    const resetIn = Math.ceil((oldestRequest + RATE_LIMIT_WINDOW_MS - now) / 1000);
    console.warn(`[Rate Limit] User ${telegramId} exceeded limit (${entry.requests.length}/${RATE_LIMIT_MAX_REQUESTS})`);
    return { allowed: false, remaining: 0, resetIn };
  }
  
  // Add current request
  entry.requests.push(now);
  const remaining = RATE_LIMIT_MAX_REQUESTS - entry.requests.length;
  
  return { allowed: true, remaining, resetIn: 60 };
}

// Cleanup old entries periodically to prevent memory leaks
function cleanupRateLimitStore() {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS * 2;
  
  for (const [key, entry] of rateLimitStore.entries()) {
    // Remove entries with no recent requests and no active block
    const hasRecentRequests = entry.requests.some(ts => ts > cutoff);
    const hasActiveBlock = entry.blocked_until && entry.blocked_until > now;
    
    if (!hasRecentRequests && !hasActiveBlock) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupRateLimitStore, 5 * 60 * 1000);

// ============= Input Sanitization =============

function sanitizeInput(input: string, maxLength: number = 500): string {
  if (!input) return "";
  return input
    .replace(/<[^>]*>/g, "") // Strip HTML tags
    .replace(/[<>&'"]/g, (c) => 
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;' }[c] || c)
    )
    .trim()
    .slice(0, maxLength);
}

function sanitizeAmount(amount: string): number | null {
  if (!amount) return null;
  const cleaned = String(amount).replace(/[^0-9.]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) || parsed < 0 || parsed > 999999999 ? null : parsed;
}

// ============= Bot Status Check =============

async function isBotEnabled(): Promise<boolean> {
  const { data } = await supabase
    .from("system_settings")
    .select("telegram_enabled")
    .maybeSingle();
  return data?.telegram_enabled ?? true;
}

// ============= Custom Commands =============

async function getCustomCommandResponse(command: string): Promise<string | null> {
  const normalizedCommand = command.startsWith("/") ? command : `/${command}`;
  const { data } = await supabase
    .from("bot_commands")
    .select("response_text, is_enabled")
    .eq("platform", "telegram")
    .eq("command", normalizedCommand)
    .eq("is_enabled", true)
    .maybeSingle();

  return data?.response_text || null;
}

// ============= Telegram API Helpers =============

async function sendMessage(chatId: number, text: string, buttons?: { text: string; callback_data: string }[][]) {
  const payload: any = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  };

  if (buttons) {
    payload.reply_markup = { inline_keyboard: buttons };
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return response.json();
}

async function getFileUrl(fileId: string): Promise<string> {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
  const data = await response.json();
  return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

// ============= Database Helpers =============

async function ensureUser(telegramId: string, telegramUser: any) {
  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (existing) return existing;

  const { data: newUser, error } = await supabase
    .from("users")
    .insert({
      telegram_id: telegramId,
      telegram_username: telegramUser?.username || null,
      first_name: telegramUser?.first_name || null,
      last_name: telegramUser?.last_name || null,
      platform: "telegram",
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating user:", error);
    throw error;
  }

  return newUser;
}

async function getConversationState(telegramId: string) {
  const { data } = await supabase
    .from("conversation_state")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  return data;
}

async function setConversationState(telegramId: string, expecting: string | null, context: any = {}) {
  const { data: existing } = await supabase
    .from("conversation_state")
    .select("id")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("conversation_state")
      .update({ expecting, context, updated_at: new Date().toISOString() })
      .eq("telegram_id", telegramId);
  } else {
    await supabase.from("conversation_state").insert({
      telegram_id: telegramId,
      expecting,
      context,
    });
  }
}

async function updateUser(telegramId: string, updates: any) {
  await supabase.from("users").update(updates).eq("telegram_id", telegramId);
}

// ============= Tax ID Validation =============

function validateNIN(nin: string): boolean {
  return /^\d{11}$/.test(nin);
}

function validateCAC(cac: string): boolean {
  return /^(RC|BN)\d{6,7}$/i.test(cac);
}

// Real NIN verification via Mono API
async function verifyNIN(nin: string) {
  const MONO_SECRET_KEY = Deno.env.get("MONO_SECRET_KEY");

  if (!MONO_SECRET_KEY) {
    console.error("MONO_SECRET_KEY not configured - using mock data");
    return {
      success: true,
      data: {
        firstName: "Test",
        lastName: "User (Mock - Add MONO_SECRET_KEY)",
        nin: nin,
      },
    };
  }

  try {
    console.log(`[NIN Verification] Verifying NIN: ${nin.substring(0, 3)}***`);

    const response = await fetch("https://api.withmono.com/v3/lookup/nin", {
      method: "POST",
      headers: {
        "mono-sec-key": MONO_SECRET_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ nin }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Mono NIN verification failed:", response.status, error);
      throw new Error("NIN verification failed");
    }

    const result = await response.json();
    console.log(`[NIN Verification] Response status: ${result.status}`);

    if (result.status === "success" && result.data) {
      return {
        success: true,
        data: {
          firstName: result.data.firstName || result.data.firstname || "Unknown",
          lastName: result.data.lastName || result.data.lastname || "User",
          middleName: result.data.middleName || result.data.middlename,
          nin: result.data.nin,
          phone: result.data.phone,
          dateOfBirth: result.data.dateOfBirth || result.data.date_of_birth,
          gender: result.data.gender,
        },
      };
    }

    throw new Error("Invalid NIN or no data returned");
  } catch (error) {
    console.error("NIN verification error:", error);
    throw error;
  }
}

// Real CAC verification via Mono API
async function verifyCAC(cac: string) {
  const MONO_SECRET_KEY = Deno.env.get("MONO_SECRET_KEY");

  if (!MONO_SECRET_KEY) {
    console.error("MONO_SECRET_KEY not configured - using mock data");
    return {
      success: true,
      data: {
        companyName: "Test Company Ltd (Mock - Add MONO_SECRET_KEY)",
        registrationNumber: cac,
        status: "Active",
      },
    };
  }

  try {
    console.log(`[CAC Verification] Verifying CAC: ${cac}`);

    const response = await fetch(
      `https://api.withmono.com/v3/lookup/cac?search=${encodeURIComponent(cac)}`,
      {
        method: "GET",
        headers: {
          "mono-sec-key": MONO_SECRET_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Mono CAC verification failed:", response.status, error);
      throw new Error("CAC verification failed");
    }

    const result = await response.json();
    console.log(`[CAC Verification] Found ${result.data?.length || 0} results`);

    if (result.status === "success" && result.data && result.data.length > 0) {
      const company = result.data[0];
      return {
        success: true,
        data: {
          id: company.id,
          companyName: company.company_name || company.companyName,
          registrationNumber: company.rc_number || company.registrationNumber,
          registrationDate: company.registration_date || company.registrationDate,
          status: company.status || "Active",
          email: company.email,
        },
      };
    }

    throw new Error("CAC number not found in registry");
  } catch (error) {
    console.error("CAC verification error:", error);
    throw error;
  }
}

// ============= OCR with Lovable AI =============

async function extractReceiptData(imageUrl: string) {
  if (!LOVABLE_API_KEY) {
    console.error("LOVABLE_API_KEY not configured");
    return null;
  }

  try {
    // Download image and convert to base64
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
    const mimeType = imageResponse.headers.get("content-type") || "image/jpeg";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64Image}` },
              },
              {
                type: "text",
                text: `Extract receipt information from this image. Return ONLY valid JSON with these fields:
{
  "merchant": "store/vendor name",
  "amount": 0.00,
  "date": "YYYY-MM-DD",
  "category": "one of: food, transport, office, utilities, entertainment, other",
  "confidence": 0.0 to 1.0
}
If you cannot extract a field, use null. For amount, extract the total/grand total.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Lovable AI error:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) return null;

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
    const jsonStr = jsonMatch[1]?.trim() || content.trim();

    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("OCR extraction error:", error);
    return null;
  }
}

// ============= Message Handlers =============

async function handleStart(chatId: number, telegramId: string, user: any) {
  if (user.onboarding_completed) {
    await sendMessage(
      chatId,
      `👋 Welcome back, ${user.first_name || "there"}!\n\nHow can I help you today?\n\n📸 Send me a receipt photo to log an expense\n❓ Type /help for all commands`
    );
    return;
  }

  await sendMessage(
    chatId,
    `👋 <b>Welcome to PRISM!</b>\n\nI'm your AI tax assistant. Let's get you set up.\n\nAre you registering as an individual or a business?`,
    [
      [
        { text: "👤 Individual", callback_data: "entity_individual" },
        { text: "🏢 Business", callback_data: "entity_business" },
      ],
    ]
  );
}

async function handleHelp(chatId: number) {
  await sendMessage(
    chatId,
    `📋 <b>Available Commands</b>\n\n` +
    `/start - Start over or check status\n` +
    `/help - Show this help message\n\n` +
    `<b>Features:</b>\n` +
    `📸 Send a receipt photo to log expenses\n` +
    `💬 Ask me any tax-related questions\n\n` +
    `<b>Coming Soon:</b>\n` +
    `🏦 Bank account connection\n` +
    `📊 Tax filing reminders\n` +
    `📈 Monthly insights`
  );
}

async function handleEntitySelection(chatId: number, telegramId: string, choice: string) {
  const entityType = choice === "entity_individual" ? "individual" : "business";
  await updateUser(telegramId, { entity_type: entityType });

  if (entityType === "individual") {
    await setConversationState(telegramId, "nin");
    await sendMessage(
      chatId,
      `Great! You're registering as an <b>individual</b>.\n\nPlease enter your 11-digit National Identification Number (NIN):`
    );
  } else {
    await setConversationState(telegramId, "business_name");
    await sendMessage(chatId, `Great! You're registering as a <b>business</b>.\n\nPlease enter your business name:`);
  }
}

async function handleNINInput(chatId: number, telegramId: string, nin: string) {
  if (!validateNIN(nin)) {
    await sendMessage(chatId, `❌ Invalid NIN format. Please enter exactly 11 digits.`);
    return;
  }

  await sendMessage(chatId, `🔍 Verifying your NIN...`);

  try {
    const result = await verifyNIN(nin);

    if (result.success) {
      await updateUser(telegramId, {
        nin: nin,
        first_name: result.data.firstName,
        last_name: result.data.lastName,
        verification_status: "verified",
        verification_source: "mono_nin",
        verified_at: new Date().toISOString(),
        onboarding_completed: true,
        onboarding_step: 3,
      });
      await setConversationState(telegramId, null);

      await sendMessage(
        chatId,
        `✅ <b>Verification Successful!</b>\n\n` +
        `Welcome, ${result.data.firstName} ${result.data.lastName}!\n\n` +
        `You're all set up. Here's what you can do:\n\n` +
        `📸 Send a receipt photo to log expenses\n` +
        `❓ Type /help for more commands`
      );
    }
  } catch (error) {
    console.error("NIN verification error:", error);
    await sendMessage(chatId, `❌ NIN verification failed. Please check and try again.`);
  }
}

async function handleBusinessNameInput(chatId: number, telegramId: string, businessName: string) {
  const sanitizedName = sanitizeInput(businessName, 200);
  if (!sanitizedName) {
    await sendMessage(chatId, `❌ Please enter a valid business name.`);
    return;
  }
  await updateUser(telegramId, { business_name: sanitizedName });
  await setConversationState(telegramId, "cac");
  await sendMessage(
    chatId,
    `Thanks! Now please enter your CAC registration number.\n\nFormat: RC123456 or BN1234567`
  );
}

async function handleCACInput(chatId: number, telegramId: string, cac: string) {
  if (!validateCAC(cac)) {
    await sendMessage(
      chatId,
      `❌ Invalid CAC format.\n\nPlease use format: RC123456 or BN1234567`
    );
    return;
  }

  await sendMessage(chatId, `🔍 Verifying your CAC number...`);

  try {
    const result = await verifyCAC(cac);

    if (result.success) {
      await updateUser(telegramId, {
        cac_number: cac.toUpperCase(),
        company_name: result.data.companyName,
        verification_status: "verified",
        verification_source: "mono_cac",
        verified_at: new Date().toISOString(),
        onboarding_completed: true,
        onboarding_step: 3,
      });
      await setConversationState(telegramId, null);

      await sendMessage(
        chatId,
        `✅ <b>Verification Successful!</b>\n\n` +
        `Company: ${result.data.companyName}\n` +
        `Status: ${result.data.status}\n\n` +
        `You're all set up! Here's what you can do:\n\n` +
        `📸 Send a receipt photo to log expenses\n` +
        `❓ Type /help for more commands`
      );
    }
  } catch (error) {
    console.error("CAC verification error:", error);
    await sendMessage(chatId, `❌ CAC verification failed. Please check and try again.`);
  }
}

async function handlePhoto(chatId: number, telegramId: string, user: any, fileId: string) {
  await sendMessage(chatId, `📸 Processing your receipt...`);

  try {
    const fileUrl = await getFileUrl(fileId);
    const extractedData = await extractReceiptData(fileUrl);

    if (!extractedData) {
      await sendMessage(
        chatId,
        `❌ Could not extract receipt data. Please try with a clearer image.`
      );
      return;
    }

    // Sanitize extracted data before saving
    const sanitizedMerchant = sanitizeInput(extractedData.merchant, 200);
    const sanitizedAmount = sanitizeAmount(extractedData.amount);
    const sanitizedCategory = sanitizeInput(extractedData.category, 50) || "other";
    
    // Save to receipts table
    const { data: receipt, error } = await supabase
      .from("receipts")
      .insert({
        user_id: user.id,
        merchant: sanitizedMerchant || "Unknown",
        amount: sanitizedAmount,
        date: extractedData.date,
        category: sanitizedCategory,
        confidence: extractedData.confidence,
        image_url: fileUrl,
        confirmed: false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error saving receipt:", error);
      await sendMessage(chatId, `❌ Error saving receipt. Please try again.`);
      return;
    }

    const confidenceEmoji = extractedData.confidence > 0.8 ? "✅" : extractedData.confidence > 0.5 ? "⚠️" : "❓";

    await sendMessage(
      chatId,
      `${confidenceEmoji} <b>Receipt Extracted</b>\n\n` +
      `🏪 Merchant: ${extractedData.merchant || "Unknown"}\n` +
      `💰 Amount: ₦${extractedData.amount?.toLocaleString() || "N/A"}\n` +
      `📅 Date: ${extractedData.date || "N/A"}\n` +
      `🏷️ Category: ${extractedData.category || "other"}\n` +
      `📊 Confidence: ${Math.round((extractedData.confidence || 0) * 100)}%\n\n` +
      `Is this correct?`,
      [
        [
          { text: "✅ Confirm", callback_data: `confirm_receipt_${receipt.id}` },
          { text: "✏️ Edit", callback_data: `edit_receipt_${receipt.id}` },
        ],
      ]
    );
  } catch (error) {
    console.error("Photo processing error:", error);
    await sendMessage(chatId, `❌ Error processing receipt. Please try again.`);
  }
}

async function handleReceiptConfirmation(chatId: number, receiptId: string) {
  await supabase.from("receipts").update({ confirmed: true }).eq("id", receiptId);

  await sendMessage(chatId, `✅ Receipt confirmed and saved!\n\nSend another receipt or type /help for more options.`);
}

async function handleGeneralMessage(chatId: number, text: string) {
  await sendMessage(
    chatId,
    `I'm not sure how to help with that yet.\n\n` +
    `Here's what I can do:\n` +
    `📸 Send a receipt photo to log expenses\n` +
    `❓ Type /help for all commands`
  );
}

// ============= Main Handler =============

serve(async (req) => {
  const url = new URL(req.url);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Webhook setup endpoint
  if (url.searchParams.get("setup") === "true") {
    if (!TELEGRAM_BOT_TOKEN) {
      return new Response("TELEGRAM_BOT_TOKEN not configured", { status: 500 });
    }

    const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-bot`;
    const TELEGRAM_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
    
    const webhookPayload: { url: string; secret_token?: string } = { url: webhookUrl };
    if (TELEGRAM_WEBHOOK_SECRET) {
      webhookPayload.secret_token = TELEGRAM_WEBHOOK_SECRET;
      console.log("[Webhook Setup] Including secret_token for signature verification");
    } else {
      console.warn("[Webhook Setup] No TELEGRAM_WEBHOOK_SECRET set - webhook will be unprotected!");
    }
    
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(webhookPayload),
      }
    );

    const result = await response.json();
    console.log("Webhook setup result:", result);

    return new Response(
      JSON.stringify({ message: "Webhook registered!", result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Health check
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ status: "ok", message: "Telegram bot is running" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Handle Telegram webhook
  if (req.method === "POST") {
    try {
      // Validate webhook secret (security feature)
      const TELEGRAM_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");

      if (TELEGRAM_WEBHOOK_SECRET) {
        const secretHeader = req.headers.get("X-Telegram-Bot-Api-Secret-Token");

        if (secretHeader !== TELEGRAM_WEBHOOK_SECRET) {
          console.error("[Security] Invalid webhook secret from IP:", req.headers.get("CF-Connecting-IP"));
          return new Response("Forbidden", { status: 403, headers: corsHeaders });
        }

        console.log("[Security] Webhook secret validated ✓");
      } else {
        console.warn("[Security] TELEGRAM_WEBHOOK_SECRET not set - webhook is unprotected!");
      }

      // Check if bot is enabled
      const botEnabled = await isBotEnabled();
      if (!botEnabled) {
        console.log("[telegram-bot] Bot is disabled, ignoring update");
        return new Response("OK", { headers: corsHeaders });
      }

      const update = await req.json();
      console.log("Received update:", JSON.stringify(update, null, 2));

      // Extract telegram ID for rate limiting (before full processing)
      const rateLimitTelegramId = 
        update.callback_query?.from?.id?.toString() || 
        update.message?.from?.id?.toString();
      
      if (rateLimitTelegramId) {
        const rateLimit = checkRateLimit(rateLimitTelegramId);
        
        if (!rateLimit.allowed) {
          console.warn(`[Rate Limit] Rejecting request from ${rateLimitTelegramId}`);
          
          // Get chat ID to send warning (only on first rejection)
          const chatId = update.callback_query?.message?.chat?.id || update.message?.chat?.id;
          if (chatId && rateLimit.resetIn > 25) {
            // Only warn once at the start of a block (when resetIn is high)
            await sendMessage(
              chatId,
              `⚠️ <b>Slow down!</b>\n\nYou're sending messages too quickly. Please wait ${rateLimit.resetIn} seconds before trying again.`
            );
          }
          
          return new Response("OK", { headers: corsHeaders });
        }
      }

      // Handle callback queries (button clicks)
      if (update.callback_query) {
        const { id, from, data, message } = update.callback_query;
        const chatId = message.chat.id;
        const telegramId = from.id.toString();

        await answerCallbackQuery(id);
        const user = await ensureUser(telegramId, from);

        // Check if user is blocked
        if (user.is_blocked) {
          await sendMessage(chatId, "⚠️ Your account has been suspended. Please contact support for assistance.");
          return new Response("OK", { headers: corsHeaders });
        }

        if (data.startsWith("entity_")) {
          await handleEntitySelection(chatId, telegramId, data);
        } else if (data.startsWith("confirm_receipt_")) {
          const receiptId = data.replace("confirm_receipt_", "");
          await handleReceiptConfirmation(chatId, receiptId);
        } else if (data.startsWith("edit_receipt_")) {
          await sendMessage(
            chatId,
            `✏️ To edit, please send the corrected details in this format:\n\n` +
            `Merchant: [name]\nAmount: [amount]\nDate: [YYYY-MM-DD]\nCategory: [category]`
          );
        }

        return new Response("OK", { headers: corsHeaders });
      }

      // Handle regular messages
      if (update.message) {
        const { chat, from, text, photo, document } = update.message;
        const chatId = chat.id;
        const telegramId = from.id.toString();

        const user = await ensureUser(telegramId, from);

        // Check if user is blocked
        if (user.is_blocked) {
          await sendMessage(chatId, "⚠️ Your account has been suspended. Please contact support for assistance.");
          return new Response("OK", { headers: corsHeaders });
        }

        const state = await getConversationState(telegramId);

        // Handle commands - check standard commands first, then custom
        if (text?.startsWith("/")) {
          const command = text.split(" ")[0].toLowerCase();

          if (command === "/start") {
            await handleStart(chatId, telegramId, user);
            return new Response("OK", { headers: corsHeaders });
          } else if (command === "/help") {
            await handleHelp(chatId);
            return new Response("OK", { headers: corsHeaders });
          } else {
            // Check for custom commands from bot_commands table
            const customResponse = await getCustomCommandResponse(command);
            if (customResponse) {
              await sendMessage(chatId, customResponse);
              return new Response("OK", { headers: corsHeaders });
            }
          }
        }

        // Handle conversation states
        if (state?.expecting === "nin" && text) {
          await handleNINInput(chatId, telegramId, text);
        } else if (state?.expecting === "business_name" && text) {
          await handleBusinessNameInput(chatId, telegramId, text);
        } else if (state?.expecting === "cac" && text) {
          await handleCACInput(chatId, telegramId, text);
        }
        // Handle photos
        else if (photo && photo.length > 0) {
          const largestPhoto = photo[photo.length - 1];
          await handlePhoto(chatId, telegramId, user, largestPhoto.file_id);
        }
        // Handle unknown text
        else if (text && !text.startsWith("/")) {
          await handleGeneralMessage(chatId, text);
        }
      }

      return new Response("OK", { headers: corsHeaders });
    } catch (error) {
      console.error("Error processing update:", error);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
});
