/**
 * Dynamic System Prompt Generator for chat-assist
 * Fetches active tax rules from database and builds context-aware prompts
 */

import { buildTaxRulesSummary } from "./rules-client.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUser, ResolvedUser } from "./user-resolver.ts";

interface UserProfile {
  entityType?: string;
  employmentStatus?: string;
  isPensioner?: boolean;
  isSeniorCitizen?: boolean;
  isDisabled?: boolean;
  hasDiplomaticExemption?: boolean;
  incomeTypes?: string[];
}

// ... existing interfaces ...

// [omitted for brevity, keep BASE_PROMPT and generateSystemPrompt constants/functions]

/**
 * Fetch user's tax profile from database
 */
async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return null;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // STEP 1: Resolve userId using shared service
    const resolvedUser = await getUser(userId);

    if (!resolvedUser) {
      console.warn(`[prompt-generator] Could not resolve user: ${userId}`);
      return null;
    }

    const internalUserId = resolvedUser.internalId;
    console.log(`[prompt-generator] Resolved ${userId} to ${internalUserId}`);

    // If we already have entity_type from resolution, use it directly as primary source
    if (resolvedUser.entityType) {
      // Check if we can get more details from tax profile below, but at least we have this
    }

    // STEP 2: Try to get from user_tax_profiles first (using resolved internal ID)


    // STEP 2: Try to get from user_tax_profiles first (using resolved internal ID)
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

    // STEP 3: Fallback to users table for entity_type (using resolved internal ID)
    const { data: userData } = await supabase
      .from("users")
      .select("entity_type")
      .eq("id", internalUserId)
      .single();

    if (userData?.entity_type) {
      return {
        entityType: userData.entity_type,
      };
    }

    // STEP 4: Fallback to onboarding_progress
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
    console.error("Failed to fetch user profile:", error);
    return null;
  }
}

/**
 * Build user profile context string
 */
function buildUserProfileContext(profile: UserProfile): string {
  const contexts: string[] = [];

  if (profile.isPensioner) {
    contexts.push("- User is a pensioner (pension income exempt under Section 163 NTA 2025)");
  }

  if (profile.isSeniorCitizen) {
    contexts.push("- User is a senior citizen (may qualify for additional allowances)");
  }

  if (profile.isDisabled) {
    contexts.push("- User qualifies for disability allowance under Section 68 NTA 2025");
  }

  if (profile.hasDiplomaticExemption) {
    contexts.push("- User has diplomatic exemption status");
  }

  if (profile.entityType) {
    contexts.push(`- Entity type: ${profile.entityType}`);
  }

  if (profile.employmentStatus) {
    contexts.push(`- Employment status: ${profile.employmentStatus}`);
  }

  if (profile.incomeTypes && profile.incomeTypes.length > 0) {
    contexts.push(`- Income types: ${profile.incomeTypes.join(", ")}`);
  }

  if (contexts.length === 0) {
    return "";
  }

  return `\n\nUSER PROFILE (apply relevant rules and exemptions):\n${contexts.join("\n")}`;
}

/**
 * Build financial context string
 */
function buildFinancialContext(context: UserContext): string {
  const items: string[] = [];

  if (context.totalIncome !== undefined) {
    items.push(`- Total income this period: ₦${context.totalIncome.toLocaleString()}`);
  }
  if (context.totalExpenses !== undefined) {
    items.push(`- Total expenses this period: ₦${context.totalExpenses.toLocaleString()}`);
  }
  if (context.emtlPaid !== undefined) {
    items.push(`- EMTL paid this period: ₦${context.emtlPaid.toLocaleString()}`);
  }
  if (context.transactionCount !== undefined) {
    items.push(`- Number of transactions: ${context.transactionCount}`);
  }

  if (items.length === 0) {
    return "";
  }

  return `\n\nUSER FINANCIAL CONTEXT (use this to personalize answers):\n${items.join("\n")}`;
}

/**
 * Fetch remembered facts from user_preferences table
 */
async function fetchRememberedFacts(userId: string): Promise<string[]> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return [];
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data } = await supabase
      .from("user_preferences")
      .select("remembered_facts, preferred_name, income_estimate")
      .eq("user_id", userId)
      .single();

    if (!data) {
      return [];
    }

    const facts: string[] = [];

    if (data.preferred_name) {
      facts.push(`User prefers to be called "${data.preferred_name}"`);
    }

    if (data.income_estimate) {
      facts.push(`Estimated income: ₦${Number(data.income_estimate).toLocaleString()}`);
    }

    if (Array.isArray(data.remembered_facts)) {
      facts.push(...data.remembered_facts);
    }

    return facts;
  } catch {
    return [];
  }
}
