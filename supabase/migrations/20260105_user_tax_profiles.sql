-- Phase 5 Week 4: User Tax Profiles
-- AI-assisted classification for edge cases (pensioners, diplomats, etc.)

CREATE TABLE IF NOT EXISTS user_tax_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    
    -- Basic classification
    user_type VARCHAR(50) DEFAULT 'individual', -- 'individual', 'business', 'partnership'
    employment_status VARCHAR(50), -- 'salaried', 'self_employed', 'retired', 'unemployed'
    
    -- Income types (multi-select array)
    income_types TEXT[] DEFAULT ARRAY[]::TEXT[], -- ['salary', 'pension', 'business', 'rental', 'investment', 'gratuity']
    
    -- Special statuses (AI-detected, user-confirmed)
    is_pensioner BOOLEAN DEFAULT FALSE,
    is_senior_citizen BOOLEAN DEFAULT FALSE,
    is_disabled BOOLEAN DEFAULT FALSE,
    has_diplomatic_immunity BOOLEAN DEFAULT FALSE,
    
    -- Business-specific
    industry_type VARCHAR(100),
    is_professional_services BOOLEAN DEFAULT FALSE,
    
    -- AI confidence & user confirmation
    ai_confidence DECIMAL(5,4),
    user_confirmed BOOLEAN DEFAULT FALSE,
    last_updated_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Profile corrections (training data for ML)
CREATE TABLE IF NOT EXISTS profile_corrections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- What AI predicted
    ai_prediction JSONB NOT NULL,
    
    -- What user actually is
    user_correction JSONB NOT NULL,
    
    -- Context
    signals JSONB, -- Age, keywords, patterns that led to prediction
    correction_reason TEXT,
    
    -- Training status
    used_in_training BOOLEAN DEFAULT FALSE,
    training_batch_id UUID,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_tax_profiles_user 
ON user_tax_profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_user_tax_profiles_pensioner 
ON user_tax_profiles(is_pensioner) 
WHERE is_pensioner = TRUE;

CREATE INDEX IF NOT EXISTS idx_user_tax_profiles_employment 
ON user_tax_profiles(employment_status);

CREATE INDEX IF NOT EXISTS idx_profile_corrections_training 
ON profile_corrections(used_in_training, created_at) 
WHERE NOT used_in_training;

CREATE INDEX IF NOT EXISTS idx_profile_corrections_user 
ON profile_corrections(user_id, created_at DESC);

-- Comments
COMMENT ON TABLE user_tax_profiles IS 'User tax classification profiles for applying special rules (pensioners, diplomats, etc.)';
COMMENT ON COLUMN user_tax_profiles.income_types IS 'Array of income types: salary, pension, business, rental, investment, gratuity';
COMMENT ON COLUMN user_tax_profiles.is_pensioner IS 'Receives pension income - eligible for pension exemptions per Section 31';
COMMENT ON COLUMN user_tax_profiles.has_diplomatic_immunity IS 'Diplomatic immunity - fully tax exempt per Vienna Convention';
COMMENT ON COLUMN user_tax_profiles.ai_confidence IS 'ML model confidence in profile classification (0-1)';
COMMENT ON COLUMN user_tax_profiles.user_confirmed IS 'Whether user has confirmed the AI-detected profile';

COMMENT ON TABLE profile_corrections IS 'Training data: User corrections on AI profile predictions';
