import { supabase } from '../config/database';

export class AnalyticsService {
    /**
     * Track a user event
     */
    async trackEvent(userId: string, eventType: string, eventData?: any) {
        try {
            await supabase.from('user_events').insert({
                user_id: userId,
                event_type: eventType,
                event_data: eventData || {}
            });
        } catch (error) {
            console.error('Error tracking event:', error);
            // Don't throw - analytics shouldn't break the main flow
        }
    }

    /**
     * Get engagement metrics (DAU, WAU, MAU)
     */
    async getEngagementMetrics(period: 'daily' | 'weekly' | 'monthly' = 'daily') {
        const now = new Date();
        let startDate = new Date();

        switch (period) {
            case 'daily':
                startDate.setDate(now.getDate() - 1);
                break;
            case 'weekly':
                startDate.setDate(now.getDate() - 7);
                break;
            case 'monthly':
                startDate.setDate(now.getDate() - 30);
                break;
        }

        const { data, error } = await supabase
            .from('user_events')
            .select('user_id')
            .gte('created_at', startDate.toISOString());

        if (error) throw error;

        const uniqueUsers = new Set(data.map(e => e.user_id));
        return {
            period,
            activeUsers: uniqueUsers.size,
            startDate: startDate.toISOString(),
            endDate: now.toISOString()
        };
    }

    /**
     * Get feature usage statistics
     */
    async getFeatureUsage(days: number = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data, error } = await supabase
            .from('user_events')
            .select('event_type')
            .gte('created_at', startDate.toISOString());

        if (error) throw error;

        const usage: Record<string, number> = {};
        data.forEach(event => {
            usage[event.event_type] = (usage[event.event_type] || 0) + 1;
        });

        return Object.entries(usage)
            .map(([feature, count]) => ({ feature, count }))
            .sort((a, b) => b.count - a.count);
    }

    /**
     * Get cohort retention (users by signup month)
     */
    async getCohortRetention(cohortMonth: string) {
        // Get users who signed up in the cohort month
        const { data: cohortUsers, error: cohortError } = await supabase
            .from('users')
            .select('id, created_at')
            .gte('created_at', `${cohortMonth}-01`)
            .lt('created_at', this.getNextMonth(cohortMonth));

        if (cohortError) throw cohortError;

        if (!cohortUsers || cohortUsers.length === 0) {
            return { cohortMonth, totalUsers: 0, retention: [] };
        }

        const cohortUserIds = cohortUsers.map(u => u.id);

        // Check activity in subsequent months
        const retention = [];
        for (let i = 0; i < 6; i++) {
            const monthStart = this.addMonths(cohortMonth, i);
            const monthEnd = this.getNextMonth(monthStart);

            const { data: activeUsers } = await supabase
                .from('user_events')
                .select('user_id')
                .in('user_id', cohortUserIds)
                .gte('created_at', `${monthStart}-01`)
                .lt('created_at', `${monthEnd}-01`);

            const uniqueActive = new Set(activeUsers?.map(e => e.user_id) || []);
            retention.push({
                month: i,
                activeUsers: uniqueActive.size,
                retentionRate: (uniqueActive.size / cohortUsers.length) * 100
            });
        }

        return {
            cohortMonth,
            totalUsers: cohortUsers.length,
            retention
        };
    }

    /**
     * Identify at-risk users (no activity in 30 days)
     */
    async identifyAtRiskUsers() {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Get all active users
        const { data: allUsers } = await supabase
            .from('users')
            .select('id, business_name, whatsapp_number, created_at')
            .eq('subscription_status', 'active');

        if (!allUsers) return [];

        // Get users with recent activity
        const { data: recentActivity } = await supabase
            .from('user_events')
            .select('user_id')
            .gte('created_at', thirtyDaysAgo.toISOString());

        const activeUserIds = new Set(recentActivity?.map(e => e.user_id) || []);

        // Filter to users without recent activity
        const atRiskUsers = allUsers.filter(user => !activeUserIds.has(user.id));

        return atRiskUsers.map(user => ({
            id: user.id,
            businessName: user.business_name,
            whatsappNumber: user.whatsapp_number,
            daysSinceSignup: Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24))
        }));
    }

    /**
     * Save aggregated metric
     */
    async saveMetric(metricName: string, value: number, period: 'daily' | 'weekly' | 'monthly', periodDate: Date, metadata?: any) {
        await supabase.from('analytics_summary').insert({
            metric_name: metricName,
            metric_value: value,
            period,
            period_date: periodDate.toISOString().split('T')[0],
            metadata
        });
    }

    // Helper functions
    private getNextMonth(month: string): string {
        const date = new Date(`${month}-01`);
        date.setMonth(date.getMonth() + 1);
        return date.toISOString().slice(0, 7);
    }

    private addMonths(month: string, count: number): string {
        const date = new Date(`${month}-01`);
        date.setMonth(date.getMonth() + count);
        return date.toISOString().slice(0, 7);
    }
}

export const analyticsService = new AnalyticsService();
