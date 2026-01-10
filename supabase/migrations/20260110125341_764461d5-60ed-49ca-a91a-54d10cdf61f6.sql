-- Normalize existing ai_feedback categories to simplified taxonomy
-- This removes VAT suffixes from categories to align with the new two-layer approach

-- Update user_correction categories
UPDATE ai_feedback
SET user_correction = jsonb_set(
    user_correction,
    '{category}',
    to_jsonb(
        CASE 
            -- Remove VAT suffixes
            WHEN user_correction->>'category' LIKE '%_zero_rated' 
            THEN replace(user_correction->>'category', '_zero_rated', '')
            WHEN user_correction->>'category' LIKE '%_exempt' 
            THEN replace(user_correction->>'category', '_exempt', '')
            WHEN user_correction->>'category' LIKE '%_standard' 
            THEN replace(user_correction->>'category', '_standard', '')
            -- Normalize common variations
            WHEN user_correction->>'category' = 'professional_services' THEN 'services'
            WHEN user_correction->>'category' = 'labor_services' THEN 'labor'
            WHEN user_correction->>'category' = 'maintenance_services' THEN 'services'
            WHEN user_correction->>'category' = 'education_services' THEN 'education'
            WHEN user_correction->>'category' = 'security_services' THEN 'services'
            WHEN user_correction->>'category' = 'transport_fuel' THEN 'fuel'
            WHEN user_correction->>'category' = 'vehicle_maintenance' THEN 'transport'
            WHEN user_correction->>'category' = 'capital_equipment' THEN 'equipment'
            WHEN user_correction->>'category' = 'capital_improvement' THEN 'capital'
            WHEN user_correction->>'category' = 'baby_products_zero_rated' THEN 'food'
            WHEN user_correction->>'category' = 'agricultural_zero_rated' THEN 'agriculture'
            WHEN user_correction->>'category' = 'telecommunications' THEN 'utilities'
            WHEN user_correction->>'category' = 'office_supplies' THEN 'supplies'
            ELSE user_correction->>'category'
        END
    )
)
WHERE user_correction->>'category' IS NOT NULL
  AND (
    user_correction->>'category' LIKE '%_zero_rated'
    OR user_correction->>'category' LIKE '%_exempt'
    OR user_correction->>'category' LIKE '%_standard'
    OR user_correction->>'category' IN (
        'professional_services', 'labor_services', 'maintenance_services',
        'education_services', 'security_services', 'transport_fuel',
        'vehicle_maintenance', 'capital_equipment', 'capital_improvement',
        'baby_products_zero_rated', 'agricultural_zero_rated',
        'telecommunications', 'office_supplies'
    )
  );

-- Also update business_classification_patterns
UPDATE business_classification_patterns
SET category = 
    CASE 
        WHEN category LIKE '%_zero_rated' THEN replace(category, '_zero_rated', '')
        WHEN category LIKE '%_exempt' THEN replace(category, '_exempt', '')
        WHEN category LIKE '%_standard' THEN replace(category, '_standard', '')
        WHEN category = 'professional_services' THEN 'services'
        WHEN category = 'labor_services' THEN 'labor'
        WHEN category = 'maintenance_services' THEN 'services'
        WHEN category = 'education_services' THEN 'education'
        WHEN category = 'security_services' THEN 'services'
        WHEN category = 'transport_fuel' THEN 'fuel'
        WHEN category = 'vehicle_maintenance' THEN 'transport'
        WHEN category = 'capital_equipment' THEN 'equipment'
        WHEN category = 'capital_improvement' THEN 'capital'
        WHEN category = 'baby_products_zero_rated' THEN 'food'
        WHEN category = 'agricultural_zero_rated' THEN 'agriculture'
        WHEN category = 'telecommunications' THEN 'utilities'
        WHEN category = 'office_supplies' THEN 'supplies'
        ELSE category
    END
WHERE category LIKE '%_zero_rated'
   OR category LIKE '%_exempt'
   OR category LIKE '%_standard'
   OR category IN (
       'professional_services', 'labor_services', 'maintenance_services',
       'education_services', 'security_services', 'transport_fuel',
       'vehicle_maintenance', 'capital_equipment', 'capital_improvement',
       'baby_products_zero_rated', 'agricultural_zero_rated',
       'telecommunications', 'office_supplies'
   );