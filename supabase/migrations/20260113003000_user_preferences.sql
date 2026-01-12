-- User preferences for AI memory (Clawd-inspired approach)
-- Stores durable facts about users, not full conversations

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    preferred_name TEXT,
    communication_style TEXT DEFAULT 'friendly' CHECK (communication_style IN ('formal', 'friendly', 'casual')),
    remembered_facts JSONB DEFAULT '[]'::jsonb,
    income_estimate NUMERIC,
    last_chat_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);

-- Trigger to update timestamp on changes
CREATE OR REPLACE FUNCTION update_user_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_preferences_updated
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_user_preferences_timestamp();

-- Comment for documentation
COMMENT ON TABLE user_preferences IS 'Stores durable user facts for AI personalization (Clawd-style memory)';
COMMENT ON COLUMN user_preferences.remembered_facts IS 'JSON array of extracted facts, e.g. ["has freelance income", "files quarterly"]';
