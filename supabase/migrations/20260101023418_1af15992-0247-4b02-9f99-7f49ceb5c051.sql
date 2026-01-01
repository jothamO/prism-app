-- Add verification metadata columns to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS verification_status VARCHAR DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS verification_source VARCHAR,
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS verification_data JSONB;

-- Add verification columns to related_parties table
ALTER TABLE public.related_parties 
ADD COLUMN IF NOT EXISTS tin_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS verification_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS verification_data JSONB;

-- Add index for verification status lookups
CREATE INDEX IF NOT EXISTS idx_users_verification_status ON public.users(verification_status);
CREATE INDEX IF NOT EXISTS idx_related_parties_tin_verified ON public.related_parties(tin_verified);