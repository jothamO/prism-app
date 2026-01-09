-- Fix: Split the generic log_compliance_change trigger into table-specific functions
-- This avoids the "record has no field document_id" error for legal_documents table

-- Drop existing triggers that use the problematic function
DROP TRIGGER IF EXISTS trg_log_legal_documents_changes ON legal_documents;
DROP TRIGGER IF EXISTS trg_log_compliance_rules_changes ON compliance_rules;
DROP TRIGGER IF EXISTS trg_log_legal_provisions_changes ON legal_provisions;

-- Create specific trigger function for legal_documents (no document_id reference)
CREATE OR REPLACE FUNCTION public.log_legal_document_change() 
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.compliance_change_log (
        entity_type, entity_id, change_type, 
        old_values, new_values, change_reason, 
        changed_by, source_document_id
    ) VALUES (
        'document',
        COALESCE(NEW.id, OLD.id),
        LOWER(TG_OP),
        CASE WHEN TG_OP IN ('DELETE','UPDATE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        'document ' || LOWER(TG_OP) || 'd',
        auth.uid(),
        COALESCE(NEW.id, OLD.id)  -- For documents, the source IS itself
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create specific trigger function for compliance_rules and legal_provisions (HAS document_id)
CREATE OR REPLACE FUNCTION public.log_compliance_entity_change() 
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_entity_type TEXT;
BEGIN
    v_entity_type := CASE TG_TABLE_NAME
        WHEN 'compliance_rules' THEN 'rule'
        WHEN 'legal_provisions' THEN 'provision'
        ELSE TG_TABLE_NAME
    END;
    
    INSERT INTO public.compliance_change_log (
        entity_type, entity_id, change_type, 
        old_values, new_values, change_reason, 
        changed_by, source_document_id
    ) VALUES (
        v_entity_type,
        COALESCE(NEW.id, OLD.id),
        LOWER(TG_OP),
        CASE WHEN TG_OP IN ('DELETE','UPDATE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        v_entity_type || ' ' || LOWER(TG_OP) || 'd',
        auth.uid(),
        CASE WHEN TG_OP = 'DELETE' THEN OLD.document_id ELSE NEW.document_id END
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach the correct trigger to legal_documents
CREATE TRIGGER trg_log_legal_documents_changes
    AFTER INSERT OR UPDATE OR DELETE ON legal_documents
    FOR EACH ROW EXECUTE FUNCTION log_legal_document_change();

-- Attach the correct trigger to compliance_rules
CREATE TRIGGER trg_log_compliance_rules_changes  
    AFTER INSERT OR UPDATE OR DELETE ON compliance_rules
    FOR EACH ROW EXECUTE FUNCTION log_compliance_entity_change();

-- Attach the correct trigger to legal_provisions
CREATE TRIGGER trg_log_legal_provisions_changes
    AFTER INSERT OR UPDATE OR DELETE ON legal_provisions
    FOR EACH ROW EXECUTE FUNCTION log_compliance_entity_change();