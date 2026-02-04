-- Migration 1b: Agent Security, Action History, and Structured Memory
-- All remaining schema changes after 'owner' enum was committed

-- =====================================================
-- PART 1: Security Breach Tracking
-- =====================================================

-- Add security columns to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS breach_count INTEGER DEFAULT 0;

-- Create Security Breach Logs table
CREATE TABLE IF NOT EXISTS public.security_breach_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    breach_type TEXT NOT NULL,
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    prompt_snippet TEXT,
    mitigation_action TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.security_breach_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_security_breach_user ON public.security_breach_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_flagged ON public.users(is_flagged) WHERE is_flagged = true;

CREATE POLICY "Admins/Owners can view all breach logs"
    ON public.security_breach_logs FOR SELECT
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Users can view their own breach logs (transparency)"
    ON public.security_breach_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role manages breach logs"
    ON public.security_breach_logs FOR ALL
    USING (auth.role() = 'service_role');

COMMENT ON TABLE public.security_breach_logs IS 'Logs unauthorized AI probes and prompt injections for the 3-Strike Rule';
COMMENT ON COLUMN public.users.is_flagged IS 'True if user is locked out of AI features due to security breaches';

-- =====================================================
-- PART 2: Agent Action History & Review Queue
-- =====================================================

CREATE TABLE IF NOT EXISTS public.agent_action_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    perception_data JSONB NOT NULL,
    reasoning_path TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_payload JSONB NOT NULL,
    confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    status TEXT NOT NULL CHECK (status IN ('pending', 'executed', 'failed', 'review_required', 'rejected')),
    error_log TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_review_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_log_id UUID NOT NULL REFERENCES public.agent_action_logs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    user_feedback TEXT,
    reviewed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.agent_action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_review_queue ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_agent_logs_user ON public.agent_action_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_cycle ON public.agent_action_logs(cycle_id);
CREATE INDEX IF NOT EXISTS idx_agent_review_user ON public.agent_review_queue(user_id, status);

CREATE POLICY "Users can view their own agent logs"
    ON public.agent_action_logs FOR SELECT
    USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Users can view their own review items"
    ON public.agent_review_queue FOR SELECT
    USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Users can update their own review status"
    ON public.agent_review_queue FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role manages agent operations"
    ON public.agent_action_logs FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role manages review queue"
    ON public.agent_review_queue FOR ALL
    USING (auth.role() = 'service_role');

CREATE TRIGGER update_agent_action_logs_updated_at
    BEFORE UPDATE ON public.agent_action_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.agent_action_logs IS 'Audit trail for the PRISM Agent Perception-Reasoning-Action loop';
COMMENT ON TABLE public.agent_review_queue IS 'Queue for Tier 3/4 agent proposals requiring user approval';

-- =====================================================
-- PART 3: Atomic Facts (PARA Structured Memory)
-- =====================================================

DO $$ BEGIN
    CREATE TYPE public.para_layer AS ENUM ('project', 'area', 'resource', 'archive');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.atomic_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    layer para_layer NOT NULL DEFAULT 'area',
    entity_name TEXT NOT NULL,
    fact_content JSONB NOT NULL,
    source_metadata JSONB DEFAULT '{}',
    confidence NUMERIC(3,2) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
    is_superseded BOOLEAN DEFAULT false,
    superseded_by_id UUID REFERENCES public.atomic_facts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.atomic_facts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_atomic_facts_user ON public.atomic_facts(user_id, layer);
CREATE INDEX IF NOT EXISTS idx_atomic_facts_entity ON public.atomic_facts(user_id, entity_name);
CREATE INDEX IF NOT EXISTS idx_atomic_facts_active ON public.atomic_facts(user_id) WHERE NOT is_superseded;

CREATE POLICY "Users can view their own atomic facts"
    ON public.atomic_facts FOR SELECT
    USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Service role manages atomic facts"
    ON public.atomic_facts FOR ALL
    USING (auth.role() = 'service_role');

CREATE TRIGGER update_atomic_facts_updated_at
    BEFORE UPDATE ON public.atomic_facts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE VIEW public.active_user_knowledge AS
SELECT 
    user_id,
    layer,
    entity_name,
    fact_content,
    confidence,
    created_at
FROM public.atomic_facts
WHERE NOT is_superseded;

COMMENT ON TABLE public.atomic_facts IS 'Durable AI knowledge base following the PARA structure';
COMMENT ON VIEW public.active_user_knowledge IS 'Helper view for agent context building, showing only current (non-superseded) facts';