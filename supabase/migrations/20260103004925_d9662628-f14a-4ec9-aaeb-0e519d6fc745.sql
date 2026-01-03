-- ============================================
-- Document Processing Tables (from gateway/migrations/002_bank_statements.sql)
-- ============================================

-- Bank statements table
CREATE TABLE IF NOT EXISTS public.bank_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    business_id UUID REFERENCES public.businesses(id),
    file_url TEXT NOT NULL,
    file_name TEXT,
    file_hash TEXT,
    bank_name VARCHAR(100),
    account_number VARCHAR(50),
    statement_start_date DATE,
    statement_end_date DATE,
    currency VARCHAR(10) DEFAULT 'NGN',
    opening_balance NUMERIC(15,2),
    closing_balance NUMERIC(15,2),
    total_credits NUMERIC(15,2) DEFAULT 0,
    total_debits NUMERIC(15,2) DEFAULT 0,
    transaction_count INTEGER DEFAULT 0,
    classified_count INTEGER DEFAULT 0,
    classification_accuracy NUMERIC(5,4),
    processing_status VARCHAR(50) DEFAULT 'pending',
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bank transactions table
CREATE TABLE IF NOT EXISTS public.bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    statement_id UUID REFERENCES public.bank_statements(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    transaction_date DATE NOT NULL,
    value_date DATE,
    description TEXT NOT NULL,
    reference VARCHAR(100),
    debit NUMERIC(15,2),
    credit NUMERIC(15,2),
    balance NUMERIC(15,2),
    classification VARCHAR(100),
    category VARCHAR(100),
    confidence NUMERIC(5,4),
    classification_source VARCHAR(50),
    is_revenue BOOLEAN DEFAULT FALSE,
    is_expense BOOLEAN DEFAULT FALSE,
    is_transfer BOOLEAN DEFAULT FALSE,
    is_bank_charge BOOLEAN DEFAULT FALSE,
    is_tax_relevant BOOLEAN DEFAULT TRUE,
    vat_applicable BOOLEAN DEFAULT FALSE,
    vat_amount NUMERIC(15,2),
    is_nigerian_bank_charge BOOLEAN DEFAULT FALSE,
    is_emtl BOOLEAN DEFAULT FALSE,
    is_stamp_duty BOOLEAN DEFAULT FALSE,
    linked_invoice_id UUID REFERENCES public.invoices(id),
    linked_expense_id UUID REFERENCES public.expenses(id),
    user_reviewed BOOLEAN DEFAULT FALSE,
    user_correction JSONB,
    compliance_flags JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document processing jobs table
CREATE TABLE IF NOT EXISTS public.document_processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    document_url TEXT,
    statement_id UUID REFERENCES public.bank_statements(id),
    processing_status VARCHAR(50) DEFAULT 'queued',
    priority INTEGER DEFAULT 5,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    queued_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    error_message TEXT,
    result JSONB,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes for Performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_bank_statements_user_id ON bank_statements(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_business_id ON bank_statements(business_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_status ON bank_statements(processing_status);
CREATE INDEX IF NOT EXISTS idx_bank_statements_dates ON bank_statements(statement_start_date, statement_end_date);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_statement_id ON bank_transactions(statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_user_id ON bank_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_classification ON bank_transactions(classification);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_category ON bank_transactions(category);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_review ON bank_transactions(user_reviewed) WHERE user_reviewed = FALSE;

CREATE INDEX IF NOT EXISTS idx_processing_jobs_user_id ON document_processing_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON document_processing_jobs(processing_status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_queue ON document_processing_jobs(processing_status, priority, queued_at) WHERE processing_status = 'queued';

-- ============================================
-- Triggers for updated_at
-- ============================================

CREATE TRIGGER update_bank_statements_updated_at
    BEFORE UPDATE ON bank_statements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bank_transactions_updated_at
    BEFORE UPDATE ON bank_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_processing_jobs_updated_at
    BEFORE UPDATE ON document_processing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Statement Stats Update Trigger
-- ============================================

CREATE OR REPLACE FUNCTION update_statement_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE bank_statements
    SET 
        transaction_count = (SELECT COUNT(*) FROM bank_transactions WHERE statement_id = COALESCE(NEW.statement_id, OLD.statement_id)),
        classified_count = (SELECT COUNT(*) FROM bank_transactions WHERE statement_id = COALESCE(NEW.statement_id, OLD.statement_id) AND classification IS NOT NULL),
        classification_accuracy = (
            SELECT CASE 
                WHEN COUNT(*) > 0 THEN AVG(CASE WHEN user_reviewed AND user_correction IS NULL THEN 1.0 ELSE confidence END)
                ELSE NULL 
            END
            FROM bank_transactions 
            WHERE statement_id = COALESCE(NEW.statement_id, OLD.statement_id)
        ),
        updated_at = NOW()
    WHERE id = COALESCE(NEW.statement_id, OLD.statement_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER update_statement_stats_trigger
    AFTER INSERT OR UPDATE OR DELETE ON bank_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_statement_stats();

-- ============================================
-- Add Missing Columns to Businesses
-- ============================================

ALTER TABLE public.businesses 
ADD COLUMN IF NOT EXISTS business_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS industry VARCHAR(100);

-- ============================================
-- Increment Pattern Usage RPC Function
-- ============================================

CREATE OR REPLACE FUNCTION increment_pattern_usage(pattern_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE business_classification_patterns
    SET occurrence_count = occurrence_count + 1,
        last_used_at = NOW()
    WHERE id = pattern_id;
END;
$$;

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_processing_jobs ENABLE ROW LEVEL SECURITY;

-- Bank Statements Policies
CREATE POLICY "Users can view their own statements"
ON public.bank_statements FOR SELECT
USING (user_id::text = auth.uid()::text OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own statements"
ON public.bank_statements FOR INSERT
WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY "Users can update their own statements"
ON public.bank_statements FOR UPDATE
USING (user_id::text = auth.uid()::text OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can delete their own statements"
ON public.bank_statements FOR DELETE
USING (user_id::text = auth.uid()::text);

CREATE POLICY "Admins can manage all statements"
ON public.bank_statements FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Bank Transactions Policies
CREATE POLICY "Users can view their own transactions"
ON public.bank_transactions FOR SELECT
USING (user_id::text = auth.uid()::text OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own transactions"
ON public.bank_transactions FOR INSERT
WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY "Users can update their own transactions"
ON public.bank_transactions FOR UPDATE
USING (user_id::text = auth.uid()::text OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all transactions"
ON public.bank_transactions FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Document Processing Jobs Policies
CREATE POLICY "Users can view their own jobs"
ON public.document_processing_jobs FOR SELECT
USING (user_id::text = auth.uid()::text OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own jobs"
ON public.document_processing_jobs FOR INSERT
WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY "Users can update their own jobs"
ON public.document_processing_jobs FOR UPDATE
USING (user_id::text = auth.uid()::text OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all jobs"
ON public.document_processing_jobs FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- ============================================
-- Enable Realtime for Processing Status
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE bank_statements;
ALTER PUBLICATION supabase_realtime ADD TABLE document_processing_jobs;