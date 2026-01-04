-- Add new columns to users table for web onboarding FIRST
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS work_status TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS income_type TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bank_setup TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS consent_given BOOLEAN DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;

-- Index for auth_user_id lookup
CREATE INDEX IF NOT EXISTS idx_users_auth_user ON public.users(auth_user_id);

-- Create telegram_auth_tokens table for secure token linking
CREATE TABLE IF NOT EXISTS public.telegram_auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  telegram_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_telegram_auth_token ON public.telegram_auth_tokens(token) WHERE used = false;
CREATE INDEX IF NOT EXISTS idx_telegram_auth_user ON public.telegram_auth_tokens(user_id);

-- Enable RLS
ALTER TABLE public.telegram_auth_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role can access (tokens are verified server-side)
DROP POLICY IF EXISTS "Service role only for telegram_auth_tokens" ON public.telegram_auth_tokens;
CREATE POLICY "Service role only for telegram_auth_tokens" 
  ON public.telegram_auth_tokens 
  FOR ALL 
  USING (false);

-- Create connected_accounts table for Mono bank accounts
CREATE TABLE IF NOT EXISTS public.connected_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mono_account_id TEXT UNIQUE NOT NULL,
  mono_code TEXT,
  account_name TEXT,
  account_number TEXT,
  bank_name TEXT,
  account_type TEXT,
  status TEXT DEFAULT 'active',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for connected_accounts
CREATE INDEX IF NOT EXISTS idx_connected_accounts_user ON public.connected_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_mono ON public.connected_accounts(mono_account_id);

-- Enable RLS
ALTER TABLE public.connected_accounts ENABLE ROW LEVEL SECURITY;

-- Users can view their own connected accounts
DROP POLICY IF EXISTS "Users can view own connected accounts" ON public.connected_accounts;
CREATE POLICY "Users can view own connected accounts" 
  ON public.connected_accounts 
  FOR SELECT 
  USING (user_id IN (
    SELECT id FROM public.users WHERE auth_user_id = auth.uid()
  ));

-- Users can insert their own connected accounts
DROP POLICY IF EXISTS "Users can insert own connected accounts" ON public.connected_accounts;
CREATE POLICY "Users can insert own connected accounts" 
  ON public.connected_accounts 
  FOR INSERT 
  WITH CHECK (user_id IN (
    SELECT id FROM public.users WHERE auth_user_id = auth.uid()
  ));

-- Update trigger for connected_accounts
DROP TRIGGER IF EXISTS update_connected_accounts_updated_at ON public.connected_accounts;
CREATE TRIGGER update_connected_accounts_updated_at
  BEFORE UPDATE ON public.connected_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();