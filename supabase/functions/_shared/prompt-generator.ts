/**
 * Dynamic System Prompt Generator for chat-assist
 * Fetches active tax rules from database and builds context-aware prompts
 */

import { buildTaxRulesSummary } from "./rules-client.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface UserProfile {
  entityType?: string;
  employmentStatus?: string;
  isPensioner?: boolean;
  isSeniorCitizen?: boolean;
  isDisabled?: boolean;
  hasDiplomaticExemption?: boolean;
  incomeTypes?: string[];
}

interface UserContext {
  totalIncome?: number;
  totalExpenses?: number;
  emtlPaid?: number;
  transactionCount?: number;
}

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

/**
 * Generate a dynamic system prompt with current tax rules and user context
 */
export async function generateSystemPrompt(
  userId?: string,
  userContext?: UserContext
): Promise<string> {
  let prompt = BASE_PROMPT;

  // Add dynamic tax rules from database
  try {
    const taxRulesSummary = await buildTaxRulesSummary();
    prompt += `\n\n${taxRulesSummary}`;
  } catch (error) {
    console.error("Failed to fetch tax rules for prompt:", error);
    // Fallback to basic rules if DB unavailable
    prompt += `\n\nTAX RULES (fallback):
- Tax bands: ₦0-800k (0%), ₦800k-3M (15%), ₦3M-12M (18%), ₦12M-25M (21%), ₦25M-50M (23%), Above ₦50M (25%)
- VAT: 7.5%
- EMTL: ₦50 per transfer ≥₦10,000`;
  }

  // Add user profile context if available
  if (userId) {
    const userProfile = await fetchUserProfile(userId);
    if (userProfile) {
      prompt += buildUserProfileContext(userProfile);
    }
  }

  // Add financial context if provided
  if (userContext) {
    prompt += buildFinancialContext(userContext);
  }

  return prompt;
}

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
    
    // STEP 1: Resolve userId - it might be auth_user_id or internal users.id
    let internalUserId = userId;
    
    // Check if this is an auth_user_id by looking for a matching record
    const { data: userByAuthId } = await supabase
      .from("users")
      .select("id, entity_type")
      .eq("auth_user_id", userId)
      .single();
    
    if (userByAuthId) {
      // Found by auth_user_id, use the internal id
      internalUserId = userByAuthId.id;
      console.log(`[prompt-generator] Resolved auth_user_id to internal id: ${internalUserId}`);
      
      // If we already have entity_type, use it directly
      if (userByAuthId.entity_type) {
        return { entityType: userByAuthId.entity_type };
      }
    }

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
