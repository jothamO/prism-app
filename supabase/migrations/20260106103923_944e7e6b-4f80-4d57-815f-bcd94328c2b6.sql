-- =====================================================
-- PRISM Compliance Knowledge System - Database Schema
-- Version: 1.0.0
-- =====================================================

-- Table: regulatory_bodies
CREATE TABLE IF NOT EXISTS public.regulatory_bodies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    abbreviation TEXT NOT NULL,
    jurisdiction TEXT DEFAULT 'Federal',
    website_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.regulatory_bodies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regulatory_bodies_read_policy" ON public.regulatory_bodies
    FOR SELECT USING (true);

CREATE POLICY "regulatory_bodies_insert_policy" ON public.regulatory_bodies
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "regulatory_bodies_update_policy" ON public.regulatory_bodies
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "regulatory_bodies_delete_policy" ON public.regulatory_bodies
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Table: legal_documents
CREATE TABLE IF NOT EXISTS public.legal_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN (
        'act', 'regulation', 'circular', 'notice', 'guideline', 
        'ruling', 'amendment', 'gazette', 'order', 'directive'
    )),
    regulatory_body_id UUID REFERENCES public.regulatory_bodies(id),
    document_number TEXT,
    effective_date DATE,
    publication_date DATE,
    expiry_date DATE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'repealed', 'pending')),
    summary TEXT,
    key_provisions TEXT[],
    affected_taxpayers TEXT[],
    tax_types TEXT[],
    file_url TEXT,
    source_url TEXT,
    raw_text TEXT,
    ai_summary TEXT,
    needs_human_review BOOLEAN DEFAULT false,
    review_notes TEXT,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_documents_read_policy" ON public.legal_documents
    FOR SELECT USING (true);

CREATE POLICY "legal_documents_insert_policy" ON public.legal_documents
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "legal_documents_update_policy" ON public.legal_documents
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "legal_documents_delete_policy" ON public.legal_documents
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_legal_documents_type ON public.legal_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_legal_documents_status ON public.legal_documents(status);
CREATE INDEX IF NOT EXISTS idx_legal_documents_effective_date ON public.legal_documents(effective_date);
CREATE INDEX IF NOT EXISTS idx_legal_documents_regulatory_body ON public.legal_documents(regulatory_body_id);

-- Table: legal_provisions
CREATE TABLE IF NOT EXISTS public.legal_provisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
    section_number TEXT,
    title TEXT,
    content TEXT NOT NULL,
    provision_type TEXT CHECK (provision_type IN (
        'definition', 'obligation', 'exemption', 'rate', 
        'penalty', 'procedure', 'deadline', 'relief', 'power', 'general'
    )),
    tax_implications TEXT,
    affected_entities TEXT[],
    compliance_actions TEXT[],
    related_provisions UUID[],
    keywords TEXT[],
    ai_interpretation TEXT,
    confidence_score NUMERIC(3,2),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.legal_provisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_provisions_read_policy" ON public.legal_provisions
    FOR SELECT USING (true);

CREATE POLICY "legal_provisions_insert_policy" ON public.legal_provisions
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "legal_provisions_update_policy" ON public.legal_provisions
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "legal_provisions_delete_policy" ON public.legal_provisions
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_legal_provisions_document ON public.legal_provisions(document_id);
CREATE INDEX IF NOT EXISTS idx_legal_provisions_type ON public.legal_provisions(provision_type);
CREATE INDEX IF NOT EXISTS idx_legal_provisions_keywords ON public.legal_provisions USING gin(keywords);

-- Table: compliance_rules
CREATE TABLE IF NOT EXISTS public.compliance_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provision_id UUID REFERENCES public.legal_provisions(id) ON DELETE SET NULL,
    document_id UUID REFERENCES public.legal_documents(id) ON DELETE CASCADE,
    rule_code TEXT UNIQUE,
    rule_name TEXT NOT NULL,
    description TEXT,
    rule_type TEXT NOT NULL CHECK (rule_type IN (
        'filing_deadline', 'payment_deadline', 'rate_application',
        'threshold_check', 'exemption_eligibility', 'penalty_calculation',
        'documentation_requirement', 'registration_requirement', 'reporting_requirement'
    )),
    conditions JSONB,
    actions JSONB,
    parameters JSONB,
    applies_to TEXT[],
    tax_types TEXT[],
    effective_from DATE,
    effective_to DATE,
    priority INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    previous_version_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.compliance_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compliance_rules_read_policy" ON public.compliance_rules
    FOR SELECT USING (true);

CREATE POLICY "compliance_rules_insert_policy" ON public.compliance_rules
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "compliance_rules_update_policy" ON public.compliance_rules
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "compliance_rules_delete_policy" ON public.compliance_rules
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_compliance_rules_type ON public.compliance_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_active ON public.compliance_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_tax_types ON public.compliance_rules USING gin(tax_types);

-- Table: compliance_change_log
CREATE TABLE IF NOT EXISTS public.compliance_change_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    change_type TEXT NOT NULL CHECK (change_type IN ('created', 'updated', 'deactivated', 'superseded')),
    changed_by UUID,
    change_reason TEXT,
    old_values JSONB,
    new_values JSONB,
    source_document_id UUID REFERENCES public.legal_documents(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.compliance_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compliance_change_log_read_policy" ON public.compliance_change_log
    FOR SELECT USING (true);

CREATE POLICY "compliance_change_log_insert_policy" ON public.compliance_change_log
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_compliance_change_log_entity ON public.compliance_change_log(entity_type, entity_id);

-- Table: regulation_relationships
CREATE TABLE IF NOT EXISTS public.regulation_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_document_id UUID NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
    target_document_id UUID NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL CHECK (relationship_type IN (
        'amends', 'supersedes', 'references', 'implements', 
        'conflicts_with', 'clarifies', 'extends'
    )),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_document_id, target_document_id, relationship_type)
);

ALTER TABLE public.regulation_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regulation_relationships_read_policy" ON public.regulation_relationships
    FOR SELECT USING (true);

CREATE POLICY "regulation_relationships_insert_policy" ON public.regulation_relationships
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "regulation_relationships_update_policy" ON public.regulation_relationships
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "regulation_relationships_delete_policy" ON public.regulation_relationships
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Seed data: Nigerian regulatory bodies
INSERT INTO public.regulatory_bodies (name, abbreviation, jurisdiction, website_url)
VALUES 
    ('Federal Inland Revenue Service', 'FIRS', 'Federal', 'https://firs.gov.ng'),
    ('Nigeria Customs Service', 'NCS', 'Federal', 'https://customs.gov.ng'),
    ('Joint Tax Board', 'JTB', 'Federal', 'https://jtb.gov.ng'),
    ('National Assembly', 'NASS', 'Federal', 'https://nass.gov.ng'),
    ('Ministry of Finance', 'FMoF', 'Federal', 'https://finance.gov.ng'),
    ('Central Bank of Nigeria', 'CBN', 'Federal', 'https://cbn.gov.ng')
ON CONFLICT (name) DO NOTHING;

-- Update trigger function
CREATE OR REPLACE FUNCTION update_compliance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS update_regulatory_bodies_updated_at ON public.regulatory_bodies;
CREATE TRIGGER update_regulatory_bodies_updated_at
    BEFORE UPDATE ON public.regulatory_bodies
    FOR EACH ROW EXECUTE FUNCTION update_compliance_updated_at();

DROP TRIGGER IF EXISTS update_legal_documents_updated_at ON public.legal_documents;
CREATE TRIGGER update_legal_documents_updated_at
    BEFORE UPDATE ON public.legal_documents
    FOR EACH ROW EXECUTE FUNCTION update_compliance_updated_at();

DROP TRIGGER IF EXISTS update_legal_provisions_updated_at ON public.legal_provisions;
CREATE TRIGGER update_legal_provisions_updated_at
    BEFORE UPDATE ON public.legal_provisions
    FOR EACH ROW EXECUTE FUNCTION update_compliance_updated_at();

DROP TRIGGER IF EXISTS update_compliance_rules_updated_at ON public.compliance_rules;
CREATE TRIGGER update_compliance_rules_updated_at
    BEFORE UPDATE ON public.compliance_rules
    FOR EACH ROW EXECUTE FUNCTION update_compliance_updated_at();