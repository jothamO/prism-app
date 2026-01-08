-- Phase 10 & 11: Profile sync trigger and code change proposals

-- Create code_change_proposals table for AI-suggested code changes
CREATE TABLE public.code_change_proposals (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    rule_id UUID REFERENCES public.compliance_rules(id) ON DELETE SET NULL,
    change_log_id UUID REFERENCES public.compliance_change_log(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    affected_files TEXT[] NOT NULL DEFAULT '{}',
    code_diff JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'implemented')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    generated_by TEXT DEFAULT 'ai',
    reviewed_by UUID,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    implemented_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.code_change_proposals ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can manage code proposals" ON public.code_change_proposals
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Create index for efficient queries
CREATE INDEX idx_code_proposals_status ON public.code_change_proposals(status);
CREATE INDEX idx_code_proposals_rule_id ON public.code_change_proposals(rule_id);
CREATE INDEX idx_code_proposals_created_at ON public.code_change_proposals(created_at DESC);

-- Add trigger for updated_at
CREATE TRIGGER update_code_proposals_updated_at
    BEFORE UPDATE ON public.code_change_proposals
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Phase 10: Create function to sync profiles when rules change
CREATE OR REPLACE FUNCTION public.notify_profile_rule_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    affected_rule RECORD;
BEGIN
    -- When a compliance rule changes, log which profiles might need updates
    IF TG_OP = 'UPDATE' OR TG_OP = 'INSERT' THEN
        -- Check if this affects tax calculations (rate changes, threshold changes)
        IF NEW.rule_type IN ('tax_band', 'vat_rate', 'threshold', 'relief', 'emtl') THEN
            -- Insert notification for admins about potential profile recalculations
            INSERT INTO public.compliance_notifications (
                user_id,
                notification_type,
                title,
                message,
                severity,
                metadata
            )
            SELECT DISTINCT
                ur.user_id,
                'rule_change',
                'Tax Rule Updated: ' || NEW.rule_name,
                'A tax rule affecting your calculations has been updated. Your tax estimates may change.',
                CASE 
                    WHEN NEW.rule_type IN ('tax_band', 'vat_rate') THEN 'high'
                    ELSE 'medium'
                END,
                jsonb_build_object(
                    'rule_id', NEW.id,
                    'rule_type', NEW.rule_type,
                    'rule_name', NEW.rule_name
                )
            FROM public.user_roles ur
            WHERE ur.role = 'admin'
            LIMIT 5; -- Only notify first 5 admins
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger for rule changes
DROP TRIGGER IF EXISTS trigger_notify_profile_rule_changes ON public.compliance_rules;
CREATE TRIGGER trigger_notify_profile_rule_changes
    AFTER INSERT OR UPDATE ON public.compliance_rules
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_profile_rule_changes();

-- Phase 13: Add rule version tracking for ML models
ALTER TABLE public.ml_models 
    ADD COLUMN IF NOT EXISTS rule_version_hash TEXT,
    ADD COLUMN IF NOT EXISTS rules_snapshot JSONB;

-- Create function to capture rules snapshot when training
CREATE OR REPLACE FUNCTION public.capture_rules_for_ml_training()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    rules_snapshot JSONB;
BEGIN
    SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'rule_code', rule_code,
        'rule_name', rule_name,
        'rule_type', rule_type,
        'parameters', parameters,
        'version', version,
        'effective_from', effective_from
    ))
    INTO rules_snapshot
    FROM public.compliance_rules
    WHERE is_active = true;
    
    RETURN COALESCE(rules_snapshot, '[]'::jsonb);
END;
$$;

-- Refresh the materialized view
REFRESH MATERIALIZED VIEW active_tax_rules;