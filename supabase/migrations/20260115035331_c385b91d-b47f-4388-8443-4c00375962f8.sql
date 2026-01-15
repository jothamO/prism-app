-- Add multi-part columns to legal_documents
ALTER TABLE public.legal_documents 
ADD COLUMN IF NOT EXISTS is_multi_part BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS total_parts INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS parts_received INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS processing_strategy TEXT DEFAULT 'single';

-- Add check constraint for processing_strategy
ALTER TABLE public.legal_documents 
ADD CONSTRAINT legal_documents_processing_strategy_check 
CHECK (processing_strategy IN ('single', 'sequential', 'parallel'));

-- Create document_parts table
CREATE TABLE IF NOT EXISTS public.document_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_document_id UUID NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
    part_number INTEGER NOT NULL,
    part_title TEXT,
    file_url TEXT,
    raw_text TEXT,
    status TEXT DEFAULT 'pending',
    provisions_count INTEGER DEFAULT 0,
    rules_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    UNIQUE(parent_document_id, part_number)
);

-- Add check constraint for status
ALTER TABLE public.document_parts 
ADD CONSTRAINT document_parts_status_check 
CHECK (status IN ('pending', 'processing', 'processed', 'failed'));

-- Add source_part_id to legal_provisions for traceability
ALTER TABLE public.legal_provisions 
ADD COLUMN IF NOT EXISTS source_part_id UUID REFERENCES public.document_parts(id) ON DELETE SET NULL;

-- Add source_part_id to compliance_rules for traceability
ALTER TABLE public.compliance_rules 
ADD COLUMN IF NOT EXISTS source_part_id UUID REFERENCES public.document_parts(id) ON DELETE SET NULL;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_document_parts_parent ON public.document_parts(parent_document_id);
CREATE INDEX IF NOT EXISTS idx_document_parts_status ON public.document_parts(status);
CREATE INDEX IF NOT EXISTS idx_legal_provisions_source_part ON public.legal_provisions(source_part_id);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_source_part ON public.compliance_rules(source_part_id);

-- Enable RLS on document_parts
ALTER TABLE public.document_parts ENABLE ROW LEVEL SECURITY;

-- RLS policies for document_parts (admins only)
CREATE POLICY "Admins can view document parts" ON public.document_parts
    FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert document parts" ON public.document_parts
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update document parts" ON public.document_parts
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete document parts" ON public.document_parts
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_document_parts_updated_at
    BEFORE UPDATE ON public.document_parts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE public.document_parts IS 'Stores individual parts of multi-part legal documents for large regulations split across multiple files';
COMMENT ON COLUMN public.document_parts.part_number IS 'Sequential order of this part within the parent document';
COMMENT ON COLUMN public.document_parts.status IS 'Processing status: pending, processing, processed, failed';
COMMENT ON COLUMN public.legal_documents.is_multi_part IS 'Whether this document is split into multiple parts';
COMMENT ON COLUMN public.legal_documents.processing_strategy IS 'How to process parts: single (default), sequential, or parallel';