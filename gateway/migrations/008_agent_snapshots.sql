-- P6.7: Agent Snapshots Table
-- Enables durable Monty execution for async Tier 3/4 approval workflows

CREATE TABLE IF NOT EXISTS public.agent_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- Monty snapshot binary data (bytea)
    snapshot_data BYTEA NOT NULL,
    
    -- Pending action details
    pending_function_name TEXT NOT NULL,
    pending_args JSONB NOT NULL DEFAULT '{}',
    autonomy_tier INT NOT NULL CHECK (autonomy_tier IN (3, 4)),
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'rejected', 'resumed', 'expired')),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_snapshots_user_status ON public.agent_snapshots(user_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_snapshots_pending ON public.agent_snapshots(status) WHERE status = 'pending_approval';
CREATE INDEX IF NOT EXISTS idx_agent_snapshots_expires ON public.agent_snapshots(expires_at) WHERE status = 'pending_approval';

-- RLS
ALTER TABLE public.agent_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own snapshots"
    ON public.agent_snapshots FOR SELECT
    USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage snapshots"
    ON public.agent_snapshots FOR ALL
    USING (TRUE)
    WITH CHECK (TRUE);

-- Updated_at trigger
CREATE TRIGGER update_agent_snapshots_updated_at
    BEFORE UPDATE ON public.agent_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.agent_snapshots IS 'Durable Monty snapshots for async Tier 3/4 approval workflows';
