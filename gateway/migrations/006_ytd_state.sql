-- P6.17: Year-to-Date State Table
-- Stores aggregated financial summaries for agent context

CREATE TABLE IF NOT EXISTS public.ytd_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES public.businesses(id),
    fiscal_year INT NOT NULL, -- Calendar year (Nigeria uses Jan-Dec)
    
    -- Aggregated financials
    revenue DECIMAL(15,2) DEFAULT 0,
    expenses DECIMAL(15,2) DEFAULT 0,
    vat_paid DECIMAL(15,2) DEFAULT 0,
    pit_paid DECIMAL(15,2) DEFAULT 0,
    
    -- Transaction counts for validation
    revenue_txn_count INT DEFAULT 0,
    expense_txn_count INT DEFAULT 0,
    
    -- Metadata
    last_hydrated_at TIMESTAMPTZ DEFAULT NOW(),
    source_statement_id UUID REFERENCES public.bank_statements(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, business_id, fiscal_year)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ytd_state_user_year ON public.ytd_state(user_id, fiscal_year DESC);
CREATE INDEX IF NOT EXISTS idx_ytd_state_business ON public.ytd_state(business_id, fiscal_year DESC);

-- RLS
ALTER TABLE public.ytd_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ytd_state"
ON public.ytd_state FOR SELECT
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage ytd_state"
ON public.ytd_state FOR ALL
USING (TRUE)
WITH CHECK (TRUE);

-- Updated_at trigger
CREATE TRIGGER update_ytd_state_updated_at
BEFORE UPDATE ON public.ytd_state
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.ytd_state IS 'Aggregated YTD financial state for agent context. Hydrated from bank_transactions.';
