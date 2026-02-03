-- =====================================================
-- Phase 6.12: Agent Action History & Review Queue
-- Tracks the Perception-Reasoning-Action cycles
-- =====================================================

-- 1. Agent Action Logs
-- Stores the thinking process and resulting actions
CREATE TABLE IF NOT EXISTS public.agent_action_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL, -- Logical grouping for one full loop
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- AI Context & Reasoning
    perception_data JSONB NOT NULL, -- Snapshot of what the agent "saw"
    reasoning_path TEXT NOT NULL,   -- The "Chain of Thought" or logic used
    
    -- Action Details
    action_type TEXT NOT NULL,      -- e.g., 'draft_tax_filing', 'transaction_split'
    action_payload JSONB NOT NULL,  -- The data intended for the action
    
    -- Execution State
    confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    status TEXT NOT NULL CHECK (status IN ('pending', 'executed', 'failed', 'review_required', 'rejected')),
    error_log TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Agent Review Queue
-- Proposals that require explicit "Apply" or MFA verification
CREATE TABLE IF NOT EXISTS public.agent_review_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_log_id UUID NOT NULL REFERENCES public.agent_action_logs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    user_feedback TEXT,
    
    reviewed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'), -- Auto-expire proposals
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE public.agent_action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_review_queue ENABLE ROW LEVEL SECURITY;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_agent_logs_user ON public.agent_action_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_cycle ON public.agent_action_logs(cycle_id);
CREATE INDEX IF NOT EXISTS idx_agent_review_user ON public.agent_review_queue(user_id, status);

-- 5. RLS Policies
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

-- 6. Triggers for updated_at
CREATE TRIGGER update_agent_action_logs_updated_at
    BEFORE UPDATE ON public.agent_action_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.agent_action_logs IS 'Audit trail for the PRISM Agent Perception-Reasoning-Action loop';
COMMENT ON TABLE public.agent_review_queue IS 'Queue for Tier 3/4 agent proposals requiring user approval';
