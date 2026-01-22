-- Step 1: Drop old constraints
ALTER TABLE public.codebase_registry 
DROP CONSTRAINT IF EXISTS codebase_registry_value_type_check;

ALTER TABLE public.codebase_registry 
DROP CONSTRAINT IF EXISTS codebase_registry_file_path_value_type_line_number_key;

-- Step 2: Rename column
ALTER TABLE public.codebase_registry 
RENAME COLUMN value_type TO file_type;

-- Step 3: Add new columns
ALTER TABLE public.codebase_registry 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS related_rule_types TEXT[] DEFAULT '{}';

-- Step 4: Add unique constraint on file_path
ALTER TABLE public.codebase_registry 
ADD CONSTRAINT codebase_registry_file_path_unique UNIQUE (file_path);

-- Step 5: Add new check constraint with expanded file types
ALTER TABLE public.codebase_registry 
ADD CONSTRAINT codebase_registry_file_type_check 
CHECK (file_type IS NULL OR file_type = ANY (ARRAY['tax_rate', 'threshold', 'tax_band', 'relief', 'vat_rate', 'emtl', 'exemption', 'penalty', 'constant', 'shared', 'edge_function', 'skill', 'database', 'service', 'frontend']));

-- Step 6: Add comments
COMMENT ON COLUMN codebase_registry.related_rule_types IS 
  'Array of rule types this file handles e.g. {"vat_rate", "exemption"}';
COMMENT ON COLUMN codebase_registry.description IS 
  'Human-readable description of file purpose';

-- Step 7: Create RPC function
CREATE OR REPLACE FUNCTION get_files_for_rule_type(p_rule_type TEXT)
RETURNS TABLE(file_path TEXT, description TEXT, file_type TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cr.file_path,
    cr.description,
    cr.file_type
  FROM codebase_registry cr
  WHERE 
    p_rule_type = ANY(cr.related_rule_types)
    OR 'all' = ANY(cr.related_rule_types)
  ORDER BY 
    CASE WHEN 'all' = ANY(cr.related_rule_types) THEN 1 ELSE 0 END,
    cr.file_path;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 8: Populate registry with PRISM file mappings
INSERT INTO public.codebase_registry 
  (file_path, file_type, description, related_rule_types) 
VALUES
('supabase/functions/_shared/rules-client.ts', 'shared', 
 'Central rules fetching and caching', ARRAY['all']),
('supabase/functions/_shared/prompt-generator.ts', 'shared', 
 'AI prompt context building with rules', ARRAY['all']),
('supabase/functions/tax-calculate/index.ts', 'edge_function', 
 'Centralized tax calculation engine', 
 ARRAY['tax_rate', 'tax_band', 'vat_rate', 'threshold', 'exemption', 'relief', 'levy']),
('gateway/src/skills/tax-calculation/index.ts', 'skill', 
 'PIT/Income tax calculation skill', ARRAY['tax_rate', 'tax_band', 'relief']),
('gateway/src/skills/vat-calculation/index.ts', 'skill', 
 'VAT calculation skill', ARRAY['vat_rate', 'exemption']),
('gateway/src/skills/withholding-tax/index.ts', 'skill', 
 'WHT calculation skill', ARRAY['wht_rate', 'threshold']),
('gateway/src/skills/corporate-tax/index.ts', 'skill', 
 'CIT calculation skill', ARRAY['cit_rate', 'tax_rate']),
('gateway/src/skills/capital-gains/index.ts', 'skill', 
 'CGT calculation skill', ARRAY['cgt_rate']),
('gateway/src/skills/stamp-duties/index.ts', 'skill', 
 'Stamp duty calculation skill', ARRAY['stamp_duty_rate', 'threshold']),
('gateway/src/skills/development-levy/index.ts', 'skill', 
 'Development levy/EMTL calculation skill', ARRAY['levy', 'threshold']),
('gateway/src/skills/minimum-etr/index.ts', 'skill', 
 'Minimum ETR calculation skill', ARRAY['etr', 'minimum_tax']),
('(DB) compliance_rules.parameters', 'database', 
 'Rule parameters stored in database', 
 ARRAY['tax_rate', 'vat_rate', 'threshold', 'tax_band']),
('(DB) compliance_rules.rule_value', 'database', 
 'Rule values in database', ARRAY['relief', 'exemption', 'deadline']),
('gateway/src/services/rules-fetcher.ts', 'service', 
 'Gateway-side rules fetching service', ARRAY['all'])
ON CONFLICT (file_path) DO UPDATE SET
  description = EXCLUDED.description,
  related_rule_types = EXCLUDED.related_rule_types,
  file_type = EXCLUDED.file_type;