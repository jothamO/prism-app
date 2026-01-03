-- Phase 4: Enhanced Onboarding (from 005_enhanced_onboarding.sql)
-- Add business context fields for better ML and tax assistance

-- Add business stage tracking to businesses table
ALTER TABLE public.businesses 
ADD COLUMN IF NOT EXISTS account_setup VARCHAR(20) CHECK (account_setup IN ('mixed', 'separate', 'multiple')),
ADD COLUMN IF NOT EXISTS receives_capital_support BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS capital_source VARCHAR(50) CHECK (capital_source IN ('family', 'investors', 'loan', 'bootstrapped', 'grant')),
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Add user preferences to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS insight_frequency VARCHAR(20) DEFAULT 'weekly' CHECK (insight_frequency IN ('daily', 'weekly', 'monthly', 'never')),
ADD COLUMN IF NOT EXISTS auto_categorize BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"email": true, "whatsapp": true, "telegram": false}'::jsonb;

-- Create onboarding_progress table for tracking incomplete onboardings
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    business_id UUID,
    current_step INTEGER DEFAULT 1,
    total_steps INTEGER DEFAULT 8,
    completed_steps JSONB DEFAULT '[]'::jsonb,
    data JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed BOOLEAN DEFAULT FALSE,
    
    UNIQUE(user_id, business_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_businesses_account_setup ON businesses(account_setup);
CREATE INDEX IF NOT EXISTS idx_businesses_capital ON businesses(receives_capital_support, capital_source);
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_user ON onboarding_progress(user_id) WHERE completed = FALSE;

-- Trigger for updated_at
CREATE OR REPLACE TRIGGER update_onboarding_progress_updated_at
    BEFORE UPDATE ON onboarding_progress
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own onboarding progress"
ON public.onboarding_progress FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can manage their own onboarding progress"
ON public.onboarding_progress FOR ALL
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all onboarding progress"
ON public.onboarding_progress FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Comments
COMMENT ON COLUMN businesses.account_setup IS 'How user manages accounts: mixed (personal+business), separate, multiple';
COMMENT ON COLUMN businesses.receives_capital_support IS 'Whether business receives external capital (family, investors, loans)';
COMMENT ON COLUMN businesses.capital_source IS 'Primary source of capital: family, investors, loan, bootstrapped, grant';
COMMENT ON COLUMN users.insight_frequency IS 'How often user wants tax/business insights: daily, weekly, monthly, never';
COMMENT ON COLUMN users.auto_categorize IS 'Whether to auto-categorize transactions using ML (default: true)';
COMMENT ON TABLE onboarding_progress IS 'Tracks incomplete onboarding sessions for resumption';