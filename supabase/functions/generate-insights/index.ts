import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// INSIGHT TYPES
// ============================================

interface Insight {
    id?: string;
    type: 'tax_saving' | 'threshold_warning' | 'vat_refund' | 'deadline' | 'compliance';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    action: string;
    potentialSaving?: number;
    deadline?: string;
    metadata?: Record<string, unknown>;
}

// ============================================
// TAX ACT 2025 THRESHOLDS
// ============================================

const THRESHOLDS = {
    VAT_REGISTRATION: 25_000_000,      // ₦25M turnover = mandatory VAT registration
    SMALL_COMPANY_TURNOVER: 50_000_000, // ₦50M = small company status
    SMALL_COMPANY_ASSETS: 250_000_000,  // ₦250M assets limit
};

const TAX_DEADLINES = [
    { name: 'VAT Monthly Return', day: 21, period: 'monthly' },
    { name: 'PAYE Remittance', day: 10, period: 'monthly' },
    { name: 'Annual Returns Filing', month: 6, day: 30, period: 'yearly' },
    { name: 'CIT Payment', month: 6, day: 30, period: 'yearly' },
];

// ============================================
// INSIGHT GENERATORS
// ============================================

async function findUnclaimedDeductions(
    supabase: ReturnType<typeof createClient>,
    userId: string,
    month: string
): Promise<Insight | null> {
    // Get transactions classified as deductible but not yet claimed
    const { data: transactions } = await supabase
        .from('transactions')
        .select('id, amount, category, classification')
        .eq('user_id', userId)
        .gte('date', `${month}-01`)
        .lt('date', getNextMonth(month))
        .eq('classification', 'expense')
        .is('deduction_claimed', null);

    if (!transactions || transactions.length === 0) return null;

    const totalUnclaimed = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    const estimatedSaving = totalUnclaimed * 0.30; // 30% CIT rate

    if (estimatedSaving < 5000) return null; // Threshold for showing insight

    return {
        type: 'tax_saving',
        priority: estimatedSaving > 50000 ? 'high' : 'medium',
        title: 'Unclaimed Tax Deductions Found',
        description: `You have ${transactions.length} expense transactions totaling ₦${formatCurrency(totalUnclaimed)} that haven't been claimed as deductions.`,
        action: 'Review and mark these transactions as claimed deductions to reduce your tax liability.',
        potentialSaving: estimatedSaving,
    };
}

async function checkSmallCompanyThreshold(
    supabase: ReturnType<typeof createClient>,
    businessId: string
): Promise<Insight | null> {
    const { data: business } = await supabase
        .from('businesses')
        .select('name, annual_turnover, total_fixed_assets, classification')
        .eq('id', businessId)
        .single();

    if (!business) return null;

    const turnover = business.annual_turnover || 0;
    const assets = business.total_fixed_assets || 0;

    // Check if approaching threshold (within 80%)
    const turnoverPct = turnover / THRESHOLDS.SMALL_COMPANY_TURNOVER;
    const assetsPct = assets / THRESHOLDS.SMALL_COMPANY_ASSETS;

    if (turnoverPct >= 0.80 && turnoverPct < 1.0) {
        const remaining = THRESHOLDS.SMALL_COMPANY_TURNOVER - turnover;
        return {
            type: 'threshold_warning',
            priority: turnoverPct >= 0.95 ? 'high' : 'medium',
            title: 'Approaching Small Company Limit',
            description: `${business.name} is at ${(turnoverPct * 100).toFixed(0)}% of the ₦50M turnover threshold. Only ₦${formatCurrency(remaining)} remaining before losing 0% tax rate.`,
            action: 'Consider deferring non-essential revenue to maintain Small Company status.',
            potentialSaving: turnover * 0.30, // Would pay 30% if exceeded
        };
    }

    return null;
}

async function checkVATRefundEligibility(
    supabase: ReturnType<typeof createClient>,
    userId: string,
    month: string
): Promise<Insight | null> {
    // Get VAT summary for the month
    const { data: transactions } = await supabase
        .from('transactions')
        .select('amount, classification, tax_implications')
        .eq('user_id', userId)
        .gte('date', `${month}-01`)
        .lt('date', getNextMonth(month));

    if (!transactions || transactions.length === 0) return null;

    let outputVAT = 0; // VAT collected from sales
    let inputVAT = 0;  // VAT paid on purchases

    for (const txn of transactions) {
        const vatApplicable = txn.tax_implications?.vatApplicable ?? false;
        const amount = txn.amount || 0;

        if (txn.classification === 'income' && vatApplicable) {
            outputVAT += amount * 0.075; // 7.5% VAT
        } else if (txn.classification === 'expense' && vatApplicable) {
            inputVAT += amount * 0.075;
        }
    }

    const netVAT = outputVAT - inputVAT;

    if (netVAT < 0) {
        const refundAmount = Math.abs(netVAT);
        return {
            type: 'vat_refund',
            priority: refundAmount > 100000 ? 'high' : 'medium',
            title: 'VAT Refund Available',
            description: `You've paid more input VAT (₦${formatCurrency(inputVAT)}) than you collected (₦${formatCurrency(outputVAT)}).`,
            action: 'File a VAT refund claim with FIRS to recover the excess.',
            potentialSaving: refundAmount,
        };
    }

    return null;
}

function getUpcomingDeadlines(): Insight[] {
    const insights: Insight[] = [];
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentDay = today.getDate();

    for (const deadline of TAX_DEADLINES) {
        if (deadline.period === 'monthly') {
            const daysUntil = deadline.day - currentDay;
            if (daysUntil > 0 && daysUntil <= 7) {
                insights.push({
                    type: 'deadline',
                    priority: daysUntil <= 3 ? 'high' : 'medium',
                    title: `${deadline.name} Due Soon`,
                    description: `${deadline.name} is due in ${daysUntil} days (${deadline.day}th of this month).`,
                    action: 'Ensure all required filings and payments are submitted on time.',
                    deadline: new Date(today.getFullYear(), currentMonth, deadline.day).toISOString(),
                });
            }
        }
    }

    return insights;
}

async function checkComplianceStatus(
    supabase: ReturnType<typeof createClient>,
    userId: string
): Promise<Insight | null> {
    const { data: user } = await supabase
        .from('users')
        .select('nin_verified, bvn_verified, kyc_level, tax_category')
        .eq('id', userId)
        .single();

    if (!user) return null;

    // Check if KYC incomplete
    if (!user.nin_verified && !user.bvn_verified) {
        return {
            type: 'compliance',
            priority: 'medium',
            title: 'Complete Your KYC',
            description: 'Your identity has not been verified. Complete KYC to unlock full features.',
            action: 'Add your NIN or BVN to verify your identity.',
        };
    }

    return null;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(amount);
}

function getNextMonth(month: string): string {
    const date = new Date(`${month}-01`);
    date.setMonth(date.getMonth() + 1);
    return date.toISOString().slice(0, 7);
}

function getCurrentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

// ============================================
// MAIN HANDLER
// ============================================

interface GenerateInsightsRequest {
    userId: string;
    businessId?: string;
    month?: string;
    saveInsights?: boolean;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const body: GenerateInsightsRequest = await req.json();
        const { userId, businessId, month, saveInsights } = body;

        if (!userId) {
            return new Response(
                JSON.stringify({ success: false, error: 'userId is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const targetMonth = month || getCurrentMonth();
        console.log('[generate-insights] Processing for user:', userId, 'month:', targetMonth);

        const insights: Insight[] = [];

        // Check for unclaimed deductions
        const deductionInsight = await findUnclaimedDeductions(supabase, userId, targetMonth);
        if (deductionInsight) insights.push(deductionInsight);

        // Check small company threshold
        if (businessId) {
            const thresholdInsight = await checkSmallCompanyThreshold(supabase, businessId);
            if (thresholdInsight) insights.push(thresholdInsight);
        }

        // Check VAT refund eligibility
        const vatInsight = await checkVATRefundEligibility(supabase, userId, targetMonth);
        if (vatInsight) insights.push(vatInsight);

        // Get upcoming deadlines
        const deadlineInsights = getUpcomingDeadlines();
        insights.push(...deadlineInsights);

        // Check compliance status
        const complianceInsight = await checkComplianceStatus(supabase, userId);
        if (complianceInsight) insights.push(complianceInsight);

        // Sort by priority
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

        // Calculate total potential savings
        const totalSavings = insights.reduce((sum, i) => sum + (i.potentialSaving || 0), 0);

        // Optionally save insights
        if (saveInsights && insights.length > 0) {
            const insightsToSave = insights.map(insight => ({
                user_id: userId,
                type: insight.type,
                priority: insight.priority,
                title: insight.title,
                description: insight.description,
                action: insight.action,
                potential_saving: insight.potentialSaving,
                deadline: insight.deadline,
                month: targetMonth,
                is_read: false,
                created_at: new Date().toISOString(),
            }));

            await supabase.from('user_insights').insert(insightsToSave);
            console.log('[generate-insights] Saved', insightsToSave.length, 'insights');
        }

        console.log('[generate-insights] Generated', insights.length, 'insights, total potential savings:', totalSavings);

        return new Response(
            JSON.stringify({
                success: true,
                month: targetMonth,
                insights,
                summary: {
                    total: insights.length,
                    highPriority: insights.filter(i => i.priority === 'high').length,
                    potentialSavings: totalSavings,
                },
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[generate-insights] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
