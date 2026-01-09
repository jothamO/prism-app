-- Fix: Update trigger functions to use correct change_type values
-- The constraint allows: 'created', 'updated', 'deactivated', 'superseded'
-- PostgreSQL TG_OP produces: 'INSERT', 'UPDATE', 'DELETE'

-- Update the legal_document trigger function with correct change_type mapping
CREATE OR REPLACE FUNCTION public.log_legal_document_change() 
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_change_type TEXT;
BEGIN
    v_change_type := CASE TG_OP
        WHEN 'INSERT' THEN 'created'
        WHEN 'UPDATE' THEN 'updated'
        WHEN 'DELETE' THEN 'deactivated'
        ELSE LOWER(TG_OP)
    END;
    
    INSERT INTO public.compliance_change_log (
        entity_type, entity_id, change_type, 
        old_values, new_values, change_reason, 
        changed_by, source_document_id
    ) VALUES (
        'document',
        COALESCE(NEW.id, OLD.id),
        v_change_type,
        CASE WHEN TG_OP IN ('DELETE','UPDATE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        'document ' || v_change_type,
        auth.uid(),
        COALESCE(NEW.id, OLD.id)
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Update the compliance entity trigger function with correct change_type mapping
CREATE OR REPLACE FUNCTION public.log_compliance_entity_change() 
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_entity_type TEXT;
    v_change_type TEXT;
BEGIN
    v_entity_type := CASE TG_TABLE_NAME
        WHEN 'compliance_rules' THEN 'rule'
        WHEN 'legal_provisions' THEN 'provision'
        ELSE TG_TABLE_NAME
    END;
    
    v_change_type := CASE TG_OP
        WHEN 'INSERT' THEN 'created'
        WHEN 'UPDATE' THEN 'updated'
        WHEN 'DELETE' THEN 'deactivated'
        ELSE LOWER(TG_OP)
    END;
    
    INSERT INTO public.compliance_change_log (
        entity_type, entity_id, change_type, 
        old_values, new_values, change_reason, 
        changed_by, source_document_id
    ) VALUES (
        v_entity_type,
        COALESCE(NEW.id, OLD.id),
        v_change_type,
        CASE WHEN TG_OP IN ('DELETE','UPDATE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        v_entity_type || ' ' || v_change_type,
        auth.uid(),
        CASE WHEN TG_OP = 'DELETE' THEN OLD.document_id ELSE NEW.document_id END
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;