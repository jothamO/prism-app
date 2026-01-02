-- Create chatbot_sessions table for Gateway
CREATE TABLE IF NOT EXISTS chatbot_sessions (
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, platform)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_updated 
  ON chatbot_sessions(updated_at DESC);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_chatbot_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chatbot_sessions_updated_at
  BEFORE UPDATE ON chatbot_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_chatbot_sessions_updated_at();
