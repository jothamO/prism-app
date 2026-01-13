-- Document Processing Jobs table for API
-- Tracks document upload and OCR processing status

-- Add api_key_id column to existing table if needed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'document_processing_jobs' AND column_name = 'api_key_id'
    ) THEN
        ALTER TABLE document_processing_jobs 
        ADD COLUMN api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'document_processing_jobs' AND column_name = 'webhook_url'
    ) THEN
        ALTER TABLE document_processing_jobs 
        ADD COLUMN webhook_url TEXT;
    END IF;
END $$;

-- If table doesn't exist, create it
CREATE TABLE IF NOT EXISTS document_processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    file_url TEXT NOT NULL,
    file_type TEXT,
    document_type TEXT DEFAULT 'auto',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    result JSONB,
    error TEXT,
    webhook_url TEXT,
    webhook_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Index for API key lookups
CREATE INDEX IF NOT EXISTS idx_doc_jobs_api_key ON document_processing_jobs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_doc_jobs_status ON document_processing_jobs(status) WHERE status = 'pending';

-- Function to get API usage stats
CREATE OR REPLACE FUNCTION get_api_usage_stats(p_key_id UUID)
RETURNS TABLE(
    date DATE,
    request_count BIGINT,
    avg_response_ms NUMERIC,
    error_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        DATE(created_at) as date,
        COUNT(*) as request_count,
        AVG(response_time_ms)::NUMERIC as avg_response_ms,
        COUNT(*) FILTER (WHERE status_code >= 400) as error_count
    FROM api_usage
    WHERE api_key_id = p_key_id
      AND created_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(created_at)
    ORDER BY date DESC;
END;
$$ LANGUAGE plpgsql;

-- RLS policy for document_processing_jobs
ALTER TABLE document_processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_jobs_owner ON document_processing_jobs
    FOR ALL USING (
        user_id = auth.uid() OR
        api_key_id IN (SELECT id FROM api_keys WHERE user_id = auth.uid())
    );

GRANT ALL ON document_processing_jobs TO authenticated;
