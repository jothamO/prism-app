-- =====================================================
-- V11: Structured Memory Layer
-- Replaces unstructured remembered_facts with queryable profile fields
-- =====================================================

-- Add structured profile columns to user_preferences
ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS entity_type TEXT 
    CHECK (entity_type IN ('individual', 'self_employed', 'sme', 'company')),
ADD COLUMN IF NOT EXISTS industry TEXT,
ADD COLUMN IF NOT EXISTS business_name TEXT,
ADD COLUMN IF NOT EXISTS annual_income NUMERIC,
ADD COLUMN IF NOT EXISTS registered_taxes TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS tin TEXT,
ADD COLUMN IF NOT EXISTS vat_number TEXT,
ADD COLUMN IF NOT EXISTS last_filing_date DATE,
ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'unknown'
    CHECK (risk_level IN ('low', 'medium', 'high', 'unknown')),
ADD COLUMN IF NOT EXISTS filing_frequency TEXT
    CHECK (filing_frequency IN ('monthly', 'quarterly', 'annually'));

-- Migrate entity_type from users table if set there
UPDATE public.user_preferences up 
SET entity_type = u.entity_type
FROM public.users u 
WHERE u.id = up.user_id 
  AND up.entity_type IS NULL 
  AND u.entity_type IS NOT NULL;

-- =====================================================
-- Profile Learning History - Track how profile was learned
-- =====================================================

CREATE TABLE IF NOT EXISTS public.profile_learning_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    source TEXT NOT NULL CHECK (source IN ('chat', 'onboarding', 'transaction', 'ocr', 'correction', 'manual', 'admin')),
    channel TEXT CHECK (channel IN ('web', 'telegram', 'whatsapp', 'api')),
    confidence NUMERIC DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying user's profile history
CREATE INDEX IF NOT EXISTS idx_profile_learning_user 
    ON public.profile_learning_log(user_id, created_at DESC);

-- RLS
ALTER TABLE public.profile_learning_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile learning" ON public.profile_learning_log;
CREATE POLICY "Users can view own profile learning"
    ON public.profile_learning_log FOR SELECT
    USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Service role can manage profile learning" ON public.profile_learning_log;
CREATE POLICY "Service role can manage profile learning"
    ON public.profile_learning_log FOR ALL
    USING (auth.role() = 'service_role');

-- =====================================================
-- Helper function to update profile with logging
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_user_profile(
    p_user_id UUID,
    p_field TEXT,
    p_value TEXT,
    p_source TEXT DEFAULT 'chat',
    p_channel TEXT DEFAULT NULL,
    p_confidence NUMERIC DEFAULT 1.0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_old_value TEXT;
BEGIN
    -- Get current value
    EXECUTE format('SELECT %I::text FROM user_preferences WHERE user_id = $1', p_field)
    INTO v_old_value
    USING p_user_id;
    
    -- Log the change
    INSERT INTO profile_learning_log (user_id, field_name, old_value, new_value, source, channel, confidence)
    VALUES (p_user_id, p_field, v_old_value, p_value, p_source, p_channel, p_confidence);
    
    -- Update the preference (upsert)
    INSERT INTO user_preferences (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
    
    -- Set the field value
    EXECUTE format('UPDATE user_preferences SET %I = $1 WHERE user_id = $2', p_field)
    USING p_value, p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_profile(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_profile(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC) TO service_role;

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON COLUMN public.user_preferences.entity_type IS 'User type: individual (PAYE), self_employed (freelancer), sme (small business), company';
COMMENT ON COLUMN public.user_preferences.registered_taxes IS 'Array of tax types user is registered for: VAT, CIT, PAYE, WHT, etc';
COMMENT ON COLUMN public.user_preferences.risk_level IS 'AI-assessed compliance risk level based on filing history';
COMMENT ON TABLE public.profile_learning_log IS 'Audit trail of how user profile was learned/updated';