-- =====================================================
-- Phase 6.12: Atomic Facts (PARA Structured Memory)
-- Implements durable, queryable agent memory
-- =====================================================

-- 1. PARA Layer Enum
DO $$ BEGIN
    CREATE TYPE public.para_layer AS ENUM ('project', 'area', 'resource', 'archive');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Atomic Facts Table
-- Replaces ephemeral session memory with durable facts
CREATE TABLE IF NOT EXISTS public.atomic_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- PARA Categorization
    layer para_layer NOT NULL DEFAULT 'area',
    entity_name TEXT NOT NULL, -- e.g., 'FIRS', 'Mono Account', 'VAT Rate'
    
    -- The Knowledge
    fact_content JSONB NOT NULL, -- The actual data/values
    source_metadata JSONB DEFAULT '{}', -- OCR snippets, chat message IDs, etc.
    
    -- Metadata & Lifecycle
    confidence NUMERIC(3,2) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
    is_superseded BOOLEAN DEFAULT false,
    superseded_by_id UUID REFERENCES public.atomic_facts(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE public.atomic_facts ENABLE ROW LEVEL SECURITY;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_atomic_facts_user ON public.atomic_facts(user_id, layer);
CREATE INDEX IF NOT EXISTS idx_atomic_facts_entity ON public.atomic_facts(user_id, entity_name);
CREATE INDEX IF NOT EXISTS idx_atomic_facts_active ON public.atomic_facts(user_id) WHERE NOT is_superseded;

-- 5. RLS Policies
CREATE POLICY "Users can view their own atomic facts"
    ON public.atomic_facts FOR SELECT
    USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Service role manages atomic facts"
    ON public.atomic_facts FOR ALL
    USING (auth.role() = 'service_role');

-- 6. Trigger to automate supersession (Optional/Manual for now)
-- The agent orchestrator will handle the logic of finding and superseding facts,
-- but we ensure updated_at is handled.

CREATE TRIGGER update_atomic_facts_updated_at
    BEFORE UPDATE ON public.atomic_facts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Logic for QMD Grounding (View for easy access)
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
