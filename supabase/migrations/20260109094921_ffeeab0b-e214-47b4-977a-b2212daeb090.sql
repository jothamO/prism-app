-- Fix legal_documents status constraint to include processing states
-- Drop the old constraint
ALTER TABLE legal_documents 
DROP CONSTRAINT IF EXISTS legal_documents_status_check;

-- Add the updated constraint with all required statuses
ALTER TABLE legal_documents 
ADD CONSTRAINT legal_documents_status_check 
CHECK (status = ANY (ARRAY[
  'pending'::text,
  'processing'::text,
  'processing_failed'::text,
  'active'::text,
  'superseded'::text,
  'repealed'::text,
  'archived'::text
]));