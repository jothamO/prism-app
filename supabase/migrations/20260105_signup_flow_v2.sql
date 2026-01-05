-- Migration: Signup Flow V2 - User Profile and Business Tables
-- Created: 2026-01-05
-- Description: Adds AI-extracted profile fields to users, creates businesses table

-- ============================================
-- USERS TABLE ADDITIONS
-- ============================================

-- Account type (personal or business)
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) DEFAULT 'personal';

-- Entity classification
ALTER TABLE users ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50);
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

-- KYC fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin VARCHAR(11);
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin_verified_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bvn VARCHAR(11);
ALTER TABLE users ADD COLUMN IF NOT EXISTS bvn_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bvn_verified_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_level INTEGER DEFAULT 0;

-- ============================================
-- BUSINESSES TABLE (NEW)
-- ============================================

CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Owner reference
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Business identity
  name TEXT NOT NULL,
  cac_number VARCHAR(20),
  cac_verified BOOLEAN DEFAULT false,
  cac_data JSONB,
  
  -- Tax identity
  tin VARCHAR(20),
  tin_verified BOOLEAN DEFAULT false,
  tin_data JSONB,
  vat_registered BOOLEAN DEFAULT false,
  
  -- Business classification
  industry_code VARCHAR(50),
  company_size VARCHAR(20), -- small, medium, large
  revenue_range VARCHAR(20), -- under_25m, 25m_100m, over_100m
  tax_category VARCHAR(50),
  
  -- Operations
  handles_project_funds BOOLEAN DEFAULT false,
  
  -- Freeform profile
  tell_us_about_business TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_users_account_type ON users(account_type);
CREATE INDEX IF NOT EXISTS idx_users_tax_category ON users(tax_category);
CREATE INDEX IF NOT EXISTS idx_users_nin ON users(nin) WHERE nin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_bvn ON users(bvn) WHERE bvn IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_businesses_owner ON businesses(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_businesses_cac ON businesses(cac_number) WHERE cac_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_businesses_tin ON businesses(tin) WHERE tin IS NOT NULL;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- Users can view their own businesses
CREATE POLICY "Users can view own businesses" ON businesses
  FOR SELECT 
  USING (owner_user_id IN (
    SELECT id FROM users WHERE auth_user_id = auth.uid()
  ));

-- Users can insert their own businesses
CREATE POLICY "Users can insert own businesses" ON businesses
  FOR INSERT 
  WITH CHECK (owner_user_id IN (
    SELECT id FROM users WHERE auth_user_id = auth.uid()
  ));

-- Users can update their own businesses
CREATE POLICY "Users can update own businesses" ON businesses
  FOR UPDATE 
  USING (owner_user_id IN (
    SELECT id FROM users WHERE auth_user_id = auth.uid()
  ));

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role full access" ON businesses
  FOR ALL 
  USING (auth.role() = 'service_role');

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_businesses_updated_at ON businesses;
CREATE TRIGGER update_businesses_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VERIFICATION
-- ============================================

-- Run these to verify migration succeeded:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'tax_category';
-- SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'businesses');
