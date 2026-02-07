-- agent_nervous_system.sql
-- Migrations for Phase 6: The Nervous System (Monty-Powered)

-- 1. Monty Execution Logs
-- Performance tracking and audit trail for all agent actions
CREATE TABLE IF NOT EXISTS public.monty_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    script_name TEXT NOT NULL,
    execution_time_ms DECIMAL(10,3),
    memory_peak_bytes BIGINT,
    status TEXT CHECK (status IN ('success', 'failure', 'timeout', 'paused')),
    error_message TEXT,
    stdout TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Agent Snapshots
-- Stores binary Monty state for Tier 3/4 approval cycles
CREATE TABLE IF NOT EXISTS public.agent_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    snapshot_data BYTEA NOT NULL, -- Serialized Monty state
    pending_function_name TEXT NOT NULL,
    pending_args JSONB NOT NULL,
    autonomy_tier INT CHECK (autonomy_tier IN (3, 4)),
    status TEXT DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'rejected', 'resumed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Agent Atomic Facts (PARA Structure)
-- Essential "memories" extracted by the agent
CREATE TABLE IF NOT EXISTS public.agent_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    fact_key TEXT NOT NULL,
    fact_value JSONB NOT NULL,
    para_layer TEXT NOT NULL CHECK (para_layer IN ('projects', 'areas', 'resources', 'archives')),
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    is_superseded BOOLEAN DEFAULT false,
    superseded_by UUID REFERENCES public.agent_facts(id),
    source_message_id UUID REFERENCES public.messages(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, fact_key) WHERE is_superseded = false
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_monty_logs_user ON public.monty_execution_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_snapshots_pending ON public.agent_snapshots(status, autonomy_tier) WHERE status = 'pending_approval';
CREATE INDEX IF NOT EXISTS idx_agent_facts_layer ON public.agent_facts(user_id, para_layer);

-- RLS Policies
ALTER TABLE public.monty_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_facts ENABLE ROW LEVEL SECURITY;

-- Execution Logs: User viewable, Admin manageable
CREATE POLICY "Users can view their own Monty logs" ON public.monty_execution_logs
    FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Snapshots: User viewable, Admin manageable
CREATE POLICY "Users can view their own agent snapshots" ON public.agent_snapshots
    FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Facts: User viewable, Admin manageable
CREATE POLICY "Users can view their own agent facts" ON public.agent_facts
    FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_agent_snapshots_updated_at
  BEFORE UPDATE ON public.agent_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_facts_updated_at
  BEFORE UPDATE ON public.agent_facts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
