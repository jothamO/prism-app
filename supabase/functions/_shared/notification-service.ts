/**
 * Notification Service - V16
 * 
 * Unified notification API for all channels:
 * - in_app: compliance_notifications table
 * - telegram: via telegram-service
 * - email: via Resend (future)
 * - whatsapp: via WhatsApp API (future)
 */

import { getSupabaseAdmin } from './supabase.ts';
import { sendTelegramMessage } from './telegram-service.ts';
import { getUserByTelegram, getUser } from './user-resolver.ts';

// ============= Types =============

export type NotificationChannel = 'in_app' | 'telegram' | 'whatsapp' | 'email';
export type NotificationPriority = 'low' | 'normal' | 'high';
export type NotificationType =
    | 'deadline_reminder'
    | 'morning_briefing'
    | 'weekly_summary'
    | 'quarterly_review'
    | 'new_regulation'
    | 'rate_change'
    | 'general';

export interface NotifyParams {
    userId: string;
    channel: NotificationChannel;
    title: string;
    message: string;
    priority?: NotificationPriority;
    type?: NotificationType;
    actionUrl?: string;
    metadata?: Record<string, unknown>;
}

export interface NotifyResult {
    success: boolean;
    channel: NotificationChannel;
    error?: string;
}

// ============= Main Function =============

/**
 * Send a notification through any channel
 */
export async function notify(params: NotifyParams): Promise<NotifyResult> {
    const {
        userId,
        channel,
        title,
        message,
        priority = 'normal',
        type = 'general',
        actionUrl,
        metadata
    } = params;

    try {
        switch (channel) {
            case 'in_app':
                return await sendInAppNotification(userId, title, message, priority, type, actionUrl, metadata);

            case 'telegram':
                return await sendTelegramNotification(userId, title, message);

            case 'whatsapp':
                // TODO: Implement WhatsApp integration
                console.log('[notification-service] WhatsApp not yet implemented');
                return { success: false, channel, error: 'WhatsApp not implemented' };

            case 'email':
                // TODO: Implement email via Resend
                console.log('[notification-service] Email not yet implemented');
                return { success: false, channel, error: 'Email not implemented' };

            default:
                return { success: false, channel, error: 'Unknown channel' };
        }
    } catch (error) {
        console.error(`[notification-service] ${channel} error:`, error);
        return {
            success: false,
            channel,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Send notification to multiple channels (best effort)
 */
export async function notifyMultiChannel(
    userId: string,
    channels: NotificationChannel[],
    title: string,
    message: string,
    options?: Omit<NotifyParams, 'userId' | 'channel' | 'title' | 'message'>
): Promise<NotifyResult[]> {
    const results = await Promise.all(
        channels.map(channel =>
            notify({ userId, channel, title, message, ...options })
        )
    );
    return results;
}

// ============= Channel Implementations =============

async function sendInAppNotification(
    userId: string,
    title: string,
    message: string,
    priority: NotificationPriority,
    type: NotificationType,
    actionUrl?: string,
    metadata?: Record<string, unknown>
): Promise<NotifyResult> {
    const supabase = getSupabaseAdmin();

    // Map priority to severity
    const severityMap: Record<NotificationPriority, string> = {
        low: 'info',
        normal: 'info',
        high: 'warning',
    };

    const { error } = await supabase
        .from('compliance_notifications')
        .insert({
            user_id: userId,
            title,
            message,
            notification_type: type,
            severity: severityMap[priority],
            action_url: actionUrl,
            metadata,
        });

    if (error) {
        console.error('[notification-service] in_app insert error:', error);
        return { success: false, channel: 'in_app', error: error.message };
    }

    console.log(`[notification-service] in_app sent to ${userId}: ${title}`);
    return { success: true, channel: 'in_app' };
}

async function sendTelegramNotification(
    userId: string,
    title: string,
    message: string
): Promise<NotifyResult> {
    // Get user's telegram ID
    const user = await getUser(userId);

    if (!user?.telegramId) {
        return { success: false, channel: 'telegram', error: 'User has no Telegram ID' };
    }

    // Format message for Telegram
    const formattedMessage = `<b>${title}</b>\n\n${message}`;

    const result = await sendTelegramMessage(user.telegramId, formattedMessage, {
        parseMode: 'HTML',
    });

    if (!result.ok) {
        return { success: false, channel: 'telegram', error: result.error };
    }

    console.log(`[notification-service] telegram sent to ${user.telegramId}: ${title}`);
    return { success: true, channel: 'telegram' };
}

// ============= Bulk Notifications =============

/**
 * Send same notification to multiple users
 */
export async function notifyUsers(
    userIds: string[],
    channel: NotificationChannel,
    title: string,
    message: string,
    options?: Omit<NotifyParams, 'userId' | 'channel' | 'title' | 'message'>
): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    for (const userId of userIds) {
        const result = await notify({ userId, channel, title, message, ...options });
        if (result.success) {
            sent++;
        } else {
            failed++;
        }
    }

    console.log(`[notification-service] bulk ${channel}: sent=${sent}, failed=${failed}`);
    return { sent, failed };
}
