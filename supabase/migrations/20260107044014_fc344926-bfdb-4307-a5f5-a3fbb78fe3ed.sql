-- =====================================================
-- PHASE 1: CENTRAL RULES ENGINE (Fixed)
-- Update constraint and create materialized view
-- =====================================================

-- First, drop the existing materialized view if it was created
DROP MATERIALIZED VIEW IF EXISTS active_tax_rules;

-- Drop and recreate the rule_type check constraint to include our new types
ALTER TABLE compliance_rules DROP CONSTRAINT IF EXISTS compliance_rules_rule_type_check;

ALTER TABLE compliance_rules ADD CONSTRAINT compliance_rules_rule_type_check 
CHECK (rule_type = ANY (ARRAY[
    -- Original types
    'filing_deadline'::text, 
    'payment_deadline'::text, 
    'rate_application'::text, 
    'threshold_check'::text, 
    'exemption_eligibility'::text, 
    'penalty_calculation'::text, 
    'documentation_requirement'::text, 
    'registration_requirement'::text, 
    'reporting_requirement'::text,
    -- New types for comprehensive sync
    'tax_rate'::text,
    'levy'::text,
    'threshold'::text,
    'relief'::text,
    'deadline'::text,
    'exemption'::text
]));

-- Create unique index if not exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_rules_rule_code ON compliance_rules(rule_code);

-- Create the materialized view for active tax rules
CREATE MATERIALIZED VIEW active_tax_rules AS
SELECT 
    id,
    rule_code,
    rule_name,
    rule_type,
    parameters,
    description,
    effective_from,
    effective_to,
    priority,
    document_id,
    provision_id
FROM compliance_rules
WHERE is_active = true
  AND (effective_from IS NULL OR effective_from <= CURRENT_DATE)
  AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
ORDER BY priority, rule_type, rule_code;

-- Create unique index on the materialized view for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_active_tax_rules_id ON active_tax_rules(id);
CREATE INDEX idx_active_tax_rules_type ON active_tax_rules(rule_type);
CREATE INDEX idx_active_tax_rules_code ON active_tax_rules(rule_code);

-- Create function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_active_tax_rules()
RETURNS TRIGGER AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY active_tax_rules;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-refresh when compliance_rules changes
DROP TRIGGER IF EXISTS trg_refresh_active_tax_rules ON compliance_rules;
CREATE TRIGGER trg_refresh_active_tax_rules
AFTER INSERT OR UPDATE OR DELETE ON compliance_rules
FOR EACH STATEMENT EXECUTE FUNCTION refresh_active_tax_rules();

-- =====================================================
-- SEED INITIAL TAX RULES FROM HARD-CODED VALUES
-- =====================================================

-- PIT Tax Bands (from gateway/src/skills/tax-calculation/index.ts)
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, description, priority, is_active, effective_from)
VALUES 
    ('PIT_BAND_1', 'PIT Band 1 - Tax Free', 'tax_rate', 
     '{"min": 0, "max": 800000, "rate": 0, "label": "First ₦800,000"}',
     'First ₦800,000 of annual income is tax-free under the consolidated relief allowance',
     1, true, '2025-01-01'),
    
    ('PIT_BAND_2', 'PIT Band 2 - 15%', 'tax_rate',
     '{"min": 800000, "max": 3000000, "rate": 0.15, "label": "₦800,001 - ₦3,000,000"}',
     '15% tax rate on income between ₦800,001 and ₦3,000,000',
     2, true, '2025-01-01'),
    
    ('PIT_BAND_3', 'PIT Band 3 - 18%', 'tax_rate',
     '{"min": 3000000, "max": 12000000, "rate": 0.18, "label": "₦3,000,001 - ₦12,000,000"}',
     '18% tax rate on income between ₦3,000,001 and ₦12,000,000',
     3, true, '2025-01-01'),
    
    ('PIT_BAND_4', 'PIT Band 4 - 21%', 'tax_rate',
     '{"min": 12000000, "max": 25000000, "rate": 0.21, "label": "₦12,000,001 - ₦25,000,000"}',
     '21% tax rate on income between ₦12,000,001 and ₦25,000,000',
     4, true, '2025-01-01'),
    
    ('PIT_BAND_5', 'PIT Band 5 - 23%', 'tax_rate',
     '{"min": 25000000, "max": 50000000, "rate": 0.23, "label": "₦25,000,001 - ₦50,000,000"}',
     '23% tax rate on income between ₦25,000,001 and ₦50,000,000',
     5, true, '2025-01-01'),
    
    ('PIT_BAND_6', 'PIT Band 6 - 25%', 'tax_rate',
     '{"min": 50000000, "max": null, "rate": 0.25, "label": "Above ₦50,000,000"}',
     '25% tax rate on income above ₦50,000,000',
     6, true, '2025-01-01')
ON CONFLICT (rule_code) DO UPDATE SET
    parameters = EXCLUDED.parameters,
    description = EXCLUDED.description,
    updated_at = NOW();

-- VAT Rate
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, description, priority, is_active, effective_from)
VALUES 
    ('VAT_STANDARD', 'Standard VAT Rate', 'tax_rate',
     '{"rate": 0.075, "label": "7.5% VAT"}',
     'Standard Value Added Tax rate of 7.5% on taxable goods and services',
     10, true, '2025-01-01')
ON CONFLICT (rule_code) DO UPDATE SET
    parameters = EXCLUDED.parameters,
    updated_at = NOW();

-- EMTL Rate
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, description, priority, is_active, effective_from)
VALUES 
    ('EMTL_RATE', 'Electronic Money Transfer Levy', 'levy',
     '{"amount": 50, "threshold": 10000, "label": "₦50 per transfer ≥₦10,000"}',
     'Electronic Money Transfer Levy of ₦50 on transfers of ₦10,000 and above',
     20, true, '2025-01-01')
ON CONFLICT (rule_code) DO UPDATE SET
    parameters = EXCLUDED.parameters,
    updated_at = NOW();

-- Thresholds
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, description, priority, is_active, effective_from)
VALUES 
    ('MINIMUM_WAGE', 'National Minimum Wage', 'threshold',
     '{"annual": 840000, "monthly": 70000, "label": "₦70,000/month"}',
     'National minimum wage threshold for tax calculations',
     30, true, '2025-01-01'),
    
    ('SMALL_COMPANY_TURNOVER', 'Small Company Turnover Threshold', 'threshold',
     '{"limit": 50000000, "label": "₦50M annual turnover"}',
     'Maximum annual turnover for small company classification',
     31, true, '2025-01-01'),
    
    ('SMALL_COMPANY_ASSETS', 'Small Company Assets Threshold', 'threshold',
     '{"limit": 250000000, "label": "₦250M total assets"}',
     'Maximum total assets for small company classification',
     32, true, '2025-01-01'),
    
    ('VAT_REGISTRATION', 'VAT Registration Threshold', 'threshold',
     '{"turnover": 25000000, "label": "₦25M annual turnover"}',
     'Annual turnover threshold requiring VAT registration',
     33, true, '2025-01-01')
ON CONFLICT (rule_code) DO UPDATE SET
    parameters = EXCLUDED.parameters,
    updated_at = NOW();

-- Reliefs
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, description, priority, is_active, effective_from)
VALUES 
    ('RELIEF_CRA', 'Consolidated Relief Allowance', 'relief',
     '{"percentage": 20, "minimum": 200000, "of": "gross_income", "label": "20% of gross or ₦200K min"}',
     'Consolidated Relief Allowance: higher of 20% of gross income or ₦200,000 plus 1% of gross',
     40, true, '2025-01-01'),
    
    ('RELIEF_PENSION', 'Pension Contribution Relief', 'relief',
     '{"percentage": 8, "of": "basic_salary", "label": "8% of basic salary"}',
     'Tax relief on pension contributions up to 8% of basic salary',
     41, true, '2025-01-01'),
    
    ('RELIEF_NHF', 'National Housing Fund Relief', 'relief',
     '{"percentage": 2.5, "of": "basic_salary", "label": "2.5% of basic salary"}',
     'Tax relief on NHF contributions of 2.5% of basic salary',
     42, true, '2025-01-01'),
    
    ('RELIEF_NHIS', 'National Health Insurance Relief', 'relief',
     '{"percentage": 3.25, "of": "basic_salary", "label": "3.25% of basic salary"}',
     'Tax relief on NHIS contributions of 3.25% of basic salary',
     43, true, '2025-01-01'),
    
    ('RELIEF_LIFE_INSURANCE', 'Life Insurance Relief', 'relief',
     '{"of": "premium_paid", "label": "Actual premium paid"}',
     'Tax relief on life insurance premiums paid',
     44, true, '2025-01-01'),
    
    ('RELIEF_GRATUITY', 'Gratuity Exemption', 'relief',
     '{"exempt_amount": 10000000, "label": "First ₦10M exempt"}',
     'Gratuity payments: First ₦10,000,000 exempt from tax (Section 31(3))',
     45, true, '2025-01-01'),
    
    ('RELIEF_PENSION_INCOME', 'Pension Income Exemption', 'relief',
     '{"exempt_amount": 1000000, "excess_rate": 0.50, "label": "First ₦1M exempt, rest at 50%"}',
     'Pension income: First ₦1M annual exempt, remainder taxed at 50% of normal rates (Section 31(2))',
     46, true, '2025-01-01'),
    
    ('RELIEF_DISABILITY', 'Disability Allowance', 'relief',
     '{"allowance": 500000, "label": "Additional ₦500K allowance"}',
     'Additional ₦500,000 tax-free allowance for persons with disabilities',
     47, true, '2025-01-01'),
    
    ('RELIEF_SENIOR_CITIZEN', 'Senior Citizen Allowance', 'relief',
     '{"allowance": 300000, "age_threshold": 65, "label": "Additional ₦300K for 65+"}',
     'Additional ₦300,000 tax-free allowance for persons aged 65 and above',
     48, true, '2025-01-01')
ON CONFLICT (rule_code) DO UPDATE SET
    parameters = EXCLUDED.parameters,
    updated_at = NOW();

-- Filing Deadlines
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, description, priority, is_active, effective_from)
VALUES 
    ('DEADLINE_VAT', 'VAT Filing Deadline', 'deadline',
     '{"day": 21, "recurrence": "monthly", "label": "21st of each month"}',
     'VAT returns must be filed by the 21st of the following month',
     50, true, '2025-01-01'),
    
    ('DEADLINE_PAYE', 'PAYE Remittance Deadline', 'deadline',
     '{"day": 10, "recurrence": "monthly", "label": "10th of each month"}',
     'PAYE deductions must be remitted by the 10th of the following month',
     51, true, '2025-01-01'),
    
    ('DEADLINE_WHT', 'WHT Remittance Deadline', 'deadline',
     '{"day": 21, "recurrence": "monthly", "label": "21st of each month"}',
     'Withholding tax must be remitted by the 21st of the following month',
     52, true, '2025-01-01'),
    
    ('DEADLINE_ANNUAL_RETURN', 'Annual Tax Return Deadline', 'deadline',
     '{"month": 3, "day": 31, "recurrence": "annual", "label": "March 31st"}',
     'Annual tax returns must be filed by March 31st of the following year',
     53, true, '2025-01-01'),
    
    ('DEADLINE_CIT', 'Company Income Tax Deadline', 'deadline',
     '{"months_after_year_end": 6, "recurrence": "annual", "label": "6 months after year end"}',
     'Company income tax returns due within 6 months of financial year end',
     54, true, '2025-01-01')
ON CONFLICT (rule_code) DO UPDATE SET
    parameters = EXCLUDED.parameters,
    updated_at = NOW();

-- Refresh the materialized view with initial data
REFRESH MATERIALIZED VIEW active_tax_rules;