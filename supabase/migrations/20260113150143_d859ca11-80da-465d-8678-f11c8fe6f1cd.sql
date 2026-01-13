-- Document Processing Jobs - Add API-related columns
-- Uses existing processing_status column instead of status

-- Add api_key_id column if needed
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
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'document_processing_jobs' AND column_name = 'webhook_sent'
    ) THEN
        ALTER TABLE document_processing_jobs 
        ADD COLUMN webhook_sent BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Index for API key lookups
CREATE INDEX IF NOT EXISTS idx_doc_jobs_api_key ON document_processing_jobs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_doc_jobs_processing_status ON document_processing_jobs(processing_status) WHERE processing_status = 'pending';

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
        DATE(au.created_at) as date,
        COUNT(*) as request_count,
        AVG(au.response_time_ms)::NUMERIC as avg_response_ms,
        COUNT(*) FILTER (WHERE au.status_code >= 400) as error_count
    FROM api_usage au
    WHERE au.api_key_id = p_key_id
      AND au.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(au.created_at)
    ORDER BY date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing policy if exists then recreate
DROP POLICY IF EXISTS doc_jobs_owner ON document_processing_jobs;

CREATE POLICY doc_jobs_owner ON document_processing_jobs
    FOR ALL USING (
        user_id = auth.uid() OR
        api_key_id IN (SELECT id FROM api_keys WHERE user_id = auth.uid())
    );