-- =====================================================
-- Phase 6.12: Agent Security & RBAC Extensions
-- Implements the 3-Strike Breach Policy and 'owner' role
-- =====================================================

-- 1. Extend app_role with 'owner'
-- Note: ALTER TYPE ... ADD VALUE cannot be executed in a transaction block
-- In Supabase migrations, we usually rely on the environment's handling.
DO $$ BEGIN
    ALTER TYPE public.app_role ADD VALUE 'owner';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add security headers to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS breach_count INTEGER DEFAULT 0;

-- 3. Create Security Breach Logs table
CREATE TABLE IF NOT EXISTS public.security_breach_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    breach_type TEXT NOT NULL, -- 'prompt_injection', 'unauthorized_access', 'data_probe'
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    prompt_snippet TEXT,
    mitigation_action TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable RLS
ALTER TABLE public.security_breach_logs ENABLE ROW LEVEL SECURITY;

-- 5. Indexes for performance and monitoring
CREATE INDEX IF NOT EXISTS idx_security_breach_user ON public.security_breach_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_flagged ON public.users(is_flagged) WHERE is_flagged = true;

-- 6. RLS Policies
CREATE POLICY "Admins/Owners can view all breach logs"
    ON public.security_breach_logs FOR SELECT
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Users can view their own breach logs (transparency)"
    ON public.security_breach_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role manages breach logs"
    ON public.security_breach_logs FOR ALL
    USING (auth.role() = 'service_role');

-- 7. Update has_role triggers/functions if necessary
-- The existing has_role function uses the user_roles table, which 
-- uses the app_role enum, so it should handle 'owner' automatically.

COMMENT ON TABLE public.security_breach_logs IS 'Logs unauthorized AI probes and prompt injections for the 3-Strike Rule';
COMMENT ON COLUMN public.users.is_flagged IS 'True if user is locked out of AI features due to security breaches';
