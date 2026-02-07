-- P6.18: Metadata Ghosting
-- Adds file hash and ghosting timestamp for privacy compliance

ALTER TABLE public.bank_statements 
ADD COLUMN IF NOT EXISTS file_hash TEXT,
ADD COLUMN IF NOT EXISTS ghosted_at TIMESTAMPTZ;

-- Add index for hash lookup (Audit Proof)
CREATE INDEX IF NOT EXISTS idx_bank_statements_file_hash ON public.bank_statements(file_hash);

COMMENT ON COLUMN public.bank_statements.file_hash IS 'SHA-256 hash of the original document, stored for audit-proof verification after binary purge.';
COMMENT ON COLUMN public.bank_statements.ghosted_at IS 'Timestamp when the original sensitive binary was permanently purged from storage.';
