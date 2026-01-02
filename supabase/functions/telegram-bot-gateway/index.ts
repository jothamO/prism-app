/**
 * Telegram Bot Gateway Adapter
 * Forwards all messages to Railway Gateway
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const RAILWAY_GATEWAY_URL = Deno.env.get("RAILWAY_GATEWAY_URL");

if (!TELEGRAM_BOT_TOKEN || !RAILWAY_GATEWAY_URL) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN or RAILWAY_GATEWAY_URL");
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

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
}

// ============= Gateway Adapter =============

async function forwardToGateway(userId: string, message: string, messageId: number) {
    console.log(`[Telegram] Forwarding to Gateway: ${userId} - ${message.substring(0, 50)}...`);

    try {
        const response = await fetch(`${RAILWAY_GATEWAY_URL}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId,
                platform: "telegram",
                message,
                idempotencyKey: `telegram_${userId}_${messageId}`,
                metadata: {
                    source: "telegram_bot",
                    timestamp: new Date().toISOString()
                }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Gateway Error] ${response.status}: ${errorText}`);
            throw new Error(`Gateway returned ${response.status}`);
        }

        const result = await response.json();
        console.log(`[Gateway Response] Success`);
        return result;
    } catch (error) {
        console.error("[Gateway] Connection failed:", error);
        throw error;
    }
}

// ============= Main Handler =============

serve(async (req) => {
    // Handle CORS
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const update = await req.json();
        console.log("[Telegram] Received update:", JSON.stringify(update).substring(0, 200));

        // Handle regular message
        if (update.message) {
            const message = update.message;
            const chatId = message.chat.id;
            const telegramId = String(message.from.id);
            const text = message.text || "";

            // Forward to Gateway
            const gatewayResponse = await forwardToGateway(telegramId, text, message.message_id);

            // Send response back to Telegram
            await sendMessage(chatId, gatewayResponse.message, gatewayResponse.buttons);

            return new Response(JSON.stringify({ ok: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Handle callback query (button clicks)
        if (update.callback_query) {
            const callbackQuery = update.callback_query;
            const chatId = callbackQuery.message.chat.id;
            const telegramId = String(callbackQuery.from.id);
            const data = callbackQuery.data;

            await answerCallbackQuery(callbackQuery.id);

            // Forward to Gateway
            const gatewayResponse = await forwardToGateway(telegramId, data, callbackQuery.id);

            // Send response
            await sendMessage(chatId, gatewayResponse.message, gatewayResponse.buttons);

            return new Response(JSON.stringify({ ok: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ ok: true, message: "No action needed" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("[Telegram Bot Error]:", error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500,
            }
        );
    }
});
