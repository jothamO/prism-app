/**
 * Context Builder - V22 (Refactored from prompt-generator.ts)
 * 
 * Centralized context fetching for PRISM AI.
 * Uses parallel fetching and caching for optimal performance.
 * 
 * Layers:
 * - V20: Calendar (tax_deadlines)
 * - V21: Financial (transactions, invoices)
 * - V22: Core (tax rules, profile, facts)
 * - V24: Projects (budget, status)
 */

import { buildTaxRulesSummary } from "./rules-client.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUser } from "./user-resolver.ts";
import { getCached, CACHE_KEYS } from "./context-cache.ts";

// ============= Types =============

export interface UserProfile {
    entityType?: string;
    employmentStatus?: string;
    isPensioner?: boolean;
    isSeniorCitizen?: boolean;
    isDisabled?: boolean;
    hasDiplomaticExemption?: boolean;
    incomeTypes?: string[];
}

export interface UserContext {
    totalIncome?: number;
    totalExpenses?: number;
    emtlPaid?: number;
    transactionCount?: number;
}

export interface CalendarContext {
    upcomingDeadlines: Array<{
        title: string;
        dueDate: string;
        daysUntil: number;
        urgency: string;
    }>;
}

export interface FullContext {
    taxRules: string;
    profile: UserProfile | null;
    rememberedFacts: string[];
    calendar: CalendarContext;
    financials: UserContext;
    transactionSummary: TransactionSummary | null;
    invoiceSummary: InvoiceSummary | null;
}

export interface TransactionSummary {
    totalIncome: number;
    totalExpenses: number;
    transactionCount: number;
    topExpenseCategory?: string;
    topIncomeCategory?: string;
    emtlTotal: number;
    vatTotal: number;
}

export interface InvoiceSummary {
    totalInvoices: number;
    pendingCount: number;
    paidCount: number;
    overdueCount: number;
    pendingAmount: number;
    overdueAmount: number;
}

export interface ProjectSummary {
    totalProjects: number;
    activeCount: number;
    completedCount: number;
    totalBudget: number;
    totalSpent: number;
    budgetRemaining: number;
    budgetUtilization: number;
    topProjectName?: string;
    topProjectSpent?: number;
    topProjectRemaining?: number;
}

export interface InventorySummary {
    totalItems: number;
    totalValue: number;
    lowStockCount: number;
    totalPurchases30d: number;
    totalSales30d: number;
    cogs30d: number;
}

export interface PayablesSummary {
    totalPayables: number;
    totalAmountDue: number;
    overdueCount: number;
    overdueAmount: number;
    dueWithin7Days: number;
    dueWithin7DaysAmount: number;
}

// ============= Base Prompt =============

const BASE_PROMPT = `You are PRISM, a friendly Nigerian tax assistant. Your role is to help users understand their taxes, transactions, and financial obligations under Nigerian law.

PERSONALITY:
- Friendly, approachable, and conversational
- Use simple language, avoid jargon when possible
- Reference Nigerian context (Naira, FIRS/NRS, local examples)
- Be helpful but always recommend consulting a tax professional for complex matters

KNOWLEDGE AREAS:
1. Nigeria Tax Act 2025 - Personal income tax, corporate tax, VAT, CGT
2. EMTL - Electronic Money Transfer Levy
3. Tax Categories: Employed, Self-employed, Business owner, Freelancer
4. Deductions: Pension, NHF, Life insurance, Rent relief
5. Filing deadlines and compliance requirements

FORMATTING:
- Use emojis sparingly to be friendly 💡📊
- Format currency as ₦X,XXX
- Keep responses concise (2-3 paragraphs max)
- For calculations, show the math briefly
- End with a helpful tip or next action when relevant

LIMITATIONS:
- You cannot access external websites or databases
- For specific account questions, refer to their transaction history
- For complex legal matters, recommend a tax professional`;

// ============= Supabase Client =============

function getSupabaseClient() {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseKey) return null;
    return createClient(supabaseUrl, supabaseKey);
}

// ============= Context Fetchers (V20-V24) =============

/**
 * V22: Fetch tax rules with caching (5-minute TTL)
 */
async function fetchTaxRulesCached(): Promise<string> {
    return getCached(CACHE_KEYS.TAX_RULES, async () => {
        try {
            return await buildTaxRulesSummary();
        } catch (error) {
            console.error("[context-builder] Failed to fetch tax rules:", error);
            return `TAX RULES (fallback):
- Tax bands: ₦0-800k (0%), ₦800k-3M (15%), ₦3M-12M (18%), ₦12M-25M (21%), ₦25M-50M (23%), Above ₦50M (25%)
- VAT: 7.5%
- EMTL: ₦50 per transfer ≥₦10,000`;
        }
    });
}

/**
 * V20: Fetch upcoming deadlines from tax_deadlines
 */
async function fetchCalendarContext(userId?: string): Promise<CalendarContext> {
    const supabase = getSupabaseClient();
    if (!supabase) return { upcomingDeadlines: [] };

    try {
        const { data, error } = await supabase.rpc('get_upcoming_deadlines', {
            p_user_id: userId || null,
            p_days_ahead: 30
        });

        if (error) {
            console.error("[context-builder] Calendar fetch error:", error);
            return { upcomingDeadlines: [] };
        }

        return {
            upcomingDeadlines: (data || []).map((d: any) => ({
                title: d.title,
                dueDate: d.due_date,
                daysUntil: d.days_until,
                urgency: d.urgency
            }))
        };
    } catch (error) {
        console.error("[context-builder] Calendar context error:", error);
        return { upcomingDeadlines: [] };
    }
}

/**
 * V21: Fetch transaction summary for last 30 days
 */
async function fetchTransactionSummary(userId: string): Promise<TransactionSummary | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    try {
        const { data, error } = await supabase.rpc('get_transaction_summary', {
            p_user_id: userId,
            p_days: 30
        });

        if (error || !data || data.length === 0) {
            return null;
        }

        const row = data[0];
        return {
            totalIncome: Number(row.total_income) || 0,
            totalExpenses: Number(row.total_expenses) || 0,
            transactionCount: row.transaction_count || 0,
            topExpenseCategory: row.top_expense_category,
            topIncomeCategory: row.top_income_category,
            emtlTotal: Number(row.emtl_total) || 0,
            vatTotal: Number(row.vat_total) || 0,
        };
    } catch (error) {
        console.error("[context-builder] Transaction summary error:", error);
        return null;
    }
}

/**
 * V21: Fetch invoice status summary
 */
async function fetchInvoiceSummary(userId: string): Promise<InvoiceSummary | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    try {
        const { data, error } = await supabase.rpc('get_invoice_summary', {
            p_user_id: userId
        });

        if (error || !data || data.length === 0) {
            return null;
        }

        const row = data[0];
        return {
            totalInvoices: row.total_invoices || 0,
            pendingCount: row.pending_count || 0,
            paidCount: row.paid_count || 0,
            overdueCount: row.overdue_count || 0,
            pendingAmount: Number(row.pending_amount) || 0,
            overdueAmount: Number(row.overdue_amount) || 0,
        };
    } catch (error) {
        console.error("[context-builder] Invoice summary error:", error);
        return null;
    }
}

/**
 * V24: Fetch project summary
 */
async function fetchProjectSummary(userId: string): Promise<ProjectSummary | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    try {
        const { data, error } = await supabase.rpc('get_project_summary', {
            p_user_id: userId
        });

        if (error || !data || data.length === 0) {
            return null;
        }

        const row = data[0];
        return {
            totalProjects: row.total_projects || 0,
            activeCount: row.active_count || 0,
            completedCount: row.completed_count || 0,
            totalBudget: Number(row.total_budget) || 0,
            totalSpent: Number(row.total_spent) || 0,
            budgetRemaining: Number(row.budget_remaining) || 0,
            budgetUtilization: Number(row.budget_utilization) || 0,
            topProjectName: row.top_project_name,
            topProjectSpent: Number(row.top_project_spent) || 0,
            topProjectRemaining: Number(row.top_project_remaining) || 0,
        };
    } catch (error) {
        console.error("[context-builder] Project summary error:", error);
        return null;
    }
}

/**
 * V26: Fetch inventory summary
 */
async function fetchInventorySummary(userId: string): Promise<InventorySummary | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    try {
        const { data, error } = await supabase.rpc('get_inventory_summary', {
            p_user_id: userId
        });

        if (error || !data || data.length === 0) {
            return null;
        }

        const row = data[0];
        return {
            totalItems: row.total_items || 0,
            totalValue: Number(row.total_value) || 0,
            lowStockCount: row.low_stock_count || 0,
            totalPurchases30d: Number(row.total_purchases_30d) || 0,
            totalSales30d: Number(row.total_sales_30d) || 0,
            cogs30d: Number(row.cogs_30d) || 0,
        };
    } catch (error) {
        console.error("[context-builder] Inventory summary error:", error);
        return null;
    }
}

/**
 * V26: Fetch accounts payable summary
 */
async function fetchPayablesSummary(userId: string): Promise<PayablesSummary | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    try {
        const { data, error } = await supabase.rpc('get_payables_summary', {
            p_user_id: userId
        });

        if (error || !data || data.length === 0) {
            return null;
        }

        const row = data[0];
        return {
            totalPayables: row.total_payables || 0,
            totalAmountDue: Number(row.total_amount_due) || 0,
            overdueCount: row.overdue_count || 0,
            overdueAmount: Number(row.overdue_amount) || 0,
            dueWithin7Days: row.due_within_7_days || 0,
            dueWithin7DaysAmount: Number(row.due_within_7_days_amount) || 0,
        };
    } catch (error) {
        console.error("[context-builder] Payables summary error:", error);
        return null;
    }
}

/**
 * V22: Fetch user profile (consolidated from multiple sources)
 */
async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    try {
        const resolvedUser = await getUser(userId);
        if (!resolvedUser) {
            console.warn(`[context-builder] Could not resolve user: ${userId}`);
            return null;
        }

        const internalUserId = resolvedUser.internalId;

        // Try tax profile first
        const { data: taxProfile } = await supabase
            .from("user_tax_profiles")
            .select("*")
            .eq("user_id", internalUserId)
            .single();

        if (taxProfile) {
            return {
                entityType: taxProfile.entity_type,
                employmentStatus: taxProfile.employment_status,
                isPensioner: taxProfile.is_pensioner,
                isSeniorCitizen: taxProfile.is_senior_citizen,
                isDisabled: taxProfile.is_disabled,
                hasDiplomaticExemption: taxProfile.has_diplomatic_exemption,
                incomeTypes: taxProfile.income_types,
            };
        }

        // Fallback to users table
        const { data: userData } = await supabase
            .from("users")
            .select("entity_type")
            .eq("id", internalUserId)
            .single();

        if (userData?.entity_type) {
            return { entityType: userData.entity_type };
        }

        // Fallback to onboarding
        const { data: onboarding } = await supabase
            .from("onboarding_progress")
            .select("extracted_profile")
            .eq("user_id", internalUserId)
            .single();

        if (onboarding?.extracted_profile) {
            const profile = onboarding.extracted_profile as Record<string, unknown>;
            return {
                entityType: profile.entityType as string,
                employmentStatus: profile.employmentStatus as string,
                isPensioner: profile.isPensioner as boolean,
                isSeniorCitizen: profile.isSeniorCitizen as boolean,
                isDisabled: profile.isDisabled as boolean,
                incomeTypes: profile.incomeTypes as string[],
            };
        }

        return null;
    } catch (error) {
        console.error("[context-builder] Profile fetch error:", error);
        return null;
    }
}

/**
 * V22: Fetch remembered facts from user_preferences
 */
async function fetchRememberedFacts(userId: string): Promise<string[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
        const { data } = await supabase
            .from("user_preferences")
            .select("remembered_facts, preferred_name, income_estimate")
            .eq("user_id", userId)
            .single();

        if (!data) return [];

        const facts: string[] = [];
        if (data.preferred_name) facts.push(`User prefers to be called "${data.preferred_name}"`);
        if (data.income_estimate) facts.push(`Estimated income: ₦${Number(data.income_estimate).toLocaleString()}`);
        if (Array.isArray(data.remembered_facts)) facts.push(...data.remembered_facts);

        return facts;
    } catch {
        return [];
    }
}

// ============= Prompt Formatters =============

function formatProfileContext(profile: UserProfile): string {
    const contexts: string[] = [];
    if (profile.isPensioner) contexts.push("- User is a pensioner (pension income exempt under Section 163 NTA 2025)");
    if (profile.isSeniorCitizen) contexts.push("- User is a senior citizen (may qualify for additional allowances)");
    if (profile.isDisabled) contexts.push("- User qualifies for disability allowance under Section 68 NTA 2025");
    if (profile.hasDiplomaticExemption) contexts.push("- User has diplomatic exemption status");
    if (profile.entityType) contexts.push(`- Entity type: ${profile.entityType}`);
    if (profile.employmentStatus) contexts.push(`- Employment status: ${profile.employmentStatus}`);
    if (profile.incomeTypes?.length) contexts.push(`- Income types: ${profile.incomeTypes.join(", ")}`);
    return contexts.length > 0 ? `\n\nUSER PROFILE:\n${contexts.join("\n")}` : "";
}

function formatFinancialContext(context: UserContext): string {
    const items: string[] = [];
    if (context.totalIncome !== undefined) items.push(`- Total income: ₦${context.totalIncome.toLocaleString()}`);
    if (context.totalExpenses !== undefined) items.push(`- Total expenses: ₦${context.totalExpenses.toLocaleString()}`);
    if (context.emtlPaid !== undefined) items.push(`- EMTL paid: ₦${context.emtlPaid.toLocaleString()}`);
    if (context.transactionCount !== undefined) items.push(`- Transactions: ${context.transactionCount}`);
    return items.length > 0 ? `\n\nFINANCIAL CONTEXT:\n${items.join("\n")}` : "";
}

function formatCalendarContext(calendar: CalendarContext): string {
    if (calendar.upcomingDeadlines.length === 0) return "";

    const deadlines = calendar.upcomingDeadlines.slice(0, 5).map(d => {
        const urgencyEmoji = d.urgency === 'critical' ? '🚨' : d.urgency === 'high' ? '⚠️' : '📅';
        return `${urgencyEmoji} ${d.title} - ${d.daysUntil} days (${d.dueDate})`;
    });

    return `\n\nUPCOMING DEADLINES:\n${deadlines.join("\n")}`;
}

function formatTransactionSummary(summary: TransactionSummary): string {
    const items: string[] = [];
    items.push(`- Last 30 days income: ₦${summary.totalIncome.toLocaleString()}`);
    items.push(`- Last 30 days expenses: ₦${summary.totalExpenses.toLocaleString()}`);
    items.push(`- Transaction count: ${summary.transactionCount}`);
    if (summary.topExpenseCategory) items.push(`- Top expense category: ${summary.topExpenseCategory}`);
    if (summary.topIncomeCategory) items.push(`- Top income source: ${summary.topIncomeCategory}`);
    if (summary.emtlTotal > 0) items.push(`- EMTL paid: ₦${summary.emtlTotal.toLocaleString()}`);
    if (summary.vatTotal > 0) items.push(`- VAT collected: ₦${summary.vatTotal.toLocaleString()}`);
    return `\n\nTRANSACTION SUMMARY (Last 30 Days):\n${items.join("\n")}`;
}

function formatInvoiceSummary(summary: InvoiceSummary): string {
    if (summary.totalInvoices === 0) return "";
    const items: string[] = [];
    items.push(`- Total invoices: ${summary.totalInvoices}`);
    items.push(`- Paid: ${summary.paidCount}, Pending: ${summary.pendingCount}`);
    if (summary.overdueCount > 0) {
        items.push(`- ⚠️ OVERDUE: ${summary.overdueCount} invoices (₦${summary.overdueAmount.toLocaleString()})`);
    }
    if (summary.pendingAmount > 0) {
        items.push(`- Pending amount: ₦${summary.pendingAmount.toLocaleString()}`);
    }
    return `\n\nINVOICE STATUS:\n${items.join("\n")}`;
}

function formatProjectSummary(summary: ProjectSummary): string {
    if (summary.totalProjects === 0) return "";
    const items: string[] = [];
    items.push(`- Total projects: ${summary.totalProjects} (${summary.activeCount} active, ${summary.completedCount} completed)`);
    items.push(`- Total budget: ₦${summary.totalBudget.toLocaleString()}`);
    items.push(`- Total spent: ₦${summary.totalSpent.toLocaleString()} (${summary.budgetUtilization}% utilized)`);
    items.push(`- Budget remaining: ₦${summary.budgetRemaining.toLocaleString()}`);
    if (summary.topProjectName) {
        items.push(`- Top project: "${summary.topProjectName}" - ₦${summary.topProjectSpent?.toLocaleString() || 0} spent, ₦${summary.topProjectRemaining?.toLocaleString() || 0} remaining`);
    }
    return `\n\nPROJECT SUMMARY:\n${items.join("\n")}`;
}

function formatInventorySummary(summary: InventorySummary): string {
    if (summary.totalItems === 0) return "";
    const items: string[] = [];
    items.push(`- Inventory items: ${summary.totalItems}`);
    items.push(`- Total inventory value: ₦${summary.totalValue.toLocaleString()}`);
    if (summary.lowStockCount > 0) {
        items.push(`- ⚠️ Low stock items: ${summary.lowStockCount}`);
    }
    if (summary.cogs30d > 0) {
        items.push(`- COGS (30 days): ₦${summary.cogs30d.toLocaleString()}`);
    }
    items.push(`- Purchases (30 days): ₦${summary.totalPurchases30d.toLocaleString()}`);
    items.push(`- Sales cost (30 days): ₦${summary.totalSales30d.toLocaleString()}`);
    return `\n\nINVENTORY SUMMARY:\n${items.join("\n")}`;
}

function formatPayablesSummary(summary: PayablesSummary): string {
    if (summary.totalPayables === 0) return "";
    const items: string[] = [];
    items.push(`- Outstanding payables: ${summary.totalPayables}`);
    items.push(`- Total amount due: ₦${summary.totalAmountDue.toLocaleString()}`);
    if (summary.overdueCount > 0) {
        items.push(`- 🚨 OVERDUE: ${summary.overdueCount} bills (₦${summary.overdueAmount.toLocaleString()})`);
    }
    if (summary.dueWithin7Days > 0) {
        items.push(`- Due within 7 days: ${summary.dueWithin7Days} bills (₦${summary.dueWithin7DaysAmount.toLocaleString()})`);
    }
    return `\n\nACCOUNTS PAYABLE:\n${items.join("\n")}`;
}

// ============= Main Entry Point =============

/**
 * Generate a dynamic system prompt with ALL context layers.
 * Uses Promise.all for parallel fetching.
 */
export async function generateSystemPrompt(
    userId?: string,
    userContext?: UserContext
): Promise<string> {
    console.log(`[context-builder] Building context for user: ${userId || 'anonymous'}`);

    // Parallel fetch all context layers (V20-V26)
    const [taxRules, profile, facts, calendar, transactions, invoices, projects, inventory, payables] = await Promise.all([
        fetchTaxRulesCached(),
        userId ? fetchUserProfile(userId) : Promise.resolve(null),
        userId ? fetchRememberedFacts(userId) : Promise.resolve([]),
        fetchCalendarContext(userId),
        userId ? fetchTransactionSummary(userId) : Promise.resolve(null),
        userId ? fetchInvoiceSummary(userId) : Promise.resolve(null),
        userId ? fetchProjectSummary(userId) : Promise.resolve(null),
        userId ? fetchInventorySummary(userId) : Promise.resolve(null),
        userId ? fetchPayablesSummary(userId) : Promise.resolve(null),
    ]);

    console.log(`[context-builder] Fetched: rules=${!!taxRules}, profile=${!!profile}, facts=${facts.length}, deadlines=${calendar.upcomingDeadlines.length}, transactions=${!!transactions}, invoices=${!!invoices}, projects=${!!projects}, inventory=${!!inventory}, payables=${!!payables}`);

    // Assemble prompt
    let prompt = BASE_PROMPT;
    prompt += `\n\n${taxRules}`;

    if (profile) prompt += formatProfileContext(profile);
    if (facts.length > 0) prompt += `\n\nREMEMBERED FACTS:\n${facts.map(f => `- ${f}`).join('\n')}`;
    if (calendar.upcomingDeadlines.length > 0) prompt += formatCalendarContext(calendar);
    if (transactions) prompt += formatTransactionSummary(transactions);
    if (invoices) prompt += formatInvoiceSummary(invoices);
    if (projects) prompt += formatProjectSummary(projects);
    if (inventory) prompt += formatInventorySummary(inventory);
    if (payables) prompt += formatPayablesSummary(payables);
    if (userContext) prompt += formatFinancialContext(userContext);

    return prompt;
}

// Re-export for backward compatibility
export { fetchUserProfile, fetchRememberedFacts };
