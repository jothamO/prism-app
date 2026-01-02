-- Create chatbot_sessions table for Gateway
-- Uses TEXT for user_id because it stores platform-specific IDs (phone numbers, telegram IDs)
CREATE TABLE IF NOT EXISTS public.chatbot_sessions (
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, platform)
);

-- Index for faster lookups by updated_at
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_updated 
  ON public.chatbot_sessions(updated_at DESC);

-- Auto-update updated_at timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_chatbot_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the trigger
DROP TRIGGER IF EXISTS chatbot_sessions_updated_at ON public.chatbot_sessions;
CREATE TRIGGER chatbot_sessions_updated_at
  BEFORE UPDATE ON public.chatbot_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chatbot_sessions_updated_at();

-- Enable RLS (Gateway uses service role key to bypass, but still good practice)
ALTER TABLE public.chatbot_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can manage chatbot sessions via dashboard
-- (Gateway bypasses RLS with service role key)
CREATE POLICY "Admins can manage chatbot sessions" ON public.chatbot_sessions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));