/**
 * Shared Rules Client for Edge Functions
 * Fetches active tax rules from the central rules engine (active_tax_rules materialized view)
 * with caching and fallback to hard-coded values
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Types for tax rules
export interface TaxBand {
  min: number;
  max: number | null;
  rate: number;
  label: string;
}

export interface TaxRule {
  id: string;
  rule_code: string;
  rule_name: string;
  rule_type: string;
  parameters: Record<string, any>;
  actions?: Record<string, any>;
  description: string;
  effective_from: string | null;
  effective_to: string | null;
  priority: number;
}

export interface RulesCache {
  rules: TaxRule[];
  timestamp: number;
}

// Cache with 5-minute TTL
let rulesCache: RulesCache | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Fallback values (used if database is unavailable)
const FALLBACK_TAX_BANDS: TaxBand[] = [
  { min: 0, max: 800000, rate: 0, label: "First ₦800,000" },
  { min: 800000, max: 3000000, rate: 0.15, label: "₦800,001 - ₦3,000,000" },
  { min: 3000000, max: 12000000, rate: 0.18, label: "₦3,000,001 - ₦12,000,000" },
  { min: 12000000, max: 25000000, rate: 0.21, label: "₦12,000,001 - ₦25,000,000" },
  { min: 25000000, max: 50000000, rate: 0.23, label: "₦25,000,001 - ₦50,000,000" },
  { min: 50000000, max: null, rate: 0.25, label: "Above ₦50,000,000" },
];

const FALLBACK_VAT_RATE = 0.075;
const FALLBACK_EMTL = { amount: 50, threshold: 10000 };
const FALLBACK_MINIMUM_WAGE = { annual: 840000, monthly: 70000 };

/**
 * Get Supabase client for rules fetching
 */
function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Fetch all active rules from database with caching
 * @param ruleType - Optional filter by rule type
 * @param asOfDate - Optional date for which to get rules (defaults to current date)
 */
export async function getActiveRules(ruleType?: string, asOfDate?: Date): Promise<TaxRule[]> {
  // For non-current dates, bypass cache and query directly
  if (asOfDate) {
    return getActiveRulesForDate(ruleType, asOfDate);
  }

  // Check cache first
  if (rulesCache && Date.now() - rulesCache.timestamp < CACHE_TTL) {
    const rules = rulesCache.rules;
    return ruleType ? rules.filter(r => r.rule_type === ruleType) : rules;
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("active_tax_rules")
      .select("*")
      .order("priority");

    if (error) {
      console.error("Error fetching active rules:", error);
      return [];
    }

    // Update cache
    rulesCache = { rules: data || [], timestamp: Date.now() };
    
    const rules = rulesCache.rules;
    return ruleType ? rules.filter(r => r.rule_type === ruleType) : rules;
  } catch (error) {
    console.error("Failed to fetch active rules:", error);
    return [];
  }
}

/**
 * Fetch rules active as of a specific date (bypasses materialized view)
 */
async function getActiveRulesForDate(ruleType: string | undefined, asOfDate: Date): Promise<TaxRule[]> {
  try {
    const supabase = getSupabaseClient();
    const dateStr = asOfDate.toISOString().split('T')[0];
    
    let query = supabase
      .from("compliance_rules")
      .select("id, rule_code, rule_name, rule_type, parameters, description, effective_from, effective_to, priority")
      .eq("is_active", true)
      .or(`effective_from.is.null,effective_from.lte.${dateStr}`)
      .or(`effective_to.is.null,effective_to.gte.${dateStr}`)
      .order("priority");
    
    if (ruleType) {
      query = query.eq("rule_type", ruleType);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error("Error fetching rules for date:", error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error("Failed to fetch rules for date:", error);
    return [];
  }
}

/**
 * Fetch upcoming rules (not yet effective)
 */
export async function getUpcomingRules(ruleType?: string): Promise<TaxRule[]> {
  try {
    const supabase = getSupabaseClient();
    let query = supabase
      .from("upcoming_tax_rules")
      .select("*")
      .order("effective_from");
    
    if (ruleType) {
      query = query.eq("rule_type", ruleType);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error("Error fetching upcoming rules:", error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error("Failed to fetch upcoming rules:", error);
    return [];
  }
}

/**
 * Get rule by code
 */
export async function getRuleByCode(ruleCode: string): Promise<TaxRule | null> {
  const rules = await getActiveRules();
  return rules.find(r => r.rule_code === ruleCode) || null;
}

/**
 * Get PIT tax bands from database with fallback
 */
export async function getTaxBands(): Promise<TaxBand[]> {
  try {
    const rules = await getActiveRules("tax_rate");
    const pitRules = rules.filter(r => r.rule_code.startsWith("PIT_BAND_"));
    
    if (pitRules.length === 0) {
      console.warn("No PIT bands found in database, using fallback");
      return FALLBACK_TAX_BANDS;
    }

    return pitRules
      .sort((a, b) => a.priority - b.priority)
      .map(r => ({
        min: r.parameters.min,
        max: r.parameters.max,
        rate: r.parameters.rate,
        label: r.parameters.label,
      }));
  } catch (error) {
    console.error("Failed to get tax bands:", error);
    return FALLBACK_TAX_BANDS;
  }
}

/**
 * Get VAT rate from database with fallback
 */
export async function getVATRate(): Promise<number> {
  try {
    const rule = await getRuleByCode("VAT_STANDARD");
    if (!rule) {
      console.warn("VAT_STANDARD rule not found, using fallback");
      return FALLBACK_VAT_RATE;
    }
    return rule.parameters.rate;
  } catch (error) {
    console.error("Failed to get VAT rate:", error);
    return FALLBACK_VAT_RATE;
  }
}

/**
 * Get EMTL rate from database with fallback
 */
export async function getEMTLRate(): Promise<{ amount: number; threshold: number }> {
  try {
    const rule = await getRuleByCode("EMTL_RATE");
    if (!rule) {
      console.warn("EMTL_RATE rule not found, using fallback");
      return FALLBACK_EMTL;
    }
    return {
      amount: rule.parameters.amount,
      threshold: rule.parameters.threshold,
    };
  } catch (error) {
    console.error("Failed to get EMTL rate:", error);
    return FALLBACK_EMTL;
  }
}

/**
 * Get threshold by code from database with fallback
 */
export async function getThreshold(code: string): Promise<Record<string, any> | null> {
  try {
    const rule = await getRuleByCode(code);
    if (!rule) {
      // Return fallback based on code
      if (code === "MINIMUM_WAGE") return FALLBACK_MINIMUM_WAGE;
      return null;
    }
    return rule.parameters;
  } catch (error) {
    console.error(`Failed to get threshold ${code}:`, error);
    if (code === "MINIMUM_WAGE") return FALLBACK_MINIMUM_WAGE;
    return null;
  }
}

/**
 * Get all reliefs from database
 */
export async function getReliefs(): Promise<TaxRule[]> {
  return getActiveRules("relief");
}

/**
 * Get all deadlines from database
 */
export async function getDeadlines(): Promise<TaxRule[]> {
  return getActiveRules("deadline");
}

/**
 * Get all thresholds from database
 */
export async function getThresholds(): Promise<TaxRule[]> {
  return getActiveRules("threshold");
}

/**
 * Clear the rules cache (useful for testing or manual refresh)
 */
export function clearRulesCache(): void {
  rulesCache = null;
}

/**
 * Format currency for display
 */
export function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString()}`;
}

/**
 * Build a summary of current tax rules for chat prompts
 */
export async function buildTaxRulesSummary(): Promise<string> {
  const taxBands = await getTaxBands();
  const vatRate = await getVATRate();
  const emtl = await getEMTLRate();
  const reliefs = await getReliefs();
  const deadlines = await getDeadlines();
  const upcoming = await getUpcomingRules();

  const bandsText = taxBands
    .map(b => `  - ${b.label}: ${b.rate * 100}%`)
    .join("\n");

  const reliefsText = reliefs
    .map(r => `  - ${r.rule_name}: ${r.parameters.label || r.description || ''}`)
    .join("\n");

  const deadlinesText = deadlines
    .map(d => `  - ${d.rule_name}: ${d.parameters.label || d.description || ''}`)
    .join("\n");

  let summary = `
CURRENT TAX RULES (from Central Rules Engine):

PIT Tax Bands:
${bandsText}

VAT Rate: ${vatRate * 100}%

EMTL: ₦${emtl.amount} per transfer ≥₦${emtl.threshold.toLocaleString()}

Tax Reliefs:
${reliefsText}

Filing Deadlines:
${deadlinesText}
`.trim();

  // Add upcoming changes section if there are any
  if (upcoming.length > 0) {
    const upcomingDetails = upcoming
      .slice(0, 10) // Limit to 10 upcoming rules
      .map(r => {
        let details = `  - ${r.rule_name} (${r.rule_type}): Effective ${r.effective_from}`;
        
        // Include key action details for fees and thresholds
        if (r.actions) {
          if (r.actions.charge_per_unit !== undefined && r.actions.unit_amount !== undefined) {
            details += `\n      Fee: ₦${r.actions.charge_per_unit} per ₦${Number(r.actions.unit_amount).toLocaleString()} unit`;
          }
          if (r.actions.base_fee !== undefined) {
            details += `\n      Base Fee: ₦${r.actions.base_fee}`;
          }
          if (r.actions.maximum_fee !== undefined) {
            details += `\n      Maximum: ₦${Number(r.actions.maximum_fee).toLocaleString()}`;
          }
          if (r.actions.rate !== undefined) {
            details += `\n      Rate: ${(r.actions.rate * 100).toFixed(1)}%`;
          }
          if (r.actions.message) {
            details += `\n      Note: ${r.actions.message}`;
          }
        }
        
        // Also check parameters for additional context
        if (r.parameters) {
          if (r.parameters.label) {
            details += `\n      ${r.parameters.label}`;
          }
        }
        
        return details;
      }).join("\n");
    
    summary += `\n\nUPCOMING REGULATORY CHANGES:\n${upcomingDetails}`;
  }

  return summary;
}
