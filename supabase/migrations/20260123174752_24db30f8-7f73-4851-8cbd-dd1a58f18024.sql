-- =====================================================
-- V17: Historical Tax Rules Support
-- Enables correct tax calculations for 2024/2025 filings
-- using pre-2026 (PITA 2011) rules
-- =====================================================

-- =====================================================
-- 1. Schema Enhancements
-- =====================================================

-- Add tax regime and law reference columns
ALTER TABLE compliance_rules 
ADD COLUMN IF NOT EXISTS tax_regime TEXT CHECK (tax_regime IN ('pre_2026', '2026_act', 'universal')),
ADD COLUMN IF NOT EXISTS law_reference TEXT;

-- Index for efficient tax year lookups
CREATE INDEX IF NOT EXISTS idx_rules_effective_dates 
ON compliance_rules(rule_type, effective_from, effective_to);

-- =====================================================
-- 2. Update Rule Lookup Function
-- =====================================================

CREATE OR REPLACE FUNCTION get_active_rules_for_type(
    p_rule_type TEXT,
    p_tax_year INTEGER DEFAULT NULL
)
RETURNS SETOF compliance_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_year INTEGER;
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    v_year := COALESCE(p_tax_year, EXTRACT(YEAR FROM NOW())::INTEGER);
    v_start_date := make_date(v_year, 1, 1);
    v_end_date := make_date(v_year, 12, 31);
    
    RETURN QUERY
    SELECT * FROM compliance_rules
    WHERE rule_type = p_rule_type
      AND is_active = true
      AND effective_from <= v_end_date
      AND (effective_to IS NULL OR effective_to >= v_start_date)
    ORDER BY effective_from DESC;
END;
$$;

-- =====================================================
-- 3. Pre-2026 Tax Rules (PITA 2011 era)
-- Using valid rule_types from CHECK constraint
-- =====================================================

-- Personal Income Tax Bands (PITA 2011) - using 'tax_band'
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('PIT_BAND_1_PRE2026', 'PIT Band 1 (Pre-2026)', 'tax_band', '{"band": 1, "min": 0, "max": 300000, "rate": 0.07, "tax_type": "pit"}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 Sixth Schedule', true),
('PIT_BAND_2_PRE2026', 'PIT Band 2 (Pre-2026)', 'tax_band', '{"band": 2, "min": 300001, "max": 600000, "rate": 0.11, "tax_type": "pit"}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 Sixth Schedule', true),
('PIT_BAND_3_PRE2026', 'PIT Band 3 (Pre-2026)', 'tax_band', '{"band": 3, "min": 600001, "max": 1100000, "rate": 0.15, "tax_type": "pit"}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 Sixth Schedule', true),
('PIT_BAND_4_PRE2026', 'PIT Band 4 (Pre-2026)', 'tax_band', '{"band": 4, "min": 1100001, "max": 1600000, "rate": 0.19, "tax_type": "pit"}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 Sixth Schedule', true),
('PIT_BAND_5_PRE2026', 'PIT Band 5 (Pre-2026)', 'tax_band', '{"band": 5, "min": 1600001, "max": 3200000, "rate": 0.21, "tax_type": "pit"}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 Sixth Schedule', true),
('PIT_BAND_6_PRE2026', 'PIT Band 6 (Pre-2026)', 'tax_band', '{"band": 6, "min": 3200001, "max": null, "rate": 0.24, "tax_type": "pit"}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 Sixth Schedule', true)
ON CONFLICT (rule_code) DO NOTHING;

-- Consolidated Relief Allowance (PITA 2011) - using 'relief'
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('CRA_FIXED_PRE2026', 'CRA Fixed Amount (Pre-2026)', 'relief', '{"type": "fixed_or_percent", "fixed": 200000, "percent_of_gross": 0.01, "use_higher": true}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 s.33(1)', true),
('CRA_PERCENT_PRE2026', 'CRA 20% Gross (Pre-2026)', 'relief', '{"type": "percentage", "rate": 0.20, "of": "gross_income"}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 s.33(2)', true)
ON CONFLICT (rule_code) DO NOTHING;

-- Minimum Tax (Pre-2026) - using 'threshold'
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('MIN_TAX_PRE2026', 'Minimum Tax (Pre-2026)', 'threshold', '{"rate": 0.01, "of": "gross_income", "threshold_type": "minimum_tax"}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 s.33(4)', true)
ON CONFLICT (rule_code) DO NOTHING;

-- VAT Rate (Pre-2026: 7.5% since Feb 2020)
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('VAT_RATE_PRE2026', 'VAT Standard Rate 7.5% (Pre-2026)', 'vat_rate', '{"rate": 0.075}', '2020-02-01', '2025-12-31', 'pre_2026', 'Finance Act 2019', true)
ON CONFLICT (rule_code) DO NOTHING;

-- CIT Rates (Pre-2026) - using 'tax_rate'
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('CIT_SMALL_PRE2026', 'CIT Small Company 0% (Pre-2026)', 'tax_rate', '{"tier": "small", "min_turnover": 0, "max_turnover": 25000000, "rate": 0, "tax_type": "cit"}', '2020-01-01', '2025-12-31', 'pre_2026', 'Finance Act 2019', true),
('CIT_MEDIUM_PRE2026', 'CIT Medium Company 20% (Pre-2026)', 'tax_rate', '{"tier": "medium", "min_turnover": 25000001, "max_turnover": 100000000, "rate": 0.20, "tax_type": "cit"}', '2020-01-01', '2025-12-31', 'pre_2026', 'Finance Act 2019', true),
('CIT_LARGE_PRE2026', 'CIT Large Company 30% (Pre-2026)', 'tax_rate', '{"tier": "large", "min_turnover": 100000001, "max_turnover": null, "rate": 0.30, "tax_type": "cit"}', '2020-01-01', '2025-12-31', 'pre_2026', 'Finance Act 2019', true)
ON CONFLICT (rule_code) DO NOTHING;

-- WHT Rates (Pre-2026) - using 'tax_rate'
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('WHT_DIVIDENDS_PRE2026', 'WHT Dividends 10% (Pre-2026)', 'tax_rate', '{"category": "dividends", "rate": 0.10, "tax_type": "wht"}', '1993-01-01', '2025-12-31', 'pre_2026', 'CITA s.80', true),
('WHT_RENT_PRE2026', 'WHT Rent 10% (Pre-2026)', 'tax_rate', '{"category": "rent", "rate": 0.10, "tax_type": "wht"}', '1993-01-01', '2025-12-31', 'pre_2026', 'WHT Regulations', true),
('WHT_PROFESSIONAL_PRE2026', 'WHT Professional Services 10% (Pre-2026)', 'tax_rate', '{"category": "professional", "rate": 0.10, "tax_type": "wht"}', '1993-01-01', '2025-12-31', 'pre_2026', 'WHT Regulations', true),
('WHT_CONTRACTS_PRE2026', 'WHT Contracts 5% (Pre-2026)', 'tax_rate', '{"category": "contracts", "rate": 0.05, "tax_type": "wht"}', '1993-01-01', '2025-12-31', 'pre_2026', 'WHT Regulations', true),
('WHT_DIRECTORS_PRE2026', 'WHT Directors Fees 10% (Pre-2026)', 'tax_rate', '{"category": "directors_fees", "rate": 0.10, "tax_type": "wht"}', '1993-01-01', '2025-12-31', 'pre_2026', 'WHT Regulations', true)
ON CONFLICT (rule_code) DO NOTHING;

-- Capital Gains Tax (Pre-2026) - using 'tax_rate'
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('CGT_RATE_PRE2026', 'CGT Rate 10% (Pre-2026)', 'tax_rate', '{"rate": 0.10, "tax_type": "cgt"}', '1967-01-01', '2025-12-31', 'pre_2026', 'CGTA s.2', true)
ON CONFLICT (rule_code) DO NOTHING;

-- Tertiary Education Tax (Pre-2026) - using 'tax_rate'
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('TET_RATE_PRE2026', 'TET Rate 2.5% (Pre-2026)', 'tax_rate', '{"rate": 0.025, "of": "assessable_profit", "tax_type": "tet"}', '2011-01-01', '2025-12-31', 'pre_2026', 'TET Fund Act', true)
ON CONFLICT (rule_code) DO NOTHING;

-- Stamp Duty Electronic Transfer (Pre-2026) - using 'threshold'
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('STAMP_DUTY_ELECTRONIC_PRE2026', 'Stamp Duty ₦50 Electronic (Pre-2026)', 'threshold', '{"type": "electronic_transfer", "amount": 50, "threshold": 10000, "tax_type": "stamp_duty"}', '2020-01-01', '2025-12-31', 'pre_2026', 'Stamp Duties Act', true)
ON CONFLICT (rule_code) DO NOTHING;

-- =====================================================
-- 4. Mark existing 2026 rules with tax_regime
-- =====================================================

UPDATE compliance_rules 
SET tax_regime = '2026_act'
WHERE tax_regime IS NULL 
  AND effective_from >= '2026-01-01';

-- =====================================================
-- 5. Comments
-- =====================================================

COMMENT ON COLUMN compliance_rules.tax_regime IS 'Tax regime: pre_2026 (PITA 2011 era), 2026_act (Nigeria Tax Act), universal (applies to all)';
COMMENT ON COLUMN compliance_rules.law_reference IS 'Legal citation, e.g., "PITA 2011 s.33(1)"';