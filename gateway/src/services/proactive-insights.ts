/**
 * Proactive Insights Service
 * Generates personalized suggestions based on user context
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

export interface ProactiveInsight {
    type: 'deadline' | 'tip' | 'alert' | 'opportunity';
    title: string;
    message: string;
    priority: 'high' | 'medium' | 'low';
    actionLabel?: string;
    actionCommand?: string;
}

let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
    if (supabaseClient) return supabaseClient;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) return null;

    supabaseClient = createClient(supabaseUrl, supabaseKey);
    return supabaseClient;
}

/**
 * Get proactive insights for a user
 */
export async function getProactiveInsights(userId: string): Promise<ProactiveInsight[]> {
    const insights: ProactiveInsight[] = [];

    try {
        const supabase = getSupabaseClient();
        if (!supabase) return [];

        // Get user profile
        const { data: user } = await supabase
            .from('users')
            .select('entity_type, created_at')
            .eq('id', userId)
            .single();

        const { data: taxProfile } = await supabase
            .from('user_tax_profiles')
            .select('*')
            .eq('user_id', userId)
            .single();

        const now = new Date();
        const month = now.getMonth() + 1;
        const day = now.getDate();

        // Deadline-based insights
        if (month === 1 && day <= 21) {
            insights.push({
                type: 'deadline',
                title: 'VAT Return Due',
                message: 'January VAT returns are due by Jan 21st. Have you filed?',
                priority: day >= 15 ? 'high' : 'medium',
                actionLabel: 'Calculate VAT',
                actionCommand: 'vat help'
            });
        }

        if (month === 3 && day <= 31) {
            insights.push({
                type: 'deadline',
                title: 'Annual Tax Filing',
                message: 'Personal income tax returns are due by March 31st.',
                priority: day >= 20 ? 'high' : 'medium',
                actionLabel: 'Check My Tax',
                actionCommand: 'tax help'
            });
        }

        // Entity-specific tips
        if (user?.entity_type === 'self_employed') {
            insights.push({
                type: 'tip',
                title: 'Freelancer Tip',
                message: 'Track your business expenses - they reduce your taxable income!',
                priority: 'low',
                actionLabel: 'Learn More',
                actionCommand: 'freelance tax help'
            });
        }

        if (user?.entity_type === 'company') {
            insights.push({
                type: 'tip',
                title: 'Corporate Tax Reminder',
                message: 'Companies with turnover ≤₦50M pay 0% CIT. Small company status saves taxes!',
                priority: 'medium',
                actionLabel: 'Calculate CIT',
                actionCommand: 'corporate tax help'
            });
        }

        // New user onboarding nudge
        if (user?.created_at) {
            const createdDate = new Date(user.created_at);
            const daysSinceJoined = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));

            if (daysSinceJoined < 7 && !taxProfile) {
                insights.push({
                    type: 'opportunity',
                    title: 'Complete Your Profile',
                    message: 'Tell me about yourself so I can give you personalized tax advice!',
                    priority: 'high',
                    actionLabel: 'Get Started',
                    actionCommand: 'start'
                });
            }
        }

        // Withholding tax alert for businesses
        if (user?.entity_type === 'company' || user?.entity_type === 'self_employed') {
            if (day >= 10 && day <= 14) {
                insights.push({
                    type: 'alert',
                    title: 'WHT Remittance Due',
                    message: 'Withholding tax must be remitted by the 14th of each month.',
                    priority: 'high',
                    actionLabel: 'Calculate WHT',
                    actionCommand: 'wht help'
                });
            }
        }

        logger.info(`[Proactive] Generated ${insights.length} insights for user ${userId}`);
        return insights.sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });

    } catch (error) {
        logger.error('[Proactive] Error generating insights:', error);
        return [];
    }
}

/**
 * Format insights for chat display
 */
export function formatInsightsForChat(insights: ProactiveInsight[]): string {
    if (insights.length === 0) return '';

    const icons = {
        deadline: '⏰',
        tip: '💡',
        alert: '⚠️',
        opportunity: '🎯'
    };

    let text = '📊 *Quick Updates for You:*\n\n';

    insights.slice(0, 3).forEach(insight => {
        const icon = icons[insight.type];
        text += `${icon} *${insight.title}*\n${insight.message}\n\n`;
    });

    return text;
}
