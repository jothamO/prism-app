-- Document Processing Events Table for tracking granular processing status
-- This table stores all processing events for complete history and diagnostics

CREATE TABLE public.document_processing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
    part_id UUID REFERENCES public.document_parts(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('started', 'stage_started', 'stage_completed', 'completed', 'failed', 'retried', 'warning')),
    stage TEXT CHECK (stage IN ('upload', 'text_extraction', 'ocr', 'provision_extraction', 'rules_extraction', 'summary_generation', 'prism_impact', 'deduplication', 'finalization')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'skipped')),
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_processing_events_document_id ON public.document_processing_events(document_id);
CREATE INDEX idx_processing_events_part_id ON public.document_processing_events(part_id);
CREATE INDEX idx_processing_events_created_at ON public.document_processing_events(created_at DESC);
CREATE INDEX idx_processing_events_event_type ON public.document_processing_events(event_type);

-- Enable RLS
ALTER TABLE public.document_processing_events ENABLE ROW LEVEL SECURITY;

-- Admins can view all processing events
CREATE POLICY "Admins can view processing events"
ON public.document_processing_events
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Service role can insert processing events (from edge functions)
CREATE POLICY "Service role can insert processing events"
ON public.document_processing_events
FOR INSERT
WITH CHECK (true);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_processing_events;

-- Add processing metadata columns to legal_documents if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_documents' AND column_name = 'processing_started_at') THEN
        ALTER TABLE public.legal_documents ADD COLUMN processing_started_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_documents' AND column_name = 'processing_completed_at') THEN
        ALTER TABLE public.legal_documents ADD COLUMN processing_completed_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_documents' AND column_name = 'current_processing_stage') THEN
        ALTER TABLE public.legal_documents ADD COLUMN current_processing_stage TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_documents' AND column_name = 'processing_progress') THEN
        ALTER TABLE public.legal_documents ADD COLUMN processing_progress INTEGER DEFAULT 0;
    END IF;
END $$;

-- Comments for documentation
COMMENT ON TABLE public.document_processing_events IS 'Stores granular processing events for document processing history and diagnostics';
COMMENT ON COLUMN public.document_processing_events.event_type IS 'Type of event: started, stage_started, stage_completed, completed, failed, retried, warning';
COMMENT ON COLUMN public.document_processing_events.stage IS 'Processing stage this event relates to';
COMMENT ON COLUMN public.document_processing_events.details IS 'Additional data like error messages, counts, timing, AI confidence scores';