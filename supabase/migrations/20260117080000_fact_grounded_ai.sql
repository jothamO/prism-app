-- =====================================================
-- V9: Fact-Grounded AI Schema
-- Ensures all tax rules are traceable to source documents
-- =====================================================

-- =====================================================
-- 1. Add document_priority to legal_documents
-- Constitution > Act > Finance Act > Circular
-- =====================================================

ALTER TABLE public.legal_documents 
ADD COLUMN IF NOT EXISTS document_priority INTEGER DEFAULT 5;

COMMENT ON COLUMN public.legal_documents.document_priority IS 
  '1=Constitution, 2=Act of Parliament, 3=Finance Act, 4=FIRS Public Notice, 5=Circular, 6=Practice Note';

-- Update priorities for existing document types
UPDATE public.legal_documents SET document_priority = 1 WHERE document_type = 'constitution';
UPDATE public.legal_documents SET document_priority = 2 WHERE document_type IN ('act', 'primary_legislation');
UPDATE public.legal_documents SET document_priority = 3 WHERE document_type IN ('finance_act', 'amendment');
UPDATE public.legal_documents SET document_priority = 4 WHERE document_type IN ('public_notice', 'gazette');
UPDATE public.legal_documents SET document_priority = 5 WHERE document_type IN ('circular', 'information_circular');
UPDATE public.legal_documents SET document_priority = 6 WHERE document_type IN ('practice_note', 'guidance');

-- =====================================================
-- 2. Enhance compliance_rules with source traceability
-- =====================================================

-- Source document reference (will make NOT NULL after backfill)
ALTER TABLE public.compliance_rules 
ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES public.legal_documents(id);

-- Section reference from document
ALTER TABLE public.compliance_rules 
ADD COLUMN IF NOT EXISTS section_reference TEXT;

-- AI extraction confidence (0.00 to 1.00)
ALTER TABLE public.compliance_rules 
ADD COLUMN IF NOT EXISTS extraction_confidence DECIMAL(3,2) DEFAULT 1.00;

-- Rule lifecycle - expiration
ALTER TABLE public.compliance_rules 
ADD COLUMN IF NOT EXISTS expiration_date DATE;

-- Rule lifecycle - supersession chain
ALTER TABLE public.compliance_rules 
ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES public.compliance_rules(id);

ALTER TABLE public.compliance_rules 
ADD COLUMN IF NOT EXISTS supersedes UUID REFERENCES public.compliance_rules(id);

-- User eligibility criteria (JSON)
ALTER TABLE public.compliance_rules 
ADD COLUMN IF NOT EXISTS eligibility_criteria JSONB DEFAULT '{}';

-- Create index for document lookups
CREATE INDEX IF NOT EXISTS idx_compliance_rules_document 
ON public.compliance_rules(document_id);

-- Create index for active rules
CREATE INDEX IF NOT EXISTS idx_compliance_rules_expiration 
ON public.compliance_rules(expiration_date) 
WHERE expiration_date IS NOT NULL;

-- Comments
COMMENT ON COLUMN public.compliance_rules.document_id IS 'Source legal document this rule was extracted from';
COMMENT ON COLUMN public.compliance_rules.section_reference IS 'Section/paragraph reference e.g. "Section 23(1)(c)"';
COMMENT ON COLUMN public.compliance_rules.extraction_confidence IS 'AI confidence in rule extraction (0.00-1.00)';
COMMENT ON COLUMN public.compliance_rules.expiration_date IS 'Date when this rule stops applying (for temporary/sunset rules)';
COMMENT ON COLUMN public.compliance_rules.superseded_by IS 'ID of rule that replaced this one';
COMMENT ON COLUMN public.compliance_rules.eligibility_criteria IS 'JSON criteria for which users this rule applies to';

-- =====================================================
-- 3. Create calculation_audit_log table
-- Tracks which rules were applied in each calculation
-- =====================================================

CREATE TABLE IF NOT EXISTS public.calculation_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    tax_type TEXT NOT NULL,
    calculation_type TEXT NOT NULL, -- 'vat', 'cit', 'wht', 'stamp_duty', etc.
    input_values JSONB NOT NULL,
    rules_applied JSONB NOT NULL DEFAULT '[]',
    result JSONB NOT NULL,
    result_amount DECIMAL(15,2),
    calculated_at TIMESTAMPTZ DEFAULT now(),
    session_id TEXT, -- For grouping related calculations
    channel TEXT -- 'web', 'telegram', 'whatsapp', 'api'
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_calc_audit_user ON public.calculation_audit_log(user_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_calc_audit_type ON public.calculation_audit_log(tax_type, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_calc_audit_session ON public.calculation_audit_log(session_id);

-- Enable RLS
ALTER TABLE public.calculation_audit_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own calculations
CREATE POLICY "Users can view own calculations"
ON public.calculation_audit_log FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR user_id IN (
    SELECT id FROM public.users WHERE auth_user_id = auth.uid()
));

-- Admins can view all
CREATE POLICY "Admins can view all calculations"
ON public.calculation_audit_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Service role full access
CREATE POLICY "Service role full access to audit log"
ON public.calculation_audit_log FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.calculation_audit_log IS 'Audit trail of all tax calculations with rules applied';

-- =====================================================
-- 4. Function to get active rules for a tax type
-- Only returns rules that are not expired and have source docs
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_active_rules_for_type(p_rule_type TEXT)
RETURNS TABLE(
    id UUID,
    rule_code TEXT,
    rule_name TEXT,
    rule_value JSONB,
    section_reference TEXT,
    document_title TEXT,
    document_priority INTEGER,
    extraction_confidence DECIMAL
)
LANGUAGE sql
STABLE
AS $$
    SELECT 
        cr.id,
        cr.rule_code,
        cr.rule_name,
        cr.rule_value,
        cr.section_reference,
        ld.title as document_title,
        ld.document_priority,
        cr.extraction_confidence
    FROM public.compliance_rules cr
    LEFT JOIN public.legal_documents ld ON cr.document_id = ld.id
    WHERE cr.rule_type = p_rule_type
      AND cr.is_active = true
      AND (cr.expiration_date IS NULL OR cr.expiration_date > CURRENT_DATE)
      AND cr.superseded_by IS NULL
    ORDER BY ld.document_priority ASC, cr.extraction_confidence DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_rules_for_type(TEXT) TO service_role;

-- =====================================================
-- 5. Function to flag rules expiring soon
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_expiring_rules(p_days_ahead INTEGER DEFAULT 30)
RETURNS TABLE(
    id UUID,
    rule_code TEXT,
    rule_name TEXT,
    expiration_date DATE,
    days_until_expiration INTEGER,
    document_title TEXT
)
LANGUAGE sql
STABLE
AS $$
    SELECT 
        cr.id,
        cr.rule_code,
        cr.rule_name,
        cr.expiration_date,
        (cr.expiration_date - CURRENT_DATE)::INTEGER as days_until_expiration,
        ld.title as document_title
    FROM public.compliance_rules cr
    LEFT JOIN public.legal_documents ld ON cr.document_id = ld.id
    WHERE cr.expiration_date IS NOT NULL
      AND cr.expiration_date > CURRENT_DATE
      AND cr.expiration_date <= CURRENT_DATE + (p_days_ahead || ' days')::INTERVAL
      AND cr.superseded_by IS NULL
    ORDER BY cr.expiration_date ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_expiring_rules(INTEGER) TO authenticated;

-- =====================================================
-- 6. Update code_change_proposals to require source
-- =====================================================

ALTER TABLE public.code_change_proposals
ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES public.legal_documents(id);

ALTER TABLE public.code_change_proposals
ADD COLUMN IF NOT EXISTS source_verification JSONB DEFAULT '{}';

COMMENT ON COLUMN public.code_change_proposals.source_document_id IS 'Legal document that triggered this proposal';
COMMENT ON COLUMN public.code_change_proposals.source_verification IS 'Verification info: document name, section, confidence';
