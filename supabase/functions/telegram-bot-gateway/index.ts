/**
 * Telegram Bot Gateway Adapter
 * Forwards all messages to Railway Gateway
 * Supports text messages, callbacks, and document uploads
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const RAW_GATEWAY_URL = Deno.env.get("RAILWAY_GATEWAY_URL");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!TELEGRAM_BOT_TOKEN || !RAW_GATEWAY_URL) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN or RAILWAY_GATEWAY_URL");
}

// Ensure URL has protocol prefix
const RAILWAY_GATEWAY_URL = RAW_GATEWAY_URL.startsWith("http") 
    ? RAW_GATEWAY_URL 
    : `https://${RAW_GATEWAY_URL}`;

// Initialize Supabase client for storage
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

// Supported document types
const SUPPORTED_MIME_TYPES = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp'
];

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

async function sendChatAction(chatId: number, action: string = "upload_document") {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action }),
    });
}

// ============= File Handling =============

async function getFileInfo(fileId: string): Promise<{ file_path: string; file_size: number } | null> {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId }),
    });
    
    const result = await response.json();
    if (!result.ok) {
        console.error("[Telegram] Failed to get file info:", result);
        return null;
    }
    
    return result.result;
}

async function downloadTelegramFile(filePath: string): Promise<ArrayBuffer> {
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status}`);
    }
    
    return response.arrayBuffer();
}

async function uploadToStorage(
    userId: string, 
    fileBuffer: ArrayBuffer, 
    fileName: string, 
    mimeType: string
): Promise<string> {
    const storagePath = `${userId}/${Date.now()}_${fileName}`;
    
    const { data, error } = await supabase.storage
        .from('bank-statements')
        .upload(storagePath, fileBuffer, {
            contentType: mimeType,
            upsert: false
        });
    
    if (error) {
        console.error("[Storage] Upload failed:", error);
        throw new Error(`Storage upload failed: ${error.message}`);
    }
    
    // Get signed URL for the file (1 hour expiry)
    const { data: urlData } = await supabase.storage
        .from('bank-statements')
        .createSignedUrl(storagePath, 3600);
    
    return urlData?.signedUrl || storagePath;
}

function getDocumentType(mimeType: string, fileName: string): 'bank_statement' | 'invoice' | 'receipt' {
    const lowerName = fileName.toLowerCase();
    
    if (lowerName.includes('invoice') || lowerName.includes('inv')) {
        return 'invoice';
    }
    if (lowerName.includes('receipt') || lowerName.includes('rcpt')) {
        return 'receipt';
    }
    // Default to bank statement
    return 'bank_statement';
}

// ============= Gateway Adapter =============

interface GatewayMetadata {
    source: string;
    timestamp: string;
    documentUrl?: string;
    documentType?: string;
    fileName?: string;
    needsOnboarding?: boolean;
    isNewUser?: boolean;
    userName?: string;
}

async function forwardToGateway(
    userId: string, 
    message: string, 
    messageId: number | string,
    metadata?: Partial<GatewayMetadata>
) {
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

// ============= Document Handler =============

async function handleDocument(
    chatId: number, 
    telegramId: string, 
    document: any, 
    messageId: number
): Promise<void> {
    const { file_id, file_name, mime_type, file_size } = document;
    
    console.log(`[Telegram] Document received: ${file_name} (${mime_type}, ${file_size} bytes)`);
    
    // Validate file type
    if (!SUPPORTED_MIME_TYPES.includes(mime_type)) {
        await sendMessage(chatId, 
            `❌ Unsupported file type: ${mime_type}\n\n` +
            `Please upload a PDF or image file (PNG, JPEG, WEBP).`
        );
        return;
    }
    
    // Check file size (20MB limit)
    if (file_size > 20 * 1024 * 1024) {
        await sendMessage(chatId, 
            `❌ File too large (${(file_size / 1024 / 1024).toFixed(1)}MB)\n\n` +
            `Maximum file size is 20MB.`
        );
        return;
    }
    
    // Show typing indicator
    await sendChatAction(chatId, "upload_document");
    
    // Acknowledge receipt
    await sendMessage(chatId, 
        `📄 Received: <b>${file_name}</b>\n\n` +
        `Downloading and preparing for analysis...`
    );
    
    try {
        // Get file path from Telegram
        const fileInfo = await getFileInfo(file_id);
        if (!fileInfo) {
            throw new Error("Could not get file info from Telegram");
        }
        
        console.log(`[Telegram] File path: ${fileInfo.file_path}`);
        
        // Download file from Telegram
        await sendChatAction(chatId, "typing");
        const fileBuffer = await downloadTelegramFile(fileInfo.file_path);
        console.log(`[Telegram] Downloaded ${fileBuffer.byteLength} bytes`);
        
        // Upload to Supabase storage
        const documentUrl = await uploadToStorage(telegramId, fileBuffer, file_name, mime_type);
        console.log(`[Telegram] Uploaded to storage: ${documentUrl.substring(0, 50)}...`);
        
        // Determine document type from filename
        const documentType = getDocumentType(mime_type, file_name);
        
        // Forward to Gateway with document metadata
        const gatewayResponse = await forwardToGateway(
            telegramId,
            `[Document Upload] ${file_name}`,
            messageId,
            {
                documentUrl,
                documentType,
                fileName: file_name
            }
        );
        
        // Send Gateway response back to user
        await sendMessage(chatId, gatewayResponse.message, gatewayResponse.buttons);
        
    } catch (error) {
        console.error("[Document Handler] Error:", error);
        await sendMessage(chatId, 
            `❌ Failed to process document.\n\n` +
            `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
            `Please try again or send a different file.`
        );
    }
}

// ============= Photo Handler =============

async function handlePhoto(
    chatId: number, 
    telegramId: string, 
    photos: any[], 
    messageId: number
): Promise<void> {
    // Get the largest photo (last in array)
    const photo = photos[photos.length - 1];
    const { file_id, file_size } = photo;
    
    console.log(`[Telegram] Photo received: ${file_size} bytes`);
    
    // Show typing indicator
    await sendChatAction(chatId, "typing");
    
    await sendMessage(chatId, 
        `📷 Photo received!\n\n` +
        `Downloading and preparing for analysis...`
    );
    
    try {
        // Get file path from Telegram
        const fileInfo = await getFileInfo(file_id);
        if (!fileInfo) {
            throw new Error("Could not get file info from Telegram");
        }
        
        // Download file
        const fileBuffer = await downloadTelegramFile(fileInfo.file_path);
        const fileName = `photo_${Date.now()}.jpg`;
        
        // Upload to storage
        const documentUrl = await uploadToStorage(telegramId, fileBuffer, fileName, 'image/jpeg');
        
        // Forward to Gateway
        const gatewayResponse = await forwardToGateway(
            telegramId,
            `[Photo Upload] Bank statement image`,
            messageId,
            {
                documentUrl,
                documentType: 'bank_statement',
                fileName
            }
        );
        
        await sendMessage(chatId, gatewayResponse.message, gatewayResponse.buttons);
        
    } catch (error) {
        console.error("[Photo Handler] Error:", error);
        await sendMessage(chatId, 
            `❌ Failed to process photo.\n\n` +
            `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
            `Please try again.`
        );
    }
}

// ============= Main Handler =============

serve(async (req) => {
    // Handle CORS
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const url = new URL(req.url);

    // Handle webhook setup
    if (url.searchParams.get("setup") === "true") {
        console.log("[Telegram] Setting up webhook...");
        const webhookUrl = `https://rjajxabpndmpcgssymxw.supabase.co/functions/v1/telegram-bot-gateway`;
        const response = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: webhookUrl,
                    secret_token: Deno.env.get("TELEGRAM_WEBHOOK_SECRET"),
                }),
            }
        );
        const result = await response.json();
        console.log("[Telegram] Webhook setup result:", result);
        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Validate webhook signature
    const secretToken = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
    if (expectedSecret && secretToken !== expectedSecret) {
        console.warn("[Telegram] Unauthorized request - invalid secret token");
        return new Response("Unauthorized", { status: 401 });
    }

    try {
        const update = await req.json();
        console.log("[Telegram] Received update:", JSON.stringify(update).substring(0, 300));

        // Handle regular message
        if (update.message) {
            const message = update.message;
            const chatId = message.chat.id;
            const telegramId = String(message.from.id);

            // Handle document upload (PDF, etc.)
            if (message.document) {
                await handleDocument(chatId, telegramId, message.document, message.message_id);
                return new Response(JSON.stringify({ ok: true }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            // Handle photo upload
            if (message.photo && message.photo.length > 0) {
                await handlePhoto(chatId, telegramId, message.photo, message.message_id);
                return new Response(JSON.stringify({ ok: true }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            // Handle text message
            const text = message.text || "";

            // Check if user exists and needs onboarding
            const { data: existingUser } = await supabase
                .from('users')
                .select('id, onboarding_completed')
                .eq('telegram_id', telegramId)
                .single();

            const isNewUser = !existingUser;
            const needsOnboarding = isNewUser || !existingUser?.onboarding_completed;

            // Forward to Gateway with user status metadata
            const gatewayResponse = await forwardToGateway(telegramId, text, message.message_id, {
                needsOnboarding,
                isNewUser,
                userName: message.from?.first_name
            });

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
