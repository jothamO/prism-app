/**
 * Telegram Bot Gateway Adapter
 * Forwards all messages to Railway Gateway
 * Supports text messages, callbacks, and document uploads
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";
import { getChatHistory, storeMessage } from "../_shared/history-service.ts";

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

async function removeButtons(chatId: number, messageId: number) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            reply_markup: { inline_keyboard: [] }
        })
    });
}

// ============= Markdown to Telegram HTML =============

function toTelegramHTML(markdown: string): string {
    return markdown
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.*?)\*/g, '<i>$1</i>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n\n/g, '\n\n');
}

// ============= Chat History =============
// Using shared history-service.ts for getChatHistory and storeMessage

// ============= Chat Assist Integration =============

async function callChatAssist(message: string, userId: string): Promise<{ response: string }> {
    const history = await getChatHistory(userId, 6);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/chat-assist`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
            message,
            history,
            context: { userId }
        })
    });

    if (!response.ok) {
        throw new Error(`chat-assist failed: ${response.status}`);
    }

    return response.json();
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
    aiMode?: boolean;  // boolean: true for AI mode, false for strict mode
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

            // ============= TOKEN VERIFICATION FOR WEB REGISTRATION =============
            if (text.startsWith('/start ')) {
                const token = text.replace('/start ', '').trim();
                console.log(`[Telegram] Token verification attempt: ${token.substring(0, 8)}...`);

                // Verify token
                const { data: authToken, error: tokenError } = await supabase
                    .from('telegram_auth_tokens')
                    .select('*, user_id')
                    .eq('token', token)
                    .eq('used', false)
                    .gt('expires_at', new Date().toISOString())
                    .single();

                if (tokenError || !authToken) {
                    console.log(`[Telegram] Invalid or expired token: ${tokenError?.message}`);
                    await sendMessage(chatId,
                        `❌ <b>Invalid or expired link</b>\n\n` +
                        `This registration link is no longer valid.\n\n` +
                        `Please register again at: https://prism.tax`,
                        [[{ text: '🔗 Register', callback_data: 'open_registration' }]]
                    );
                    return new Response(JSON.stringify({ ok: true }), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }

                // Fetch user details
                const { data: userData } = await supabase
                    .from('users')
                    .select('full_name, work_status, income_type, bank_setup')
                    .eq('id', authToken.user_id)
                    .single();

                if (!userData) {
                    await sendMessage(chatId,
                        `❌ User profile not found. Please contact support.`
                    );
                    return new Response(JSON.stringify({ ok: true }), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }

                // Link Telegram account to user
                const { error: updateError } = await supabase
                    .from('users')
                    .update({
                        telegram_id: telegramId,
                        telegram_username: message.from?.username || null,
                        first_name: message.from?.first_name || null,
                        last_name: message.from?.last_name || null,
                        onboarding_completed: true
                    })
                    .eq('id', authToken.user_id);

                if (updateError) {
                    console.error('[Telegram] Failed to link account:', updateError);
                    await sendMessage(chatId,
                        `❌ Failed to link your account. Please try again.`
                    );
                    return new Response(JSON.stringify({ ok: true }), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }

                // Mark token as used
                await supabase
                    .from('telegram_auth_tokens')
                    .update({ used: true, telegram_id: telegramId })
                    .eq('id', authToken.id);

                console.log(`[Telegram] Successfully linked user ${authToken.user_id} to Telegram ${telegramId}`);

                // Format work status for display
                const formatWorkStatus = (status: string) => {
                    const map: Record<string, string> = {
                        'business': '🏢 Business Owner',
                        'employed': '💼 Employed',
                        'freelancer': '💻 Freelancer',
                        'student': '📚 Student',
                        'retired': '🌴 Retired'
                    };
                    return map[status] || status;
                };

                const formatIncomeType = (type: string) => {
                    const map: Record<string, string> = {
                        'salary': '💰 Salary',
                        'business': '🏪 Business Income',
                        'rental': '🏠 Rental',
                        'investment': '📈 Investment',
                        'consulting': '🎯 Consulting',
                        'multiple': '📊 Multiple Sources'
                    };
                    return map[type] || type;
                };

                // Send welcome message with profile summary
                await sendMessage(chatId,
                    `👋 <b>Welcome to PRISM, ${userData.full_name?.split(' ')[0] || 'there'}!</b>\n\n` +
                    `Your account has been successfully linked! Here's your profile:\n\n` +
                    `📋 <b>Your Profile:</b>\n` +
                    `• Status: ${formatWorkStatus(userData.work_status)}\n` +
                    `• Income: ${formatIncomeType(userData.income_type)}\n` +
                    `• Accounts: ${userData.bank_setup === 'mixed' ? 'Mixed' : userData.bank_setup === 'separate' ? 'Separate' : 'Multiple'}\n\n` +
                    `Now let's connect your bank account for automatic tax tracking! 🏦`,
                    [[{ text: '🔗 Connect Bank Account', callback_data: 'connect_bank' }]]
                );

                return new Response(JSON.stringify({ ok: true }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            // ============= REGULAR MESSAGE HANDLING =============

            // Check if user exists
            const { data: existingUser } = await supabase
                .from('users')
                .select('id, onboarding_completed, is_blocked')
                .eq('telegram_id', telegramId)
                .single();

            const isNewUser = !existingUser;

            // ============= WEB-ONLY REGISTRATION ENFORCEMENT =============
            // Unregistered users: ALWAYS prompt to register on web (for ALL messages)
            if (isNewUser) {
                await sendMessage(chatId,
                    `👋 <b>Welcome to PRISM Tax Assistant!</b>\n\n` +
                    `To use this bot, please register first:\n` +
                    `🔗 https://prismtaxassistant.lovable.app/register\n\n` +
                    `After registration, link your Telegram account in Settings → Connected Accounts.`,
                    [[{ text: '🔗 Register Now', callback_data: 'open_registration' }]]
                );
                return new Response(JSON.stringify({ ok: true }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            // Check if user is blocked
            if (existingUser.is_blocked) {
                await sendMessage(chatId,
                    `⚠️ Your account has been suspended. Please contact support.`
                );
                return new Response(JSON.stringify({ ok: true }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            // ============= REGISTERED USER: PROCESS MESSAGE =============
            try {
                await sendChatAction(chatId, "typing");

                // Store user message
                await storeMessage(existingUser.id, 'telegram', 'user', text);

                // Call chat-assist with conversation history
                const aiResponse = await callChatAssist(text, existingUser.id);

                // Store assistant response
                await storeMessage(existingUser.id, 'telegram', 'assistant', aiResponse.response);

                // Convert markdown to Telegram HTML and send
                const htmlResponse = toTelegramHTML(aiResponse.response);
                await sendMessage(chatId, htmlResponse);

            } catch (error) {
                console.error('[Telegram] chat-assist error:', error);
                await sendMessage(chatId,
                    "I'm having trouble connecting right now. Please try again in a moment."
                );
            }

            return new Response(JSON.stringify({ ok: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Handle callback query (button clicks)
        if (update.callback_query) {
            const callbackQuery = update.callback_query;
            const chatId = callbackQuery.message.chat.id;
            const messageId = callbackQuery.message.message_id;
            const telegramId = String(callbackQuery.from.id);
            const data = callbackQuery.data;

            // Acknowledge callback and remove buttons from old message
            await answerCallbackQuery(callbackQuery.id);
            await removeButtons(chatId, messageId);

            // Handle special callbacks
            if (data === 'open_registration') {
                await sendMessage(chatId,
                    "🔗 Register at: https://prism.tax\n\nOnce registered, come back here!"
                );
                return new Response(JSON.stringify({ ok: true }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            // For other callbacks, treat as a message to chat-assist
            try {
                const { data: existingUser } = await supabase
                    .from('users')
                    .select('id')
                    .eq('telegram_id', telegramId)
                    .single();

                const userId = existingUser?.id || telegramId;
                const aiResponse = await callChatAssist(data, userId);
                const htmlResponse = toTelegramHTML(aiResponse.response);
                await sendMessage(chatId, htmlResponse);
            } catch (error) {
                console.error('[Telegram] Callback error:', error);
                await sendMessage(chatId, "Something went wrong. Please try again.");
            }

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
