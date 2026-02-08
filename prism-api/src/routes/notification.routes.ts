import { Router, Request, Response } from 'express';
import { getTelegramBot } from '../bot';
import { supabase } from '../config/supabase';

const router = Router();

// Middleware to verify agent key (for n8n)
const verifyAgentKey = (req: Request, res: Response, next: Function) => {
    const agentKey = req.headers['x-prism-agent-key'];
    const expectedKey = process.env.PRISM_AGENT_KEY;

    if (!expectedKey) {
        console.error('[Notifications] PRISM_AGENT_KEY not configured');
        return res.status(500).json({ error: 'Server misconfiguration' });
    }

    if (agentKey !== expectedKey) {
        console.warn('[Notifications] Invalid agent key attempt');
        return res.status(401).json({ error: 'Invalid agent key' });
    }

    next();
};

// Apply agent key verification to all notification routes
router.use(verifyAgentKey);

/**
 * POST /api/notifications/send
 * Send notification to users via Telegram
 * 
 * Body:
 * {
 *   userIds: string[] | 'all',  // Array of user IDs or 'all' for broadcast
 *   message: string,            // Message to send (Markdown supported)
 *   template?: 'deadline_alert' | 'weekly_digest' | 'monthly_reminder'
 * }
 */
router.post('/send', async (req: Request, res: Response) => {
    try {
        const { userIds, message, template } = req.body;

        if (!message && !template) {
            return res.status(400).json({ error: 'Message or template required' });
        }

        const bot = getTelegramBot();
        if (!bot) {
            console.error('[Notifications] Telegram bot not initialized');
            return res.status(503).json({ error: 'Telegram bot not available' });
        }

        // Determine message content
        let finalMessage = message;
        if (template && !message) {
            finalMessage = getTemplateMessage(template);
        }

        // Get users to notify
        let query = supabase
            .from('users')
            .select('id, telegram_id, first_name')
            .not('telegram_id', 'is', null);

        if (userIds !== 'all' && Array.isArray(userIds)) {
            query = query.in('id', userIds);
        }

        const { data: users, error } = await query;

        if (error) {
            console.error('[Notifications] DB error:', error);
            return res.status(500).json({ error: 'Failed to fetch users' });
        }

        if (!users || users.length === 0) {
            return res.status(404).json({ error: 'No users found with Telegram connected' });
        }

        // Send messages
        const results = await Promise.allSettled(
            users.map(async (user) => {
                const chatId = parseInt(user.telegram_id);
                const personalizedMessage = finalMessage.replace('{{name}}', user.first_name || 'there');

                console.log(`[Notifications] Sending to ${user.telegram_id}`);
                await bot.sendMessage(chatId, personalizedMessage);
                return { userId: user.id, status: 'sent' };
            })
        );

        const sent = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        console.log(`[Notifications] Sent: ${sent}, Failed: ${failed}`);

        res.json({
            success: true,
            sent,
            failed,
            total: users.length
        });
    } catch (error) {
        console.error('[Notifications] Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/notifications/deadline-alert
 * Trigger deadline reminder for VAT filing
 */
router.post('/deadline-alert', async (req: Request, res: Response) => {
    try {
        const bot = getTelegramBot();
        if (!bot) {
            return res.status(503).json({ error: 'Telegram bot not available' });
        }

        // Get users with active subscriptions
        const { data: users } = await supabase
            .from('users')
            .select('id, telegram_id, first_name')
            .not('telegram_id', 'is', null)
            .eq('subscription_status', 'active');

        if (!users || users.length === 0) {
            return res.json({ message: 'No active users to notify', sent: 0 });
        }

        const message = `📢 *PRISM REMINDER*

Hey {{name}}, your VAT filing for last month is due in *4 days* (Tax Act 2025 Sec 155).

Reply with any questions or tap the button below to review your transactions.`;

        const results = await Promise.allSettled(
            users.map(async (user) => {
                const chatId = parseInt(user.telegram_id);
                const personalizedMessage = message.replace('{{name}}', user.first_name || 'there');
                await bot.sendMessage(chatId, personalizedMessage);
                return { userId: user.id };
            })
        );

        const sent = results.filter(r => r.status === 'fulfilled').length;
        res.json({ success: true, sent, total: users.length });
    } catch (error) {
        console.error('[Notifications] Deadline alert error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/notifications/weekly-digest
 * Trigger weekly VAT digest for all users
 */
router.post('/weekly-digest', async (req: Request, res: Response) => {
    try {
        const bot = getTelegramBot();
        if (!bot) {
            return res.status(503).json({ error: 'Telegram bot not available' });
        }

        const { data: users } = await supabase
            .from('users')
            .select('id, telegram_id, first_name')
            .not('telegram_id', 'is', null);

        if (!users || users.length === 0) {
            return res.json({ message: 'No users to notify', sent: 0 });
        }

        let sent = 0;
        for (const user of users) {
            try {
                // Get user's weekly stats
                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(endDate.getDate() - 7);

                const { data: invoices } = await supabase
                    .from('invoices')
                    .select('amount, vat_amount')
                    .eq('user_id', user.id)
                    .gte('created_at', startDate.toISOString())
                    .lte('created_at', endDate.toISOString());

                const totalSales = invoices?.reduce((sum, inv) => sum + (inv.amount || 0), 0) || 0;
                const vatCollected = invoices?.reduce((sum, inv) => sum + (inv.vat_amount || 0), 0) || 0;

                const message = `📊 *Weekly VAT Digest*

Hey ${user.first_name || 'there'}! Here's your last 7 days:

💰 Sales: ₦${totalSales.toLocaleString()}
🧾 VAT Collected: ₦${vatCollected.toLocaleString()}

Reply "SUMMARY" for full details or "HELP" if you have questions.`;

                const chatId = parseInt(user.telegram_id);
                await bot.sendMessage(chatId, message);
                sent++;
            } catch (err) {
                console.error(`[Notifications] Failed for user ${user.id}:`, err);
            }
        }

        res.json({ success: true, sent, total: users.length });
    } catch (error) {
        console.error('[Notifications] Weekly digest error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/notifications/monthly-reminder
 * Trigger monthly filing reminder
 */
router.post('/monthly-reminder', async (req: Request, res: Response) => {
    try {
        const bot = getTelegramBot();
        if (!bot) {
            return res.status(503).json({ error: 'Telegram bot not available' });
        }

        const { data: users } = await supabase
            .from('users')
            .select('id, telegram_id, first_name')
            .not('telegram_id', 'is', null);

        if (!users || users.length === 0) {
            return res.json({ message: 'No users to notify', sent: 0 });
        }

        const period = new Date().toISOString().slice(0, 7);
        let sent = 0;

        for (const user of users) {
            try {
                const { data: invoices } = await supabase
                    .from('invoices')
                    .select('vat_amount')
                    .eq('user_id', user.id)
                    .eq('period', period);

                const estimatedVat = invoices?.reduce((sum, inv) => sum + (inv.vat_amount || 0), 0) || 0;

                const message = `🔔 *Filing Reminder*

Hey ${user.first_name || 'there'}! Your VAT filing for *${period}* is due soon (21st).

📊 Estimated Liability: ₦${estimatedVat.toLocaleString()}

We'll auto-file for you on the 21st unless you dispute any transactions. Reply "REVIEW" to check your transactions.`;

                const chatId = parseInt(user.telegram_id);
                await bot.sendMessage(chatId, message);
                sent++;
            } catch (err) {
                console.error(`[Notifications] Failed for user ${user.id}:`, err);
            }
        }

        res.json({ success: true, sent, total: users.length });
    } catch (error) {
        console.error('[Notifications] Monthly reminder error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

function getTemplateMessage(template: string): string {
    const templates: Record<string, string> = {
        deadline_alert: `📢 *PRISM REMINDER*

Your VAT filing deadline is approaching! Make sure your transactions are up to date.`,
        weekly_digest: `📊 *Weekly VAT Digest*

Your weekly summary is ready. Reply "SUMMARY" for details.`,
        monthly_reminder: `🔔 *Filing Reminder*

Your monthly VAT filing is due soon. We'll handle it automatically unless you need to make changes.`
    };

    return templates[template] || templates.deadline_alert;
}

export default router;
