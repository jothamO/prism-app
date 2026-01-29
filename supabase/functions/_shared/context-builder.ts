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

    // Parallel fetch all context layers
    const [taxRules, profile, facts, calendar] = await Promise.all([
        fetchTaxRulesCached(),
        userId ? fetchUserProfile(userId) : Promise.resolve(null),
        userId ? fetchRememberedFacts(userId) : Promise.resolve([]),
        fetchCalendarContext(userId),
    ]);

    console.log(`[context-builder] Fetched: rules=${!!taxRules}, profile=${!!profile}, facts=${facts.length}, deadlines=${calendar.upcomingDeadlines.length}`);

    // Assemble prompt
    let prompt = BASE_PROMPT;
    prompt += `\n\n${taxRules}`;

    if (profile) prompt += formatProfileContext(profile);
    if (facts.length > 0) prompt += `\n\nREMEMBERED FACTS:\n${facts.map(f => `- ${f}`).join('\n')}`;
    if (calendar.upcomingDeadlines.length > 0) prompt += formatCalendarContext(calendar);
    if (userContext) prompt += formatFinancialContext(userContext);

    return prompt;
}

// Re-export for backward compatibility
export { fetchUserProfile, fetchRememberedFacts };
