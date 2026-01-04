-- Phase 1: Adaptive Onboarding Profile Columns
ALTER TABLE onboarding_progress 
ADD COLUMN IF NOT EXISTS occupation TEXT,
ADD COLUMN IF NOT EXISTS income_source TEXT,
ADD COLUMN IF NOT EXISTS age_group TEXT,
ADD COLUMN IF NOT EXISTS employment_status TEXT,
ADD COLUMN IF NOT EXISTS tax_category TEXT,
ADD COLUMN IF NOT EXISTS tax_category_reason TEXT,
ADD COLUMN IF NOT EXISTS extracted_profile JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_onboarding_tax_category ON onboarding_progress(tax_category);

-- Phase 2: Profile Learning System
CREATE TABLE IF NOT EXISTS profile_learning_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    field_name TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    reason TEXT,
    confidence NUMERIC(3,2),
    source TEXT NOT NULL DEFAULT 'transaction_pattern',
    transaction_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_history_user ON profile_learning_history(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_history_created ON profile_learning_history(created_at DESC);

ALTER TABLE onboarding_progress
ADD COLUMN IF NOT EXISTS pattern_metrics JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS profile_confidence NUMERIC(3,2) DEFAULT 0.50,
ADD COLUMN IF NOT EXISTS last_learning_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS income_sources_detected TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_onboarding_confidence ON onboarding_progress(profile_confidence);

-- Phase 3: User Tax Profile Summary Columns
ALTER TABLE users
ADD COLUMN IF NOT EXISTS tax_profile_summary JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS primary_tax_category TEXT;

CREATE INDEX IF NOT EXISTS idx_users_tax_category ON users(primary_tax_category);

-- Phase 4: Profile Confidence Trend Function
CREATE OR REPLACE FUNCTION public.get_profile_confidence_trend(p_user_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
    date DATE,
    avg_confidence NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        DATE(plh.created_at) as date,
        AVG(plh.confidence)::NUMERIC as avg_confidence
    FROM profile_learning_history plh
    WHERE plh.user_id = p_user_id
      AND plh.created_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY DATE(plh.created_at)
    ORDER BY date;
END;
$$;

-- Phase 5: RLS for Profile Learning History
ALTER TABLE profile_learning_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile history"
ON profile_learning_history FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "System can insert profile history"
ON profile_learning_history FOR INSERT
WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE profile_learning_history IS 'Tracks changes to user profiles learned from transaction patterns';
COMMENT ON COLUMN onboarding_progress.profile_confidence IS 'Confidence score (0-1) of the learned profile';
COMMENT ON COLUMN onboarding_progress.income_sources_detected IS 'Array of income sources detected from transactions';
COMMENT ON COLUMN users.tax_profile_summary IS 'Summary of user tax profile for quick lookups';
COMMENT ON COLUMN users.primary_tax_category IS 'Primary tax category (employed, self_employed, pensioner, etc)';