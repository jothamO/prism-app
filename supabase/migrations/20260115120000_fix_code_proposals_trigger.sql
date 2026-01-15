-- =====================================================
-- Fix Code Proposals Trigger + Add Risk Classification
-- =====================================================
-- Problem: Trigger only fired on UPDATE, not INSERT
-- Solution: Fire on both INSERT and UPDATE

-- Drop old trigger function
DROP FUNCTION IF EXISTS public.queue_code_proposal_on_rule_activation() CASCADE;

-- Create new trigger function that handles INSERT and UPDATE
CREATE OR REPLACE FUNCTION public.queue_code_proposal_trigger()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_rule_types TEXT[] := ARRAY['tax_rate', 'threshold', 'tax_band', 'relief', 'vat_rate', 'emtl', 'exemption', 'penalty'];
BEGIN
    -- On INSERT: Queue if active and relevant rule type
    IF TG_OP = 'INSERT' THEN
        IF NEW.is_active = true AND NEW.rule_type = ANY(v_rule_types) THEN
            INSERT INTO public.code_proposal_queue (rule_id, status)
            VALUES (NEW.id, 'pending')
            ON CONFLICT DO NOTHING;
        END IF;
        RETURN NEW;
    END IF;
    
    -- On UPDATE: Queue if becoming active OR parameters changed
    IF TG_OP = 'UPDATE' THEN
        IF NEW.is_active = true 
           AND NEW.rule_type = ANY(v_rule_types)
           AND (
               -- Rule becoming active
               (OLD.is_active = false OR OLD.is_active IS NULL)
               -- OR parameters changed
               OR (OLD.parameters IS DISTINCT FROM NEW.parameters)
               -- OR rule type changed
               OR (OLD.rule_type IS DISTINCT FROM NEW.rule_type)
           ) THEN
            INSERT INTO public.code_proposal_queue (rule_id, status)
            VALUES (NEW.id, 'pending')
            ON CONFLICT DO NOTHING;
        END IF;
        RETURN NEW;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Recreate trigger to fire on INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_queue_code_proposal ON public.compliance_rules;
CREATE TRIGGER trg_queue_code_proposal
    AFTER INSERT OR UPDATE ON public.compliance_rules
    FOR EACH ROW 
    EXECUTE FUNCTION public.queue_code_proposal_trigger();

-- =====================================================
-- Add Risk Classification to code_change_proposals
-- =====================================================

-- Add risk classification columns
ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'medium' 
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical'));

ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS auto_apply_eligible BOOLEAN DEFAULT false;

ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS change_type TEXT DEFAULT 'code_and_db'
    CHECK (change_type IN ('db_only', 'prompt_only', 'code_and_db'));

ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;

ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS applied_by UUID REFERENCES auth.users(id);

-- Add index for filtering by risk level
CREATE INDEX IF NOT EXISTS idx_code_proposals_risk_level 
    ON public.code_change_proposals(risk_level);

CREATE INDEX IF NOT EXISTS idx_code_proposals_auto_apply 
    ON public.code_change_proposals(auto_apply_eligible) 
    WHERE auto_apply_eligible = true;

-- =====================================================
-- Add unique constraint to prevent duplicate queue items
-- =====================================================
ALTER TABLE public.code_proposal_queue 
ADD CONSTRAINT unique_pending_rule 
UNIQUE (rule_id, status);

-- =====================================================
-- Function to classify risk level based on rule type
-- =====================================================
CREATE OR REPLACE FUNCTION public.classify_proposal_risk(
    p_rule_type TEXT,
    p_parameters JSONB
) RETURNS TABLE(
    risk_level TEXT,
    auto_apply_eligible BOOLEAN,
    change_type TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE p_rule_type
            -- Low risk: Simple rate/threshold changes
            WHEN 'vat_rate' THEN 'low'::TEXT
            WHEN 'tax_rate' THEN 'low'::TEXT
            WHEN 'threshold' THEN 'low'::TEXT
            -- Medium risk: Band changes require review
            WHEN 'tax_band' THEN 'medium'::TEXT
            WHEN 'relief' THEN 'medium'::TEXT
            -- High risk: New provisions
            WHEN 'exemption' THEN 'high'::TEXT
            WHEN 'penalty' THEN 'high'::TEXT
            -- Critical: EMTL changes
            WHEN 'emtl' THEN 'critical'::TEXT
            ELSE 'medium'::TEXT
        END,
        CASE p_rule_type
            WHEN 'vat_rate' THEN true
            WHEN 'tax_rate' THEN true
            WHEN 'threshold' THEN true
            ELSE false
        END,
        -- Most changes are DB-only now that we centralized calculations
        CASE p_rule_type
            WHEN 'vat_rate' THEN 'db_only'::TEXT
            WHEN 'tax_rate' THEN 'db_only'::TEXT
            WHEN 'threshold' THEN 'db_only'::TEXT
            WHEN 'tax_band' THEN 'db_only'::TEXT
            ELSE 'prompt_only'::TEXT  -- May need prompt updates
        END;
END;
$$;

-- =====================================================
-- Grant execute permission
-- =====================================================
GRANT EXECUTE ON FUNCTION public.queue_code_proposal_trigger() TO service_role;
GRANT EXECUTE ON FUNCTION public.classify_proposal_risk(TEXT, JSONB) TO service_role;
