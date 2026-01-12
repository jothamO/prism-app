-- Chat messages table for conversation history
-- Used by Telegram/WhatsApp gateways to maintain context

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL DEFAULT 'telegram' CHECK (platform IN ('web', 'telegram', 'whatsapp')),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching recent messages per user
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_time 
ON chat_messages(user_id, created_at DESC);

-- Index for platform-specific queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_platform 
ON chat_messages(platform, created_at DESC);

-- Auto-cleanup old messages (keep last 30 days)
-- This can be run periodically via cron
COMMENT ON TABLE chat_messages IS 'Stores chat history for Telegram/WhatsApp conversation context. Auto-cleanup recommended after 30 days.';
