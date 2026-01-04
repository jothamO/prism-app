-- Migration: Add adaptive profile columns to onboarding_progress
-- Supports new user types and rich profile extraction

-- Add extended entity types and profile columns
ALTER TABLE onboarding_progress 
ADD COLUMN IF NOT EXISTS occupation TEXT,
ADD COLUMN IF NOT EXISTS income_source TEXT,
ADD COLUMN IF NOT EXISTS age_group TEXT,
ADD COLUMN IF NOT EXISTS employment_status TEXT,
ADD COLUMN IF NOT EXISTS tax_category TEXT,
ADD COLUMN IF NOT EXISTS tax_category_reason TEXT,
ADD COLUMN IF NOT EXISTS extracted_profile JSONB DEFAULT '{}'::jsonb;

-- Add index for querying by tax category
CREATE INDEX IF NOT EXISTS idx_onboarding_tax_category ON onboarding_progress(tax_category);

-- Add index for querying by entity type with new types
CREATE INDEX IF NOT EXISTS idx_onboarding_entity_type ON onboarding_progress(((data->>'entityType')::text));

-- Comment on new columns
COMMENT ON COLUMN onboarding_progress.occupation IS 'User occupation extracted from onboarding (e.g., student, banker, trader)';
COMMENT ON COLUMN onboarding_progress.income_source IS 'Primary income source: salary, business, freelance, pension, allowance, none';
COMMENT ON COLUMN onboarding_progress.age_group IS 'Age group: youth, adult, senior';
COMMENT ON COLUMN onboarding_progress.employment_status IS 'Employment status: employed, self_employed, unemployed, retired, student, corper';
COMMENT ON COLUMN onboarding_progress.tax_category IS 'Nigerian tax category: paye, self_assessment, company_tax, exempt, withholding';
COMMENT ON COLUMN onboarding_progress.tax_category_reason IS 'AI reasoning for tax category determination';
COMMENT ON COLUMN onboarding_progress.extracted_profile IS 'Full extracted profile JSON from AI analysis';

-- Update the users table to store tax profile summary
ALTER TABLE users
ADD COLUMN IF NOT EXISTS tax_profile_summary JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS primary_tax_category TEXT;

COMMENT ON COLUMN users.tax_profile_summary IS 'Summary of user tax profile from onboarding';
COMMENT ON COLUMN users.primary_tax_category IS 'Primary tax category for quick filtering';

-- Create an index for tax category queries on users
CREATE INDEX IF NOT EXISTS idx_users_tax_category ON users(primary_tax_category);
