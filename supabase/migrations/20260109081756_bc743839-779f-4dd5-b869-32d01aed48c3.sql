-- Part 1: Fix ATM rule dates (nested jsonb_set for multiple fields)
UPDATE compliance_rules 
SET actions = jsonb_set(
    jsonb_set(actions, '{effective_date}', '"2026-03-01"'),
    '{message}', '"New ATM fee structure must be implemented by March 1, 2026"'
)
WHERE rule_name = 'ATM_FEE_IMPLEMENTATION_DEADLINE';

-- Fix effective_from date as well if it's wrong
UPDATE compliance_rules 
SET effective_from = '2026-03-01'
WHERE rule_name LIKE 'ATM_FEE_%' AND effective_from = '2025-03-01';

-- Part 2: Update the tax_deadlines entry with correct date and better display
UPDATE tax_deadlines 
SET 
    specific_date = '2026-03-01',
    title = 'New CBN ATM Fee Structure Takes Effect',
    description = 'New ATM fee regulations from CBN take effect. On-site fees: ₦100 per ₦20,000. Off-site fees: ₦150 base + ₦50 per ₦20,000. International: 5% of withdrawal amount.',
    deadline_type = 'regulatory_change',
    updated_at = NOW()
WHERE title = 'ATM_FEE_IMPLEMENTATION_DEADLINE' 
   OR source_rule_id = 'fe694b4f-8247-4a2f-87ab-35aa3011d9f8';

-- Part 3: Drop and recreate active_tax_rules view with actions column
DROP MATERIALIZED VIEW IF EXISTS active_tax_rules CASCADE;
CREATE MATERIALIZED VIEW active_tax_rules AS
SELECT 
    id, 
    rule_code, 
    rule_name, 
    rule_type, 
    parameters, 
    actions,
    description,
    effective_from, 
    effective_to, 
    priority, 
    is_active
FROM compliance_rules
WHERE is_active = true 
  AND (effective_from IS NULL OR effective_from <= CURRENT_DATE) 
  AND (effective_to IS NULL OR effective_to >= CURRENT_DATE);

-- Recreate index for concurrent refresh
CREATE UNIQUE INDEX idx_active_tax_rules_id ON active_tax_rules (id);

-- Part 4: Drop and recreate upcoming_tax_rules view with actions column
DROP MATERIALIZED VIEW IF EXISTS upcoming_tax_rules CASCADE;
CREATE MATERIALIZED VIEW upcoming_tax_rules AS
SELECT 
    id, 
    rule_code, 
    rule_name, 
    rule_type, 
    parameters, 
    actions,
    description,
    effective_from, 
    effective_to, 
    priority
FROM compliance_rules
WHERE is_active = true 
  AND effective_from IS NOT NULL 
  AND effective_from > CURRENT_DATE;

-- Recreate index for concurrent refresh
CREATE UNIQUE INDEX idx_upcoming_tax_rules_id ON upcoming_tax_rules (id);

-- Refresh both views
REFRESH MATERIALIZED VIEW active_tax_rules;
REFRESH MATERIALIZED VIEW upcoming_tax_rules;