-- Add processing_started_at to track stuck parts
ALTER TABLE document_parts 
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;