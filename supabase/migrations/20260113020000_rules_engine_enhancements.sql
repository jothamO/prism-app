-- Phase 4: Rules Engine Enhancements
-- Adds sector-specific rules, versioning for rollback, and conflict detection

-- 1. Add sector column for industry-specific rules
ALTER TABLE compliance_rules 
ADD COLUMN IF NOT EXISTS sector TEXT DEFAULT 'all';

-- Add check constraint for valid sectors
ALTER TABLE compliance_rules 
ADD CONSTRAINT compliance_rules_sector_check 
CHECK (sector IN ('all', 'agriculture', 'petroleum', 'manufacturing', 'banking', 'telecom', 'technology', 'healthcare', 'education', 'construction', 'retail'));

-- Index for sector queries
CREATE INDEX IF NOT EXISTS idx_compliance_rules_sector ON compliance_rules(sector);

-- 2. Rule versions table for rollback capability
CREATE TABLE IF NOT EXISTS rule_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1,
    parameters JSONB NOT NULL,
    actions JSONB,
    changed_by UUID REFERENCES users(id),
    change_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_current BOOLEAN DEFAULT TRUE,
    snapshot JSONB -- Full rule state at this version
);

-- Ensure only one current version per rule
CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_versions_current 
ON rule_versions(rule_id) WHERE is_current = TRUE;

-- Index for fast version lookups
CREATE INDEX IF NOT EXISTS idx_rule_versions_rule ON rule_versions(rule_id, version_number DESC);

-- 3. Function to detect conflicting rules
CREATE OR REPLACE FUNCTION check_rule_conflicts(
    p_rule_code TEXT,
    p_rule_type TEXT,
    p_effective_from DATE,
    p_effective_to DATE,
    p_sector TEXT DEFAULT 'all',
    p_exclude_id UUID DEFAULT NULL
) RETURNS TABLE(
    conflict_id UUID,
    conflict_code TEXT,
    conflict_type TEXT,
    overlap_start DATE,
    overlap_end DATE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cr.id,
        cr.rule_code,
        'date_overlap'::TEXT,
        GREATEST(p_effective_from, cr.effective_from::DATE) as overlap_start,
        LEAST(COALESCE(p_effective_to, '9999-12-31'::DATE), COALESCE(cr.effective_to::DATE, '9999-12-31'::DATE)) as overlap_end
    FROM compliance_rules cr
    WHERE cr.rule_type = p_rule_type
      AND cr.is_active = TRUE
      AND (cr.sector = p_sector OR cr.sector = 'all' OR p_sector = 'all')
      AND (p_exclude_id IS NULL OR cr.id != p_exclude_id)
      AND (
          -- Check date overlap
          (p_effective_from IS NULL OR cr.effective_to IS NULL OR p_effective_from <= cr.effective_to::DATE)
          AND (p_effective_to IS NULL OR cr.effective_from IS NULL OR p_effective_to >= cr.effective_from::DATE)
      )
      -- Exclude same rule code (updating existing rule)
      AND cr.rule_code != p_rule_code;
END;
$$ LANGUAGE plpgsql;

-- 4. Function to create a new version before updating
CREATE OR REPLACE FUNCTION create_rule_version() RETURNS TRIGGER AS $$
DECLARE
    v_version_number INTEGER;
BEGIN
    -- Only version on significant changes
    IF OLD.parameters IS DISTINCT FROM NEW.parameters 
       OR OLD.actions IS DISTINCT FROM NEW.actions 
       OR OLD.effective_from IS DISTINCT FROM NEW.effective_from
       OR OLD.effective_to IS DISTINCT FROM NEW.effective_to THEN
        
        -- Get next version number
        SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_number
        FROM rule_versions 
        WHERE rule_id = OLD.id;
        
        -- Mark old versions as not current
        UPDATE rule_versions SET is_current = FALSE WHERE rule_id = OLD.id;
        
        -- Insert new version with snapshot
        INSERT INTO rule_versions (
            rule_id, 
            version_number, 
            parameters, 
            actions,
            changed_by,
            change_reason,
            is_current,
            snapshot
        ) VALUES (
            OLD.id,
            v_version_number,
            NEW.parameters,
            NEW.actions,
            auth.uid(),
            'Rule updated',
            TRUE,
            jsonb_build_object(
                'rule_code', NEW.rule_code,
                'rule_name', NEW.rule_name,
                'rule_type', NEW.rule_type,
                'parameters', NEW.parameters,
                'actions', NEW.actions,
                'effective_from', NEW.effective_from,
                'effective_to', NEW.effective_to,
                'sector', NEW.sector,
                'priority', NEW.priority
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for versioning
DROP TRIGGER IF EXISTS trg_version_rule ON compliance_rules;
CREATE TRIGGER trg_version_rule
    BEFORE UPDATE ON compliance_rules
    FOR EACH ROW
    EXECUTE FUNCTION create_rule_version();

-- 5. Function to rollback to a previous version
CREATE OR REPLACE FUNCTION rollback_rule_to_version(
    p_rule_id UUID,
    p_version_number INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_snapshot JSONB;
BEGIN
    -- Get the snapshot from the target version
    SELECT snapshot INTO v_snapshot
    FROM rule_versions
    WHERE rule_id = p_rule_id AND version_number = p_version_number;
    
    IF v_snapshot IS NULL THEN
        RAISE EXCEPTION 'Version % not found for rule %', p_version_number, p_rule_id;
    END IF;
    
    -- Update the rule with the snapshot data
    UPDATE compliance_rules SET
        parameters = v_snapshot->'parameters',
        actions = v_snapshot->'actions',
        effective_from = (v_snapshot->>'effective_from')::TIMESTAMPTZ,
        effective_to = (v_snapshot->>'effective_to')::TIMESTAMPTZ,
        sector = v_snapshot->>'sector',
        priority = (v_snapshot->>'priority')::INTEGER
    WHERE id = p_rule_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RLS policies for rule_versions
ALTER TABLE rule_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY rule_versions_select_policy ON rule_versions
    FOR SELECT USING (TRUE);

CREATE POLICY rule_versions_insert_policy ON rule_versions
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    );

-- Grant access
GRANT SELECT ON rule_versions TO authenticated;
GRANT INSERT ON rule_versions TO authenticated;

COMMENT ON TABLE rule_versions IS 'Tracks all versions of compliance rules for audit and rollback';
COMMENT ON FUNCTION check_rule_conflicts IS 'Detects conflicting rules based on date overlap and sector';
COMMENT ON FUNCTION rollback_rule_to_version IS 'Rolls back a rule to a specific version number';
