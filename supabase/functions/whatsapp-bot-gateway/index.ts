/**
 * WhatsApp Bot Gateway Adapter
 * Forwards all messages to Railway Gateway
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN");
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
const RAW_GATEWAY_URL = Deno.env.get("RAILWAY_GATEWAY_URL");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !RAW_GATEWAY_URL) {
    throw new Error("Missing WhatsApp or Gateway configuration");
}

// Ensure URL has protocol prefix
const RAILWAY_GATEWAY_URL = RAW_GATEWAY_URL.startsWith("http") 
    ? RAW_GATEWAY_URL 
    : `https://${RAW_GATEWAY_URL}`;

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

// ============= Gateway Metadata =============

interface GatewayMetadata {
    source: string;
    timestamp: string;
    needsOnboarding?: boolean;
    isNewUser?: boolean;
    userName?: string;
}

// ============= WhatsApp API Helpers =============

async function sendWhatsAppMessage(to: string, text: string, buttons?: { id: string; title: string }[]) {
    const payload: any = {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
    };

    if (buttons && buttons.length > 0) {
        payload.type = "interactive";
        payload.interactive = {
            type: "button",
            body: { text },
            action: {
                buttons: buttons.map(btn => ({
                    type: "reply",
                    reply: { id: btn.id, title: btn.title }
                }))
            }
        };
    }

    const response = await fetch(
        `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${WHATSAPP_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        }
    );

    return response.json();
}

// ============= Gateway Adapter =============

async function forwardToGateway(
    userId: string, 
    message: string, 
    messageId: string,
    metadata?: Partial<GatewayMetadata>
) {
    console.log(`[WhatsApp] Forwarding to Gateway: ${userId} - ${message.substring(0, 50)}...`);

    try {
        const response = await fetch(`${RAILWAY_GATEWAY_URL}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId,
                platform: "whatsapp",
                message,
                idempotencyKey: `whatsapp_${userId}_${messageId}`,
                metadata: {
                    source: "whatsapp_bot",
                    timestamp: new Date().toISOString(),
                    ...metadata
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
        const body = await req.json();
        console.log("[WhatsApp] Received webhook:", JSON.stringify(body).substring(0, 200));

        // Handle webhook verification
        if (req.url.includes("hub.verify_token")) {
            const params = new URL(req.url).searchParams;
            const mode = params.get("hub.mode");
            const token = params.get("hub.verify_token");
            const challenge = params.get("hub.challenge");

            if (mode === "subscribe" && token === "prism_verify_token") {
                return new Response(challenge, {
                    headers: { "Content-Type": "text/plain" },
                });
            }
        }

        // Handle incoming messages
        if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
            const message = body.entry[0].changes[0].value.messages[0];
            const from = message.from;
            const messageId = message.id;
            let text = "";

            // Extract message text
            if (message.type === "text") {
                text = message.text.body;
            } else if (message.type === "interactive") {
                text = message.interactive.button_reply.id;
            }

            // Check if user exists and needs onboarding
            const { data: existingUser } = await supabase
                .from('users')
                .select('id, onboarding_completed')
                .eq('whatsapp_id', from)
                .single();

            const isNewUser = !existingUser;
            const needsOnboarding = isNewUser || !existingUser?.onboarding_completed;

            // Forward to Gateway with user status metadata
            const gatewayResponse = await forwardToGateway(from, text, messageId, {
                needsOnboarding,
                isNewUser
            });

            // Convert Telegram-style buttons to WhatsApp format
            let whatsappButtons = undefined;
            if (gatewayResponse.buttons && gatewayResponse.buttons.length > 0) {
                whatsappButtons = gatewayResponse.buttons.flat().slice(0, 3).map((btn: any) => ({
                    id: btn.callback_data,
                    title: btn.text.substring(0, 20) // WhatsApp button title max 20 chars
                }));
            }

            // Send response back to WhatsApp
            await sendWhatsAppMessage(from, gatewayResponse.message, whatsappButtons);

            return new Response(JSON.stringify({ ok: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ ok: true, message: "No action needed" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("[WhatsApp Bot Error]:", error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500,
            }
        );
    }
});
