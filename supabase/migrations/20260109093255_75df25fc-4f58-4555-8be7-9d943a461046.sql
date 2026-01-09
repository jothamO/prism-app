-- =====================================================
-- Trigger function to log all compliance-related changes
-- =====================================================
CREATE OR REPLACE FUNCTION public.log_compliance_change()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_entity_type TEXT;
    v_source_doc_id UUID;
BEGIN
    -- Determine entity type based on table name
    v_entity_type := CASE TG_TABLE_NAME
        WHEN 'compliance_rules' THEN 'rule'
        WHEN 'legal_documents' THEN 'document'
        WHEN 'legal_provisions' THEN 'provision'
        ELSE TG_TABLE_NAME
    END;
    
    -- Get source document ID if available
    v_source_doc_id := CASE 
        WHEN TG_TABLE_NAME = 'compliance_rules' AND TG_OP != 'DELETE' THEN NEW.document_id
        WHEN TG_TABLE_NAME = 'legal_provisions' AND TG_OP != 'DELETE' THEN NEW.document_id
        WHEN TG_TABLE_NAME = 'compliance_rules' AND TG_OP = 'DELETE' THEN OLD.document_id
        WHEN TG_TABLE_NAME = 'legal_provisions' AND TG_OP = 'DELETE' THEN OLD.document_id
        ELSE NULL
    END;

    INSERT INTO public.compliance_change_log (
        entity_type,
        entity_id,
        change_type,
        old_values,
        new_values,
        change_reason,
        changed_by,
        source_document_id
    ) VALUES (
        v_entity_type,
        COALESCE(NEW.id, OLD.id),
        LOWER(TG_OP),
        CASE WHEN TG_OP IN ('DELETE', 'UPDATE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        CASE TG_OP
            WHEN 'INSERT' THEN v_entity_type || ' created'
            WHEN 'UPDATE' THEN v_entity_type || ' updated'
            WHEN 'DELETE' THEN v_entity_type || ' deleted'
        END,
        auth.uid(),
        v_source_doc_id
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- =====================================================
-- Attach triggers to compliance tables
-- =====================================================

-- Trigger for compliance_rules
DROP TRIGGER IF EXISTS trg_log_compliance_rules_changes ON public.compliance_rules;
CREATE TRIGGER trg_log_compliance_rules_changes
    AFTER INSERT OR UPDATE OR DELETE ON public.compliance_rules
    FOR EACH ROW EXECUTE FUNCTION public.log_compliance_change();

-- Trigger for legal_documents
DROP TRIGGER IF EXISTS trg_log_legal_documents_changes ON public.legal_documents;
CREATE TRIGGER trg_log_legal_documents_changes
    AFTER INSERT OR UPDATE OR DELETE ON public.legal_documents
    FOR EACH ROW EXECUTE FUNCTION public.log_compliance_change();

-- Trigger for legal_provisions
DROP TRIGGER IF EXISTS trg_log_legal_provisions_changes ON public.legal_provisions;
CREATE TRIGGER trg_log_legal_provisions_changes
    AFTER INSERT OR UPDATE OR DELETE ON public.legal_provisions
    FOR EACH ROW EXECUTE FUNCTION public.log_compliance_change();

-- =====================================================
-- Code proposal queue table for async processing
-- =====================================================
CREATE TABLE IF NOT EXISTS public.code_proposal_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES public.compliance_rules(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    triggered_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.code_proposal_queue ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can manage code proposal queue"
    ON public.code_proposal_queue
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'));

-- Index for processing
CREATE INDEX IF NOT EXISTS idx_code_proposal_queue_status 
    ON public.code_proposal_queue(status) WHERE status = 'pending';

-- =====================================================
-- Trigger to queue code proposals when tax rules activate
-- =====================================================
CREATE OR REPLACE FUNCTION public.queue_code_proposal_on_rule_activation()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Only trigger when a relevant rule type is activated
    IF NEW.is_active = true 
       AND (OLD.is_active = false OR OLD.is_active IS NULL)
       AND NEW.rule_type IN ('tax_rate', 'threshold', 'tax_band', 'relief', 'vat_rate', 'emtl') THEN
        
        INSERT INTO public.code_proposal_queue (rule_id, status)
        VALUES (NEW.id, 'pending');
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_code_proposal ON public.compliance_rules;
CREATE TRIGGER trg_queue_code_proposal
    AFTER UPDATE ON public.compliance_rules
    FOR EACH ROW EXECUTE FUNCTION public.queue_code_proposal_on_rule_activation();