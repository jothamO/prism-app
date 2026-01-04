-- Migration: Add profile learning tables and columns
-- Tracks profile changes, pattern metrics, and learning history

-- Add profile history tracking table
CREATE TABLE IF NOT EXISTS profile_learning_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    reason TEXT,
    confidence NUMERIC(3,2),
    source TEXT NOT NULL DEFAULT 'transaction_pattern', -- 'transaction_pattern', 'user_correction', 'manual_update'
    transaction_id UUID, -- Optional reference to triggering transaction
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying user's profile history
CREATE INDEX IF NOT EXISTS idx_profile_history_user ON profile_learning_history(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_history_created ON profile_learning_history(created_at DESC);

-- Add pattern tracking columns to onboarding_progress if not exists
ALTER TABLE onboarding_progress
ADD COLUMN IF NOT EXISTS pattern_metrics JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS profile_confidence NUMERIC(3,2) DEFAULT 0.50,
ADD COLUMN IF NOT EXISTS last_learning_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS income_sources_detected TEXT[] DEFAULT '{}';

-- Create index for confidence queries
CREATE INDEX IF NOT EXISTS idx_onboarding_confidence ON onboarding_progress(profile_confidence);

-- Add correction tracking to transactions table (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'transactions') THEN
        ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS original_classification TEXT,
        ADD COLUMN IF NOT EXISTS was_corrected BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS corrected_by_user BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS correction_reason TEXT;
    END IF;
END $$;

-- Comments
COMMENT ON TABLE profile_learning_history IS 'Tracks all changes to user profiles from learning system';
COMMENT ON COLUMN onboarding_progress.pattern_metrics IS 'Accumulated pattern metrics from transaction analysis';
COMMENT ON COLUMN onboarding_progress.profile_confidence IS 'Current confidence score in user profile accuracy (0.50-0.99)';
COMMENT ON COLUMN onboarding_progress.income_sources_detected IS 'Array of income sources detected from transactions';

-- Function to get user profile confidence trend
CREATE OR REPLACE FUNCTION get_profile_confidence_trend(p_user_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
    date DATE,
    avg_confidence NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        DATE(created_at) as date,
        AVG(confidence)::NUMERIC as avg_confidence
    FROM profile_learning_history
    WHERE user_id = p_user_id
      AND created_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY DATE(created_at)
    ORDER BY date;
END;
$$ LANGUAGE plpgsql;
