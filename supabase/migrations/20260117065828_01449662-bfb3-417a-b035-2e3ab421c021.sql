-- Drop old constraint
ALTER TABLE public.code_change_proposals 
DROP CONSTRAINT IF EXISTS code_change_proposals_status_check;

-- Add new constraint with needs_revision
ALTER TABLE public.code_change_proposals 
ADD CONSTRAINT code_change_proposals_status_check_v2 
CHECK (status IN ('pending', 'approved', 'rejected', 'implemented', 'needs_revision'));

-- Add revision columns
ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS revision_notes TEXT;

ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS revision_count INTEGER DEFAULT 0;