-- Add PRISM impact analysis columns to legal_documents
ALTER TABLE public.legal_documents 
ADD COLUMN IF NOT EXISTS prism_impact_analysis jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS criticality text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS impact_reviewed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS impact_reviewed_at timestamptz DEFAULT NULL;

-- Add check constraint for criticality values (Tax-Specific categories)
ALTER TABLE public.legal_documents 
ADD CONSTRAINT legal_documents_criticality_check 
CHECK (criticality IS NULL OR criticality IN (
  'breaking_change',
  'rate_update', 
  'new_requirement',
  'procedural_update',
  'advisory'
));

-- Add index for filtering by criticality and review status
CREATE INDEX IF NOT EXISTS idx_legal_documents_criticality ON public.legal_documents(criticality);
CREATE INDEX IF NOT EXISTS idx_legal_documents_impact_reviewed ON public.legal_documents(impact_reviewed);

-- Add comment for documentation
COMMENT ON COLUMN public.legal_documents.prism_impact_analysis IS 'AI-generated analysis of how this document affects PRISM platform';
COMMENT ON COLUMN public.legal_documents.criticality IS 'Tax-specific criticality: breaking_change, rate_update, new_requirement, procedural_update, advisory';
COMMENT ON COLUMN public.legal_documents.impact_reviewed IS 'Whether admin has reviewed the impact analysis';
COMMENT ON COLUMN public.legal_documents.impact_reviewed_at IS 'Timestamp when impact analysis was reviewed';