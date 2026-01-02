import { Queue, Worker } from 'bullmq';
import { supabase } from '../config/database';
import { whatsappService } from '../services/whatsapp.service';
import { emtlDetectorService } from '../services/emtl-detector.service';
import { bankChargeCategorizer } from '../services/bank-charge-categorizer.service';

const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
};

// Create queue for weekly savings alerts
const savingsAlertQueue = new Queue('savings-alerts', { connection });

/**
 * Weekly Savings Alert Worker
 * 
 * Runs every Monday at 9 AM to send users a summary of:
 * - EMTL charges detected
 * - Bank charges categorized
 * - VAT savings from Input VAT credits
 * - Potential tax savings opportunities
 */
export class WeeklySavingsAlertWorker {

    private worker: Worker;

    constructor() {
        this.worker = new Worker(
            'savings-alerts',
            async (job) => {
                console.log(`[Savings Alert] Processing job ${job.id}`);
                await this.processSavingsAlert(job.data);
            },
            { connection }
        );

        this.worker.on('completed', (job) => {
            console.log(`[Savings Alert] Job ${job.id} completed`);
        });

        this.worker.on('failed', (job, err) => {
            console.error(`[Savings Alert] Job ${job?.id} failed:`, err);
        });

        console.log('✅ Weekly Savings Alert Worker started');
    }

    /**
     * Schedule weekly savings alerts for all active users
     */
    async scheduleWeeklyAlerts() {
        console.log('[Savings Alert] Scheduling weekly alerts...');

        // Get all active users with connected bank accounts
        const { data: users, error } = await supabase
            .from('users')
            .select('id, whatsapp_number, business_name')
            .not('whatsapp_number', 'is', null)
            .eq('is_active', true);

        if (error) {
            console.error('[Savings Alert] Error fetching users:', error);
            return;
        }

        if (!users || users.length === 0) {
            console.log('[Savings Alert] No active users found');
            return;
        }

        console.log(`[Savings Alert] Scheduling alerts for ${users.length} users`);

        for (const user of users) {
            await savingsAlertQueue.add(
                'weekly-alert',
                { userId: user.id },
                {
                    // Run every Monday at 9 AM
                    repeat: {
                        pattern: '0 9 * * 1', // Cron: minute hour day month weekday
                        tz: 'Africa/Lagos'
                    }
                }
            );
        }

        console.log(`[Savings Alert] Scheduled ${users.length} weekly alerts`);
    }

    /**
     * Process savings alert for a user
     */
    private async processSavingsAlert(data: { userId: string }) {
        const { userId } = data;

        console.log(`[Savings Alert] Processing alert for user ${userId}`);

        try {
            // Get user info
            const { data: user } = await supabase
                .from('users')
                .select('whatsapp_number, business_name, full_name')
                .eq('id', userId)
                .single();

            if (!user || !user.whatsapp_number) {
                console.log(`[Savings Alert] User ${userId} has no WhatsApp number`);
                return;
            }

            // Get last week's date range
            const today = new Date();
            const lastWeekStart = new Date(today);
            lastWeekStart.setDate(today.getDate() - 7);

            // Get EMTL charges from last week
            const { data: emtlCharges } = await supabase
                .from('emtl_charges')
                .select('*')
                .eq('user_id', userId)
                .gte('detected_at', lastWeekStart.toISOString());

            // Get bank charges from last week
            const { data: bankCharges } = await supabase
                .from('bank_charges')
                .select('*')
                .eq('user_id', userId)
                .gte('detected_at', lastWeekStart.toISOString());

            // Calculate savings
            const totalEMTL = (emtlCharges || []).reduce((sum, c) => sum + parseFloat(c.amount), 0);
            const totalBankCharges = (bankCharges || []).reduce((sum, c) => sum + parseFloat(c.amount), 0);
            const totalVAT = (bankCharges || []).reduce((sum, c) => sum + parseFloat(c.vat_amount), 0);

            // Get illegal EMTL charges (potential refund)
            const illegalEMTL = (emtlCharges || []).filter(c => c.status === 'exempt_illegal');
            const potentialRefund = illegalEMTL.reduce((sum, c) => sum + parseFloat(c.amount), 0);

            // Skip if no charges detected
            if (totalEMTL === 0 && totalBankCharges === 0) {
                console.log(`[Savings Alert] No charges detected for user ${userId}`);
                return;
            }

            // Generate message
            const message = this.generateWeeklySummary({
                userName: user.full_name || user.business_name || 'there',
                totalEMTL,
                totalBankCharges,
                totalVAT,
                potentialRefund,
                emtlCount: (emtlCharges || []).length,
                bankChargesCount: (bankCharges || []).length,
                illegalCount: illegalEMTL.length
            });

            // Send WhatsApp message
            await whatsappService.sendMessage(user.whatsapp_number, message);

            console.log(`[Savings Alert] Sent weekly summary to user ${userId}`);

            // Track analytics
            await supabase.from('analytics_events').insert({
                user_id: userId,
                event_type: 'weekly_savings_alert_sent',
                metadata: {
                    totalEMTL,
                    totalBankCharges,
                    totalVAT,
                    potentialRefund
                }
            });

        } catch (error) {
            console.error(`[Savings Alert] Error processing alert for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Generate weekly summary message
     */
    private generateWeeklySummary(data: {
        userName: string;
        totalEMTL: number;
        totalBankCharges: number;
        totalVAT: number;
        potentialRefund: number;
        emtlCount: number;
        bankChargesCount: number;
        illegalCount: number;
    }): string {
        const {
            userName,
            totalEMTL,
            totalBankCharges,
            totalVAT,
            potentialRefund,
            emtlCount,
            bankChargesCount,
            illegalCount
        } = data;

        let message = `📊 *Weekly Tax Savings Summary*\n\n`;
        message += `Hi ${userName}! Here's what I found this week:\n\n`;

        // EMTL charges
        if (emtlCount > 0) {
            message += `💳 *EMTL Charges*\n`;
            message += `${emtlCount} transfer${emtlCount > 1 ? 's' : ''} × ₦50 = ₦${totalEMTL.toFixed(2)}\n`;
            message += `✅ Deductible as business expense\n\n`;
        }

        // Bank charges
        if (bankChargesCount > 0) {
            message += `🏦 *Bank Charges*\n`;
            message += `${bankChargesCount} charge${bankChargesCount > 1 ? 's' : ''} = ₦${totalBankCharges.toFixed(2)}\n`;
            message += `✅ Input VAT credit: ₦${totalVAT.toFixed(2)}\n\n`;
        }

        // Illegal charges (potential refund)
        if (illegalCount > 0 && potentialRefund > 0) {
            message += `⚠️ *Illegal Charges Detected*\n`;
            message += `${illegalCount} charge${illegalCount > 1 ? 's' : ''} = ₦${potentialRefund.toFixed(2)}\n`;
            message += `💡 You can request a refund from your bank!\n\n`;
        }

        // Total savings
        const totalSavings = totalVAT + (totalEMTL + totalBankCharges) * 0.24; // 24% CIT rate

        message += `💰 *Your Tax Savings*\n`;
        message += `• VAT credit: ₦${totalVAT.toFixed(2)}\n`;
        message += `• CIT deduction (24%): ₦${((totalEMTL + totalBankCharges) * 0.24).toFixed(2)}\n`;
        message += `• *Total saved*: ₦${totalSavings.toFixed(2)}\n\n`;

        if (potentialRefund > 0) {
            message += `🎯 *Action Required*\n`;
            message += `Contact your bank to request ₦${potentialRefund.toFixed(2)} refund.\n`;
            message += `Reference: Section 185, Tax Act 2025\n\n`;
        }

        message += `📈 Keep uploading receipts to maximize your savings!\n\n`;
        message += `Reply "charges" to see detailed breakdown.`;

        return message;
    }

    /**
     * Stop the worker
     */
    async stop() {
        await this.worker.close();
        console.log('✅ Weekly Savings Alert Worker stopped');
    }
}

// Export singleton instance
export const weeklySavingsAlertWorker = new WeeklySavingsAlertWorker();

// Schedule weekly alerts on startup
weeklySavingsAlertWorker.scheduleWeeklyAlerts().catch(console.error);
