/**
 * Rules Fetcher Service for Gateway (Telegram + WhatsApp Bots)
 * Fetches active tax rules from the central rules engine with caching and fallback
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import logger from '../utils/logger';

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
  description: string;
  effective_from: string | null;
  effective_to: string | null;
  priority: number;
}

interface RulesCache {
  rules: TaxRule[];
  timestamp: number;
}

// Cache with 5-minute TTL
let rulesCache: RulesCache | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Supabase client singleton
let supabaseClient: SupabaseClient | null = null;

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
 * Get or create Supabase client
 */
function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    logger.warn('Missing Supabase credentials for rules fetcher');
    return null;
  }
  
  supabaseClient = createClient(supabaseUrl, supabaseKey);
  return supabaseClient;
}

/**
 * Fetch all active rules from database with caching
 */
export async function getActiveRules(ruleType?: string): Promise<TaxRule[]> {
  // Check cache first
  if (rulesCache && Date.now() - rulesCache.timestamp < CACHE_TTL) {
    const rules = rulesCache.rules;
    return ruleType ? rules.filter(r => r.rule_type === ruleType) : rules;
  }

  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      logger.warn('Supabase client not available, returning empty rules');
      return [];
    }

    const { data, error } = await supabase
      .from('active_tax_rules')
      .select('*')
      .order('priority');

    if (error) {
      logger.error('Error fetching active rules:', error);
      return [];
    }

    // Update cache
    rulesCache = { rules: data || [], timestamp: Date.now() };
    logger.info(`Fetched ${data?.length || 0} active tax rules from database`);
    
    const rules = rulesCache.rules;
    return ruleType ? rules.filter(r => r.rule_type === ruleType) : rules;
  } catch (error) {
    logger.error('Failed to fetch active rules:', error);
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
    const rules = await getActiveRules('tax_rate');
    const pitRules = rules.filter(r => r.rule_code.startsWith('PIT_BAND_'));
    
    if (pitRules.length === 0) {
      logger.warn('No PIT bands found in database, using fallback');
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
    logger.error('Failed to get tax bands:', error);
    return FALLBACK_TAX_BANDS;
  }
}

/**
 * Get VAT rate from database with fallback
 */
export async function getVATRate(): Promise<number> {
  try {
    const rule = await getRuleByCode('VAT_STANDARD');
    if (!rule) {
      logger.warn('VAT_STANDARD rule not found, using fallback');
      return FALLBACK_VAT_RATE;
    }
    return rule.parameters.rate;
  } catch (error) {
    logger.error('Failed to get VAT rate:', error);
    return FALLBACK_VAT_RATE;
  }
}

/**
 * Get EMTL rate from database with fallback
 */
export async function getEMTLRate(): Promise<{ amount: number; threshold: number }> {
  try {
    const rule = await getRuleByCode('EMTL_RATE');
    if (!rule) {
      logger.warn('EMTL_RATE rule not found, using fallback');
      return FALLBACK_EMTL;
    }
    return {
      amount: rule.parameters.amount,
      threshold: rule.parameters.threshold,
    };
  } catch (error) {
    logger.error('Failed to get EMTL rate:', error);
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
      if (code === 'MINIMUM_WAGE') return FALLBACK_MINIMUM_WAGE;
      return null;
    }
    return rule.parameters;
  } catch (error) {
    logger.error(`Failed to get threshold ${code}:`, error);
    if (code === 'MINIMUM_WAGE') return FALLBACK_MINIMUM_WAGE;
    return null;
  }
}

/**
 * Get all reliefs from database
 */
export async function getReliefs(): Promise<TaxRule[]> {
  return getActiveRules('relief');
}

/**
 * Get all deadlines from database
 */
export async function getDeadlines(): Promise<TaxRule[]> {
  return getActiveRules('deadline');
}

/**
 * Get all thresholds from database
 */
export async function getThresholds(): Promise<TaxRule[]> {
  return getActiveRules('threshold');
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
 * Build a summary of current tax rules for chat context
 */
export async function buildTaxRulesSummary(): Promise<string> {
  const taxBands = await getTaxBands();
  const vatRate = await getVATRate();
  const emtl = await getEMTLRate();
  const reliefs = await getReliefs();
  const deadlines = await getDeadlines();

  const bandsText = taxBands
    .map(b => `  - ${b.label}: ${b.rate * 100}%`)
    .join('\n');

  const reliefsText = reliefs
    .map(r => `  - ${r.rule_name}: ${r.parameters.label}`)
    .join('\n');

  const deadlinesText = deadlines
    .map(d => `  - ${d.rule_name}: ${d.parameters.label}`)
    .join('\n');

  return `
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
}

// Initialize cache on module load (async)
getActiveRules().catch(() => {
  logger.warn('Initial rules cache population failed, will retry on first request');
});
