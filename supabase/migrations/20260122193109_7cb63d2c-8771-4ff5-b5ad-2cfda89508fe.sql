-- Migration: Complete all missing migration components
-- V1: User Preferences (20260113003000_user_preferences.sql)
-- V2: API Documents (20260113160000_api_documents.sql)  
-- V3: Calculation Audit Log (20260117080000_fact_grounded_ai.sql - missing table)

-- 1. User Preferences Table
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    insight_frequency VARCHAR(20) DEFAULT 'weekly' 
      CHECK (insight_frequency IN ('daily', 'weekly', 'monthly', 'never')),
    auto_categorize BOOLEAN DEFAULT TRUE,
    notification_preferences JSONB DEFAULT '{"email": true, "whatsapp": true, "telegram": false}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences"
ON public.user_preferences FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own preferences"
ON public.user_preferences FOR ALL
USING (auth.uid() = user_id);

-- 2. API Documents Table
CREATE TABLE IF NOT EXISTS public.api_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id TEXT,
    title TEXT NOT NULL,
    content TEXT,
    document_type VARCHAR(50),
    source_url TEXT,
    processed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_documents_status ON api_documents(status);
CREATE INDEX IF NOT EXISTS idx_api_documents_type ON api_documents(document_type);

-- 3. Calculation Audit Log (completes fact-grounded AI traceability)
CREATE TABLE IF NOT EXISTS public.calculation_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calculation_id UUID NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    business_id UUID REFERENCES businesses(id),
    calculation_type VARCHAR(50) NOT NULL,
    input_data JSONB NOT NULL,
    output_data JSONB NOT NULL,
    rules_applied UUID[] DEFAULT '{}',
    rules_metadata JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON calculation_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_business ON calculation_audit_log(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_type ON calculation_audit_log(calculation_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON calculation_audit_log(created_at DESC);

COMMENT ON TABLE calculation_audit_log IS 
  'Tracks which compliance rules were applied in each tax calculation for fact-grounded AI traceability';
COMMENT ON COLUMN calculation_audit_log.rules_applied IS 
  'Array of compliance_rule IDs that were used in this calculation';
COMMENT ON COLUMN calculation_audit_log.rules_metadata IS 
  'Snapshot of rule details at calculation time including source document references';