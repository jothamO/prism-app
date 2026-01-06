-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Add embedding columns for semantic search
ALTER TABLE public.legal_documents 
ADD COLUMN IF NOT EXISTS embedding vector(1536);

ALTER TABLE public.legal_provisions 
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create indexes for vector similarity search
CREATE INDEX IF NOT EXISTS idx_legal_documents_embedding 
ON public.legal_documents 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_legal_provisions_embedding 
ON public.legal_provisions 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Table: compliance_notifications
-- Purpose: Store regulatory change notifications for users
CREATE TABLE IF NOT EXISTS public.compliance_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    document_id UUID REFERENCES public.legal_documents(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES public.compliance_rules(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL CHECK (notification_type IN (
        'new_regulation', 'amendment', 'deadline_reminder', 
        'rate_change', 'threshold_update', 'expiring_exemption'
    )),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    action_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.compliance_notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "compliance_notifications_user_read" ON public.compliance_notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "compliance_notifications_user_update" ON public.compliance_notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- System/admins can insert notifications
CREATE POLICY "compliance_notifications_admin_insert" ON public.compliance_notifications
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_compliance_notifications_user ON public.compliance_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_notifications_unread ON public.compliance_notifications(user_id, is_read) WHERE is_read = false;

-- Table: user_compliance_preferences
-- Purpose: Track which regulations users want to be notified about
CREATE TABLE IF NOT EXISTS public.user_compliance_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    tax_types TEXT[] DEFAULT '{}',
    notify_new_regulations BOOLEAN DEFAULT true,
    notify_amendments BOOLEAN DEFAULT true,
    notify_deadlines BOOLEAN DEFAULT true,
    notify_rate_changes BOOLEAN DEFAULT true,
    email_notifications BOOLEAN DEFAULT true,
    in_app_notifications BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_compliance_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_compliance_preferences_user_access" ON public.user_compliance_preferences
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Function to search documents by semantic similarity
CREATE OR REPLACE FUNCTION search_compliance_documents(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    title text,
    document_type text,
    summary text,
    similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ld.id,
        ld.title,
        ld.document_type,
        ld.summary,
        1 - (ld.embedding <=> query_embedding) as similarity
    FROM legal_documents ld
    WHERE ld.embedding IS NOT NULL
      AND 1 - (ld.embedding <=> query_embedding) > match_threshold
    ORDER BY ld.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Function to search provisions by semantic similarity
CREATE OR REPLACE FUNCTION search_compliance_provisions(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 20
)
RETURNS TABLE (
    id uuid,
    document_id uuid,
    section_number text,
    title text,
    content text,
    provision_type text,
    similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        lp.id,
        lp.document_id,
        lp.section_number,
        lp.title,
        lp.content,
        lp.provision_type,
        1 - (lp.embedding <=> query_embedding) as similarity
    FROM legal_provisions lp
    WHERE lp.embedding IS NOT NULL
      AND 1 - (lp.embedding <=> query_embedding) > match_threshold
    ORDER BY lp.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;