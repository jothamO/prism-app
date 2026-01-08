-- Add is_active column to regulatory_bodies for soft-delete support
ALTER TABLE regulatory_bodies 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add realtime support for legal_documents to enable live counter updates
ALTER PUBLICATION supabase_realtime ADD TABLE legal_documents;