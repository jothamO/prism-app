-- =====================================================
-- V8: Code Proposals Enhancements
-- 1. Codebase registry for AI context
-- 2. Add needs_revision status
-- =====================================================

-- =====================================================
-- Table: codebase_registry
-- Stores actual file paths for AI-aware code proposals
-- =====================================================

CREATE TABLE IF NOT EXISTS public.codebase_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path TEXT NOT NULL UNIQUE,
    file_type TEXT NOT NULL CHECK (file_type IN ('skill', 'edge_function', 'shared', 'migration', 'component', 'other')),
    description TEXT,
    related_rule_types TEXT[], -- Which rule types affect this file
    last_updated TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for rule type lookups
CREATE INDEX IF NOT EXISTS idx_codebase_registry_rule_types 
    ON public.codebase_registry USING GIN(related_rule_types);

-- Enable RLS
ALTER TABLE public.codebase_registry ENABLE ROW LEVEL SECURITY;

-- Admin read access
CREATE POLICY "Admins can read codebase registry"
    ON public.codebase_registry
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

-- Service role full access (for edge functions)
CREATE POLICY "Service role can manage codebase registry"
    ON public.codebase_registry
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =====================================================
-- Populate with actual PRISM codebase files
-- =====================================================

INSERT INTO public.codebase_registry (file_path, file_type, description, related_rule_types) VALUES
-- Gateway Skills (all centralized via taxService)
('gateway/src/skills/vat-calculation/index.ts', 'skill', 'VAT calculation with exemption NLU pass-through', ARRAY['vat_rate', 'exemption']),
('gateway/src/skills/stamp-duties/index.ts', 'skill', 'Stamp duty via taxService', ARRAY['stamp_duty', 'exemption']),
('gateway/src/skills/withholding-tax/index.ts', 'skill', 'WHT via taxService', ARRAY['wht_rate']),
('gateway/src/skills/corporate-tax/index.ts', 'skill', 'CIT via taxService', ARRAY['cit_rate', 'threshold']),
('gateway/src/skills/capital-gains/index.ts', 'skill', 'CGT via taxService', ARRAY['cgt_rate']),
('gateway/src/skills/minimum-etr/index.ts', 'skill', 'METR via taxService', ARRAY['metr_rate', 'threshold']),
('gateway/src/utils/tax-service.ts', 'skill', 'TypeScript wrapper for tax-calculate edge function', ARRAY['all']),

-- Shared utilities
('supabase/functions/_shared/prompt-generator.ts', 'shared', 'AI context builder - may need NTA section updates', ARRAY['all']),
('supabase/functions/_shared/rules-client.ts', 'shared', 'Runtime rules fetcher from compliance_rules', ARRAY['all']),

-- Edge functions
('supabase/functions/tax-calculate/index.ts', 'edge_function', 'Central tax calculator with exemption NLU', ARRAY['all']),
('supabase/functions/vat-calculator/index.ts', 'edge_function', 'User-facing VAT calculator API', ARRAY['vat_rate', 'exemption']),
('supabase/functions/income-tax-calculator/index.ts', 'edge_function', 'User-facing PIT calculator API', ARRAY['tax_rate', 'tax_band', 'relief']),

-- Database (special entry for DB-only changes)
('compliance_rules (DB)', 'other', 'Database table - most rule changes are DB-only', ARRAY['all'])
ON CONFLICT (file_path) DO UPDATE SET
    description = EXCLUDED.description,
    related_rule_types = EXCLUDED.related_rule_types,
    last_updated = now();

-- =====================================================
-- Update code_change_proposals status constraint
-- Add needs_revision status
-- =====================================================

ALTER TABLE public.code_change_proposals 
DROP CONSTRAINT IF EXISTS code_change_proposals_status_check;

DO $$ 
BEGIN
    -- Check if constraint exists before trying to drop
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'code_change_proposals_status_check_v2'
        AND table_name = 'code_change_proposals'
    ) THEN
        ALTER TABLE public.code_change_proposals 
        ADD CONSTRAINT code_change_proposals_status_check_v2 
        CHECK (status IN ('pending', 'approved', 'rejected', 'implemented', 'needs_revision'));
    END IF;
END $$;

-- Add revision notes column if not exists
ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS revision_notes TEXT;

-- Add re-queued count to track how many times proposal was revised
ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS revision_count INTEGER DEFAULT 0;

-- =====================================================
-- Function to get relevant files for a rule type
-- Used by generate-code-proposals
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_files_for_rule_type(p_rule_type TEXT)
RETURNS TABLE(
    file_path TEXT,
    file_type TEXT,
    description TEXT
)
LANGUAGE sql
STABLE
AS $$
    SELECT file_path, file_type, description
    FROM public.codebase_registry
    WHERE 'all' = ANY(related_rule_types)
       OR p_rule_type = ANY(related_rule_types)
    ORDER BY 
        CASE file_type 
            WHEN 'other' THEN 1  -- DB first
            WHEN 'shared' THEN 2
            WHEN 'edge_function' THEN 3
            WHEN 'skill' THEN 4
            ELSE 5
        END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION public.get_files_for_rule_type(TEXT) TO service_role;
