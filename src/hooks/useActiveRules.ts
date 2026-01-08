/**
 * Hook to fetch active tax rules from the database
 * Provides type-safe access to tax bands, VAT rate, EMTL, thresholds, and reliefs
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  parameters: Record<string, unknown>;
  description: string | null;
  effective_from: string | null;
  effective_to: string | null;
  priority: number;
}

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
 * Fetch all active tax rules from the database
 */
export function useActiveRules() {
  return useQuery({
    queryKey: ["active-tax-rules"],
    queryFn: async (): Promise<TaxRule[]> => {
      const { data, error } = await supabase
        .from("active_tax_rules")
        .select("*")
        .order("priority");

      if (error) {
        console.error("Error fetching active rules:", error);
        return [];
      }

      return (data || []) as TaxRule[];
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * Get PIT tax bands with fallback
 */
export function useTaxBands() {
  const { data: rules, isLoading, error } = useActiveRules();

  const taxBands: TaxBand[] = (() => {
    if (!rules || rules.length === 0) {
      return FALLBACK_TAX_BANDS;
    }

    const pitRules = rules.filter(
      (r) => r.rule_type === "tax_rate" && r.rule_code.startsWith("PIT_BAND_")
    );

    if (pitRules.length === 0) {
      return FALLBACK_TAX_BANDS;
    }

    return pitRules
      .sort((a, b) => a.priority - b.priority)
      .map((r) => ({
        min: (r.parameters as { min: number }).min,
        max: (r.parameters as { max: number | null }).max,
        rate: (r.parameters as { rate: number }).rate,
        label: (r.parameters as { label: string }).label,
      }));
  })();

  return { taxBands, isLoading, error };
}

/**
 * Get VAT rate with fallback
 */
export function useVATRate() {
  const { data: rules, isLoading, error } = useActiveRules();

  const vatRate: number = (() => {
    if (!rules || rules.length === 0) {
      return FALLBACK_VAT_RATE;
    }

    const vatRule = rules.find((r) => r.rule_code === "VAT_STANDARD");
    if (!vatRule) {
      return FALLBACK_VAT_RATE;
    }

    return (vatRule.parameters as { rate: number }).rate;
  })();

  return { vatRate, isLoading, error };
}

/**
 * Get EMTL rate with fallback
 */
export function useEMTLRate() {
  const { data: rules, isLoading, error } = useActiveRules();

  const emtlRate: { amount: number; threshold: number } = (() => {
    if (!rules || rules.length === 0) {
      return FALLBACK_EMTL;
    }

    const emtlRule = rules.find((r) => r.rule_code === "EMTL_RATE");
    if (!emtlRule) {
      return FALLBACK_EMTL;
    }

    return {
      amount: (emtlRule.parameters as { amount: number }).amount,
      threshold: (emtlRule.parameters as { threshold: number }).threshold,
    };
  })();

  return { emtlRate, isLoading, error };
}

/**
 * Get minimum wage threshold with fallback
 */
export function useMinimumWage() {
  const { data: rules, isLoading, error } = useActiveRules();

  const minimumWage: { annual: number; monthly: number } = (() => {
    if (!rules || rules.length === 0) {
      return FALLBACK_MINIMUM_WAGE;
    }

    const wageRule = rules.find((r) => r.rule_code === "MINIMUM_WAGE");
    if (!wageRule) {
      return FALLBACK_MINIMUM_WAGE;
    }

    return {
      annual: (wageRule.parameters as { annual: number }).annual,
      monthly: (wageRule.parameters as { monthly: number }).monthly,
    };
  })();

  return { minimumWage, isLoading, error };
}

/**
 * Get all reliefs
 */
export function useReliefs() {
  const { data: rules, isLoading, error } = useActiveRules();

  const reliefs = rules?.filter((r) => r.rule_type === "relief") || [];

  return { reliefs, isLoading, error };
}

/**
 * Get all deadlines
 */
export function useDeadlines() {
  const { data: rules, isLoading, error } = useActiveRules();

  const deadlines = rules?.filter((r) => r.rule_type === "deadline") || [];

  return { deadlines, isLoading, error };
}

/**
 * Get all thresholds
 */
export function useThresholds() {
  const { data: rules, isLoading, error } = useActiveRules();

  const thresholds = rules?.filter((r) => r.rule_type === "threshold") || [];

  return { thresholds, isLoading, error };
}
