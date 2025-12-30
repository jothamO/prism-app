import { Queue, Worker } from 'bullmq';
import { supabase } from '../config/database';
import { whatsappService } from '../services/whatsapp.service';
import { redisConnection } from '../config/redis';

export const notificationQueue = new Queue('notifications', { connection: redisConnection });

const worker = new Worker('notifications', async (job) => {
    if (job.name === 'weekly-digest') {
        const { userId } = job.data;
        await sendWeeklyDigest(userId);
    } else if (job.name === 'monthly-reminder') {
        const { userId } = job.data;
        await sendMonthlyReminder(userId);
    } else if (job.name === 'schedule-weekly') {
        await scheduleAllWeeklyDigests();
    } else if (job.name === 'schedule-monthly') {
        await scheduleAllMonthlyReminders();
    }
}, { connection: redisConnection });

async function scheduleAllWeeklyDigests() {
    const { data: users } = await supabase.from('users').select('id').eq('subscription_status', 'active');
    for (const user of users || []) {
        await notificationQueue.add('weekly-digest', { userId: user.id });
    }
}

async function scheduleAllMonthlyReminders() {
    const { data: users } = await supabase.from('users').select('id').eq('subscription_status', 'active');
    for (const user of users || []) {
        await notificationQueue.add('monthly-reminder', { userId: user.id });
    }
}

async function sendWeeklyDigest(userId: string) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);

    const { data: invoices } = await supabase
        .from('invoices')
        .select('amount, vat_amount')
        .eq('user_id', userId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

    const totalSales = invoices?.reduce((sum, inv) => sum + inv.amount, 0) || 0;
    const vatCollected = invoices?.reduce((sum, inv) => sum + inv.vat_amount, 0) || 0;

    const { data: user } = await supabase.from('users').select('whatsapp_number').eq('id', userId).single();
    if (user) {
        await whatsappService.sendMessage(user.whatsapp_number, `
📊 *Weekly VAT Digest*
Last 7 days:

Sales: ₦${totalSales.toLocaleString()}
VAT Collected: ₦${vatCollected.toLocaleString()}

Reply "SUMMARY" for full details.
        `);
    }
}

async function sendMonthlyReminder(userId: string) {
    const { data: user } = await supabase.from('users').select('whatsapp_number').eq('id', userId).single();

    const period = new Date().toISOString().slice(0, 7);
    const { data: invoices } = await supabase
        .from('invoices')
        .select('vat_amount')
        .eq('user_id', userId)
        .eq('period', period);

    const estimatedVat = invoices?.reduce((sum, inv) => sum + inv.vat_amount, 0) || 0;

    if (user) {
        await whatsappService.sendMessage(user.whatsapp_number, `
🔔 *Filing Reminder*

Your VAT filing for ${period} is due soon (21st).
Current Estimated Liability: ₦${estimatedVat.toLocaleString()}

We will auto-file for you on the 21st unless you dispute any transactions.
        `);
    }
}

export async function scheduleNotifications() {
    const repeatableJobs = await notificationQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        await notificationQueue.removeRepeatableByKey(job.key);
    }

    await notificationQueue.add('schedule-weekly', {}, {
        repeat: { pattern: '0 9 * * 1' }
    });

    await notificationQueue.add('schedule-monthly', {}, {
        repeat: { pattern: '0 10 18 * *' }
    });

    console.log('📅 Scheduled proactive notifications');
}
