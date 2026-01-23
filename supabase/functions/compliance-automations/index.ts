/**
 * Compliance Automations - V12
 * 
 * Handles scheduled personalized notifications:
 * - Morning Briefing (daily 8am): Today's deadlines, pending tasks
 * - Weekly Summary (Monday 9am): Last week's activity, upcoming month
 * - Quarterly Review (quarterly): Tax optimization suggestions
 * 
 * Triggered via pg_cron or external scheduler with ?type=morning_briefing
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type AutomationType = 'morning_briefing' | 'weekly_summary' | 'quarterly_review';

// ============= Content Generators =============

async function generateMorningBriefing(supabase: any, userId: string): Promise<{ title: string; message: string } | null> {
    const today = new Date();
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + 7);

    // Get upcoming deadlines this week
    const { data: deadlines } = await supabase
        .from('tax_deadlines')
        .select('title, day_of_month, month_of_year, specific_date')
        .eq('is_active', true)
        .limit(5);

    // Get unreviewed expenses count (transactions without receipts)
    const { count: unreviewedCount } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('receipt_url', null)
        .gte('created_at', new Date(today.getFullYear(), today.getMonth(), 1).toISOString());

    // Get recent compliance updates (last 24 hours)
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const { count: newRulesCount } = await supabase
        .from('compliance_rules')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', yesterday.toISOString())
        .eq('is_active', true);

    // Filter deadlines for this week
    const upcomingDeadlines = (deadlines || []).filter((d: any) => {
        if (d.specific_date) {
            const dDate = new Date(d.specific_date);
            return dDate >= today && dDate <= endOfWeek;
        }
        // Check monthly deadlines
        const checkDate = new Date(today.getFullYear(), today.getMonth(), d.day_of_month);
        return checkDate >= today && checkDate <= endOfWeek;
    });

    // Only send if there's something to report
    if (upcomingDeadlines.length === 0 && (unreviewedCount || 0) < 5 && (newRulesCount || 0) === 0) {
        return null; // Skip notification if nothing notable
    }

    const parts: string[] = [];

    if (upcomingDeadlines.length > 0) {
        parts.push(`📅 ${upcomingDeadlines.length} deadline(s) this week`);
        upcomingDeadlines.slice(0, 3).forEach((d: any) => {
            parts.push(`  • ${d.title}`);
        });
    }

    if ((unreviewedCount || 0) >= 5) {
        parts.push(`📎 ${unreviewedCount} transactions need receipts`);
    }

    if ((newRulesCount || 0) > 0) {
        parts.push(`📢 ${newRulesCount} new compliance update(s) yesterday`);
    }

    return {
        title: `☀️ Good Morning! Your Tax Briefing`,
        message: parts.join('\n'),
    };
}

async function generateWeeklySummary(supabase: any, userId: string): Promise<{ title: string; message: string } | null> {
    const today = new Date();
    const lastWeekStart = new Date(today);
    lastWeekStart.setDate(today.getDate() - 7);

    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // Get last week's transactions summary
    const { data: transactions } = await supabase
        .from('transactions')
        .select('amount, transaction_type')
        .eq('user_id', userId)
        .gte('created_at', lastWeekStart.toISOString())
        .lte('created_at', today.toISOString());

    const income = (transactions || [])
        .filter((t: any) => t.transaction_type === 'income')
        .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

    const expenses = (transactions || [])
        .filter((t: any) => t.transaction_type === 'expense')
        .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

    // Get upcoming month deadlines
    const { data: monthDeadlines } = await supabase
        .from('tax_deadlines')
        .select('title, day_of_month')
        .eq('is_active', true)
        .lte('day_of_month', endOfMonth.getDate());

    // Only send if there's activity
    if (income === 0 && expenses === 0 && (monthDeadlines || []).length === 0) {
        return null;
    }

    const parts: string[] = [];

    parts.push(`📊 **Last Week's Activity**`);
    parts.push(`  • Income: ₦${income.toLocaleString()}`);
    parts.push(`  • Expenses: ₦${expenses.toLocaleString()}`);
    parts.push(`  • Net: ₦${(income - expenses).toLocaleString()}`);

    if ((monthDeadlines || []).length > 0) {
        parts.push('');
        parts.push(`📅 **This Month's Deadlines**`);
        (monthDeadlines || []).slice(0, 4).forEach((d: any) => {
            parts.push(`  • ${d.title} (${d.day_of_month}th)`);
        });
    }

    // Estimate VAT if registered
    const vatEstimate = income * 0.075;
    if (income > 0) {
        parts.push('');
        parts.push(`💰 Est. VAT liability: ₦${vatEstimate.toLocaleString()}`);
    }

    return {
        title: `📈 Your Weekly Tax Summary`,
        message: parts.join('\n'),
    };
}

async function generateQuarterlyReview(supabase: any, userId: string): Promise<{ title: string; message: string } | null> {
    const today = new Date();
    const currentQuarter = Math.floor(today.getMonth() / 3) + 1;
    const quarterStart = new Date(today.getFullYear(), (currentQuarter - 1) * 3, 1);

    // Get quarter's transactions
    const { data: transactions } = await supabase
        .from('transactions')
        .select('amount, transaction_type, category')
        .eq('user_id', userId)
        .gte('created_at', quarterStart.toISOString());

    const income = (transactions || [])
        .filter((t: any) => t.transaction_type === 'income')
        .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

    const expenses = (transactions || [])
        .filter((t: any) => t.transaction_type === 'expense')
        .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

    // Get user's preferences for personalized tips
    const { data: prefs } = await supabase
        .from('user_preferences')
        .select('entity_type, annual_income')
        .eq('user_id', userId)
        .single();

    const parts: string[] = [];

    parts.push(`📊 **Q${currentQuarter} Summary**`);
    parts.push(`  • Total Income: ₦${income.toLocaleString()}`);
    parts.push(`  • Total Expenses: ₦${expenses.toLocaleString()}`);
    parts.push(`  • Taxable Amount: ₦${(income - expenses).toLocaleString()}`);

    parts.push('');
    parts.push(`💡 **Optimization Tips**`);

    // Dynamic tips based on profile
    if (prefs?.entity_type === 'self_employed') {
        parts.push(`  • Track home office expenses for deduction`);
        parts.push(`  • Consider pension contributions (up to ₦16M exempt)`);
    } else if (prefs?.entity_type === 'company') {
        parts.push(`  • Review asset depreciation schedules`);
        parts.push(`  • Check CIT quarterly payment status`);
    } else {
        parts.push(`  • Ensure all receipts are uploaded for deductions`);
        parts.push(`  • Review employee benefits for tax efficiency`);
    }

    const annualProjection = income * 4;
    parts.push('');
    parts.push(`📈 Annual projection: ₦${annualProjection.toLocaleString()}`);

    return {
        title: `🏆 Q${currentQuarter} ${today.getFullYear()} Tax Review`,
        message: parts.join('\n'),
    };
}

// ============= Main Handler =============

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Get automation type from query or body
        const url = new URL(req.url);
        let automationType: AutomationType = 'morning_briefing';

        if (req.method === 'POST') {
            const body = await req.json().catch(() => ({}));
            automationType = body.type || 'morning_briefing';
        } else {
            automationType = (url.searchParams.get('type') as AutomationType) || 'morning_briefing';
        }

        console.log(`[compliance-automations] Running ${automationType}`);

        // Get all users who want this type of notification
        const { data: users, error: usersError } = await supabase
            .from('user_compliance_preferences')
            .select('user_id')
            .eq('in_app_notifications', true);

        if (usersError) {
            console.error('[compliance-automations] Error fetching users:', usersError);
            return jsonResponse({ success: false, error: usersError.message }, 500);
        }

        if (!users || users.length === 0) {
            return jsonResponse({ success: true, message: 'No users with notifications enabled', sent: 0 });
        }

        let sent = 0;
        let skipped = 0;

        for (const { user_id } of users) {
            let content: { title: string; message: string } | null = null;

            switch (automationType) {
                case 'morning_briefing':
                    content = await generateMorningBriefing(supabase, user_id);
                    break;
                case 'weekly_summary':
                    content = await generateWeeklySummary(supabase, user_id);
                    break;
                case 'quarterly_review':
                    content = await generateQuarterlyReview(supabase, user_id);
                    break;
            }

            if (!content) {
                skipped++;
                continue;
            }

            // Create notification
            const { error: insertError } = await supabase
                .from('compliance_notifications')
                .insert({
                    user_id,
                    notification_type: automationType,
                    title: content.title,
                    message: content.message,
                    severity: automationType === 'quarterly_review' ? 'medium' : 'info',
                    metadata: { automation: true, type: automationType },
                });

            if (insertError) {
                console.error(`[compliance-automations] Error creating notification for ${user_id}:`, insertError);
                continue;
            }

            sent++;
        }

        // Record in notification history
        await supabase.from('notification_history').insert({
            notification_key: `${automationType}_${new Date().toISOString().split('T')[0]}`,
            notification_type: automationType,
            recipients_count: sent,
            metadata: { skipped, total_users: users.length },
        });

        console.log(`[compliance-automations] ${automationType}: sent=${sent}, skipped=${skipped}`);

        return jsonResponse({
            success: true,
            type: automationType,
            sent,
            skipped,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[compliance-automations] Error:', error);
        return jsonResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, 500);
    }
});
