-- ============================================
-- PRISM Compliance Knowledge Management System
-- Migration: 6 tables for legal document management
-- ============================================

-- Enable vector extension for embeddings (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- TABLE 1: regulatory_bodies
-- Stores government bodies that issue tax regulations
-- ============================================
CREATE TABLE IF NOT EXISTS regulatory_bodies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  previous_names TEXT[],
  website_url TEXT,
  jurisdiction TEXT,
  authority_scope TEXT[],
  contact_info JSONB,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data for Nigerian regulatory bodies
INSERT INTO regulatory_bodies (code, full_name, previous_names, jurisdiction, authority_scope) VALUES
('NRS', 'Nigeria Revenue Service', ARRAY['FIRS', 'Federal Inland Revenue Service'], 'federal', ARRAY['income_tax', 'vat', 'cgt', 'ppt', 'emtl']),
('CBN', 'Central Bank of Nigeria', NULL, 'federal', ARRAY['monetary_policy', 'banking', 'forex']),
('JRB', 'Joint Revenue Board', ARRAY['JTB', 'Joint Tax Board'], 'federal', ARRAY['tax_coordination', 'dispute_resolution']),
('SEC', 'Securities and Exchange Commission', NULL, 'federal', ARRAY['capital_markets', 'securities']),
('CAC', 'Corporate Affairs Commission', NULL, 'federal', ARRAY['company_registration', 'corporate_governance']),
('NDPR', 'Nigeria Data Protection Commission', NULL, 'federal', ARRAY['data_protection', 'privacy'])
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- TABLE 2: legal_documents
-- Stores acts, regulations, circulars, etc.
-- ============================================
CREATE TABLE IF NOT EXISTS legal_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  regulatory_body_id UUID REFERENCES regulatory_bodies(id),
  
  -- Document Metadata
  document_type TEXT NOT NULL,
  title TEXT NOT NULL,
  official_reference TEXT,
  
  -- Version Control
  version TEXT NOT NULL DEFAULT '1.0',
  supersedes_id UUID REFERENCES legal_documents(id),
  superseded_by_id UUID REFERENCES legal_documents(id),
  
  -- Status & Lifecycle
  status TEXT NOT NULL DEFAULT 'draft',
  effective_date DATE,
  publication_date DATE,
  repeal_date DATE,
  
  -- Content Storage
  original_file_url TEXT,
  extracted_text TEXT,
  structured_content JSONB,
  
  -- AI Processing
  embedding VECTOR(1536),
  summary TEXT,
  key_provisions TEXT[],
  affected_taxpayers TEXT[],
  tax_types TEXT[],
  
  -- Relationships
  amends_documents UUID[],
  related_documents UUID[],
  
  -- Metadata
  source_url TEXT,
  language TEXT DEFAULT 'en',
  tags TEXT[],
  notes TEXT,
  
  -- Audit
  uploaded_by UUID REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  review_status TEXT DEFAULT 'pending',
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legal_docs_status ON legal_documents(status, effective_date);
CREATE INDEX IF NOT EXISTS idx_legal_docs_body ON legal_documents(regulatory_body_id);
CREATE INDEX IF NOT EXISTS idx_legal_docs_type ON legal_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_legal_docs_tax_types ON legal_documents USING GIN(tax_types);

-- ============================================
-- TABLE 3: legal_provisions
-- Extracted provisions from legal documents
-- ============================================
CREATE TABLE IF NOT EXISTS legal_provisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES legal_documents(id) ON DELETE CASCADE,
  
  -- Provision Identification
  section_number TEXT,
  title TEXT,
  provision_text TEXT NOT NULL,
  
  -- Classification
  provision_type TEXT,
  applies_to TEXT[],
  tax_impact TEXT,
  
  -- AI Understanding
  plain_language_summary TEXT,
  examples JSONB,
  computation_formula TEXT,
  
  -- Effective Dates
  effective_from DATE,
  effective_to DATE,
  
  -- Relationships
  supersedes_provision_id UUID REFERENCES legal_provisions(id),
  related_provisions UUID[],
  
  -- Flags
  frequently_applicable BOOLEAN DEFAULT false,
  requires_expert_review BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provisions_document ON legal_provisions(document_id);
CREATE INDEX IF NOT EXISTS idx_provisions_type ON legal_provisions(provision_type);

-- ============================================
-- TABLE 4: compliance_rules
-- Machine-actionable rules translated from provisions
-- ============================================
CREATE TABLE IF NOT EXISTS compliance_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provision_id UUID REFERENCES legal_provisions(id),
  
  -- Rule Definition
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  
  -- Conditions (JSON logic)
  conditions JSONB,
  outcome JSONB,
  
  -- Application Context
  applies_to_transactions BOOLEAN DEFAULT false,
  applies_to_filing BOOLEAN DEFAULT false,
  applies_to_reporting BOOLEAN DEFAULT false,
  
  -- Priority & Conflict Resolution
  priority INTEGER DEFAULT 100,
  conflicts_with UUID[],
  
  -- Validation
  test_cases JSONB,
  last_validated_at TIMESTAMPTZ,
  validation_status TEXT DEFAULT 'pending',
  
  -- Lifecycle
  active BOOLEAN DEFAULT true,
  effective_from DATE,
  effective_to DATE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_rules_type ON compliance_rules(rule_type, active);

-- ============================================
-- TABLE 5: compliance_change_log
-- Track regulatory changes for notifications
-- ============================================
CREATE TABLE IF NOT EXISTS compliance_change_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- What Changed
  change_type TEXT NOT NULL,
  regulatory_body_id UUID REFERENCES regulatory_bodies(id),
  document_id UUID REFERENCES legal_documents(id),
  
  -- Change Details
  summary TEXT NOT NULL,
  detailed_changes JSONB,
  impact_assessment TEXT,
  
  -- User Communication
  notification_sent BOOLEAN DEFAULT false,
  notification_sent_at TIMESTAMPTZ,
  affected_user_count INTEGER,
  
  -- AI Model Updates
  model_update_required BOOLEAN DEFAULT false,
  model_updated_at TIMESTAMPTZ,
  
  -- Metadata
  detected_by TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_change_log_date ON compliance_change_log(created_at DESC);

-- ============================================
-- TABLE 6: regulation_relationships
-- Track complex relationships between regulations
-- ============================================
CREATE TABLE IF NOT EXISTS regulation_relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  source_document_id UUID REFERENCES legal_documents(id),
  target_document_id UUID REFERENCES legal_documents(id),
  
  relationship_type TEXT NOT NULL,
  description TEXT,
  effective_date DATE,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relationships_source ON regulation_relationships(source_document_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON regulation_relationships(relationship_type);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE regulatory_bodies ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_provisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulation_relationships ENABLE ROW LEVEL SECURITY;

-- Regulatory bodies: Public read, admin write
CREATE POLICY "Anyone can read regulatory bodies" ON regulatory_bodies FOR SELECT USING (true);
CREATE POLICY "Admins can manage regulatory bodies" ON regulatory_bodies FOR ALL USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
);

-- Legal documents: Public read active, admin manages all
CREATE POLICY "Anyone can read active legal documents" ON legal_documents FOR SELECT USING (status = 'active');
CREATE POLICY "Admins can manage legal documents" ON legal_documents FOR ALL USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
);

-- Legal provisions: Public read, admin write
CREATE POLICY "Anyone can read legal provisions" ON legal_provisions FOR SELECT USING (true);
CREATE POLICY "Admins can manage legal provisions" ON legal_provisions FOR ALL USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
);

-- Compliance rules: Public read active, admin manages all
CREATE POLICY "Anyone can read active compliance rules" ON compliance_rules FOR SELECT USING (active = true);
CREATE POLICY "Admins can manage compliance rules" ON compliance_rules FOR ALL USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
);

-- Change log: Admin only
CREATE POLICY "Admins can manage change log" ON compliance_change_log FOR ALL USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
);

-- Regulation relationships: Public read, admin write
CREATE POLICY "Anyone can read regulation relationships" ON regulation_relationships FOR SELECT USING (true);
CREATE POLICY "Admins can manage regulation relationships" ON regulation_relationships FOR ALL USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
);
