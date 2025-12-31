/**
 * Monthly Insights Worker
 * Phase 5 Week 3: Automated Learning Pipeline
 * 
 * Generates proactive insights for all users monthly
 * Sends WhatsApp notifications for high-priority insights
 */

import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../config/redis';
import { insightsGeneratorService } from '../services/insights-generator.service';
import { supabase } from '../config/database';
import { whatsappService } from '../services/whatsapp.service';

export const monthlyInsightsQueue = new Queue('monthly-insights', { connection: redisConnection });

export class MonthlyInsightsWorker {
    /**
     * Generate insights for all users
     */
    async generateForAllUsers(): Promise<{
        totalUsers: number;
        insightsGenerated: number;
        notificationsSent: number;
    }> {
        console.log('💡 Starting monthly insights generation...');

        const stats = {
            totalUsers: 0,
            insightsGenerated: 0,
            notificationsSent: 0
        };

        try {
            // Get all active users
            const { data: users } = await supabase
                .from('users')
                .select('id, whatsapp_number, business_name')
                .not('whatsapp_number', 'is', null);

            if (!users || users.length === 0) {
                console.log('⏸️ No users found');
                return stats;
            }

            stats.totalUsers = users.length;
            console.log(`📊 Processing ${users.length} users...`);

            // Process each user
            for (const user of users) {
                try {
                    // Get user's primary business
                    const { data: business } = await supabase
                        .from('businesses')
                        .select('id')
                        .eq('user_id', user.id)
                        .eq('is_primary', true)
                        .maybeSingle();

                    // Generate insights
                    const insights = await insightsGeneratorService.generateMonthlyInsights(
                        user.id,
                        business?.id
                    );

                    if (insights.length === 0) {
                        console.log(`✓ User ${user.id}: No insights`);
                        continue;
                    }

                    // Save insights
                    await insightsGeneratorService.saveInsights(user.id, insights);
                    stats.insightsGenerated += insights.length;

                    console.log(`✓ User ${user.id}: ${insights.length} insights generated`);

                    // Send WhatsApp notification for high-priority insights
                    const highPriorityInsights = insights.filter(i => i.priority === 'high');

                    if (highPriorityInsights.length > 0 && user.whatsapp_number) {
                        await this.sendInsightsNotification(
                            user.whatsapp_number,
                            user.business_name || 'there',
                            highPriorityInsights
                        );
                        stats.notificationsSent++;
                    }

                } catch (error) {
                    console.error(`Error processing user ${user.id}:`, error);
                }
            }

            console.log(`✅ Insights generation complete:`, stats);
            return stats;

        } catch (error) {
            console.error('❌ Monthly insights generation failed:', error);
            throw error;
        }
    }

    /**
     * Send WhatsApp notification with insights
     */
    private async sendInsightsNotification(
        whatsappNumber: string,
        businessName: string,
        insights: any[]
    ): Promise<void> {
        try {
            let message = `💡 *Tax Insights for ${businessName}*\n\n`;
            message += `We found ${insights.length} important ${insights.length === 1 ? 'opportunity' : 'opportunities'} for you:\n\n`;

            insights.slice(0, 3).forEach((insight, index) => {
                message += `*${index + 1}. ${insight.title}*\n`;
                message += `${insight.description}\n`;

                if (insight.potentialSaving) {
                    message += `💰 Potential saving: ₦${insight.potentialSaving.toLocaleString()}\n`;
                }

                message += `✅ ${insight.action}\n\n`;
            });

            if (insights.length > 3) {
                message += `_+ ${insights.length - 3} more insights available_\n\n`;
            }

            message += `Reply "insights" to see all details.`;

            await whatsappService.sendMessage(whatsappNumber, message);

        } catch (error) {
            console.error('Error sending insights notification:', error);
            // Don't throw - notification failure shouldn't break insights generation
        }
    }

    /**
     * Generate insights for single user (on-demand)
     */
    async generateForUser(userId: string): Promise<any[]> {
        const { data: business } = await supabase
            .from('businesses')
            .select('id')
            .eq('user_id', userId)
            .eq('is_primary', true)
            .maybeSingle();

        const insights = await insightsGeneratorService.generateMonthlyInsights(
            userId,
            business?.id
        );

        if (insights.length > 0) {
            await insightsGeneratorService.saveInsights(userId, insights);
        }

        return insights;
    }
}

// Create worker instance
const worker = new Worker('monthly-insights', async (job) => {
    const insightsWorker = new MonthlyInsightsWorker();

    if (job.name === 'generate-all') {
        return await insightsWorker.generateForAllUsers();
    }

    if (job.name === 'generate-user' && job.data.userId) {
        return await insightsWorker.generateForUser(job.data.userId);
    }

    throw new Error(`Unknown job: ${job.name}`);
}, { connection: redisConnection });

/**
 * Schedule monthly insights generation
 */
export async function scheduleMonthlyInsights() {
    console.log('⏰ Scheduling monthly insights generation...');

    // Run on the 1st of each month at 6 AM
    await monthlyInsightsQueue.add('generate-all', {}, {
        repeat: { pattern: '0 6 1 * *' }, // Cron: 6 AM on 1st of month
        jobId: 'monthly-insights-generation'
    });

    console.log('✅ Monthly insights scheduled for 1st of each month at 6 AM');
}

export const monthlyInsightsWorker = worker;
