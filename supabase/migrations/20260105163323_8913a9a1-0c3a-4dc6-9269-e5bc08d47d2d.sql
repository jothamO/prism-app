-- Signup Flow V2: AI-Extracted Profile Fields (Fixed)
-- Add columns to users and businesses tables for enhanced profile data

-- ============================================
-- USERS TABLE - Add Missing Columns
-- ============================================

-- Account type (personal or business)
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) DEFAULT 'personal';

-- Classification fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_category VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT;

-- Freeform profile
ALTER TABLE users ADD COLUMN IF NOT EXISTS tell_us_about_yourself TEXT;

-- Income source flags (from AI extraction)
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_business_income BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_salary_income BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_freelance_income BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_pension_income BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_rental_income BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_investment_income BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS informal_business BOOLEAN DEFAULT false;

-- AI extraction confidence (0.0 - 1.0)
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_confidence DECIMAL(3,2);

-- KYC verification fields (nin already exists)
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin_verified_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bvn VARCHAR(11);
ALTER TABLE users ADD COLUMN IF NOT EXISTS bvn_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bvn_verified_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_level INTEGER DEFAULT 0;

-- ============================================
-- BUSINESSES TABLE - Add New Columns
-- ============================================

-- Owner reference (new, alongside existing user_id) - NO FK constraint to avoid orphan issues
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS owner_user_id UUID;

-- Populate owner_user_id ONLY for user_ids that exist in users table
UPDATE businesses b 
SET owner_user_id = b.user_id 
WHERE b.owner_user_id IS NULL 
  AND b.user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = b.user_id);

-- CAC number (new, alongside existing cac_registration_number)
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS cac_number VARCHAR(20);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS cac_verified BOOLEAN DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS cac_data JSONB;

-- Sync cac_number from cac_registration_number if exists
UPDATE businesses SET cac_number = cac_registration_number WHERE cac_number IS NULL AND cac_registration_number IS NOT NULL;

-- TIN verification fields (tin already exists)
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tin_verified BOOLEAN DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tin_data JSONB;

-- Business classification
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS industry_code VARCHAR(50);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS company_size VARCHAR(20);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS revenue_range VARCHAR(20);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tax_category VARCHAR(50);

-- Operations
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS handles_project_funds BOOLEAN DEFAULT false;

-- Freeform profile
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tell_us_about_business TEXT;

-- ============================================
-- INDEXES
-- ============================================

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_account_type ON users(account_type);
CREATE INDEX IF NOT EXISTS idx_users_tax_category ON users(tax_category);
CREATE INDEX IF NOT EXISTS idx_users_nin ON users(nin) WHERE nin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_bvn ON users(bvn) WHERE bvn IS NOT NULL;

-- Businesses indexes
CREATE INDEX IF NOT EXISTS idx_businesses_owner ON businesses(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_businesses_cac ON businesses(cac_number) WHERE cac_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_businesses_tin ON businesses(tin) WHERE tin IS NOT NULL;

-- ============================================
-- TRIGGER FOR UPDATED_AT
-- ============================================

DROP TRIGGER IF EXISTS update_businesses_updated_at ON businesses;
CREATE TRIGGER update_businesses_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();