-- Phase 2: Document Processing - Database Schema
-- Bank statements and transactions for ML-powered classification

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Bank Statements Table
CREATE TABLE IF NOT EXISTS public.bank_statements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    
    -- Document info
    file_url TEXT NOT NULL,
    file_name TEXT,
    file_size_bytes INTEGER,
    upload_source VARCHAR(20) CHECK (upload_source IN ('telegram', 'whatsapp', 'web', 'gateway')),
    
    -- Bank info (extracted)
    bank_name VARCHAR(100),
    account_number VARCHAR(20),
    account_type VARCHAR(50),
    currency VARCHAR(10) DEFAULT 'NGN',
    
    -- Statement period
    statement_start_date DATE,
    statement_end_date DATE,
    
    -- Processing status
    processing_status VARCHAR(20) DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
    processed_at TIMESTAMPTZ,
    
    -- Results
    total_transactions INTEGER DEFAULT 0,
    transactions_classified INTEGER DEFAULT 0,
    classification_accuracy DECIMAL(5,4),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bank Transactions Table
CREATE TABLE IF NOT EXISTS public.bank_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    statement_id UUID REFERENCES public.bank_statements(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    
    -- Transaction details
    transaction_date DATE NOT NULL,
    description TEXT NOT NULL,
    debit DECIMAL(15,2),
    credit DECIMAL(15,2),
    balance DECIMAL(15,2),
    reference_number VARCHAR(100),
    
    -- Classification (AI + Business Patterns)
    classification VARCHAR(100),
    category VARCHAR(100),
    confidence DECIMAL(5,4),
    classification_source VARCHAR(20) CHECK (classification_source IN ('business_pattern', 'ai', 'rule_based', 'user', 'hybrid')),
    
    -- Nigerian-specific flags
    is_foreign_currency BOOLEAN DEFAULT FALSE,
    foreign_currency VARCHAR(10),
    exchange_rate DECIMAL(10,4),
    is_ussd_transaction BOOLEAN DEFAULT FALSE,
    is_mobile_money BOOLEAN DEFAULT FALSE,
    mobile_money_provider VARCHAR(50),
    is_pos_transaction BOOLEAN DEFAULT FALSE,
    
    -- Compliance
    requires_user_confirmation BOOLEAN DEFAULT FALSE,
    compliance_flags JSONB DEFAULT '[]',
    
    -- User review
    user_reviewed BOOLEAN DEFAULT FALSE,
    user_reviewed_at TIMESTAMPTZ,
    user_classification VARCHAR(100),
    user_category VARCHAR(100),
    
    -- Link to existing records (if matched)
    linked_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    linked_expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Document Processing Jobs Table
CREATE TABLE IF NOT EXISTS public.document_processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    
    -- Job info
    document_type VARCHAR(50) CHECK (document_type IN ('bank_statement', 'invoice', 'receipt', 'tax_document')),
    document_url TEXT NOT NULL,
    processing_status VARCHAR(20) DEFAULT 'queued' CHECK (processing_status IN ('queued', 'processing', 'completed', 'failed')),
    
    -- Processing timestamps
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    
    -- Results
    result_summary JSONB,
    error_message TEXT,
    
    -- Link to created record
    statement_id UUID REFERENCES public.bank_statements(id) ON DELETE SET NULL,
    
    -- Cost tracking (Claude API usage)
    tokens_used INTEGER,
    estimated_cost_usd DECIMAL(10,6),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bank_statements_user ON public.bank_statements(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_statements_business ON public.bank_statements(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_statements_status ON public.bank_statements(processing_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_statement ON public.bank_transactions(statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_user ON public.bank_transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_business ON public.bank_transactions(business_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_classification ON public.bank_transactions(classification, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_review ON public.bank_transactions(user_reviewed, requires_user_confirmation);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_description ON public.bank_transactions USING gin(description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_user ON public.document_processing_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON public.document_processing_jobs(processing_status, queued_at);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bank_statements_updated_at
    BEFORE UPDATE ON public.bank_statements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bank_transactions_updated_at
    BEFORE UPDATE ON public.bank_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update statement statistics
CREATE OR REPLACE FUNCTION update_statement_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.bank_statements
    SET 
        total_transactions = (
            SELECT COUNT(*) 
            FROM public.bank_transactions 
            WHERE statement_id = NEW.statement_id
        ),
        transactions_classified = (
            SELECT COUNT(*) 
            FROM public.bank_transactions 
            WHERE statement_id = NEW.statement_id 
            AND classification IS NOT NULL
        ),
        classification_accuracy = (
            SELECT 
                CASE 
                    WHEN COUNT(*) = 0 THEN NULL
                    ELSE 1.0 - (COUNT(CASE WHEN user_reviewed AND classification != user_classification THEN 1 END)::DECIMAL / COUNT(*))
                END
            FROM public.bank_transactions 
            WHERE statement_id = NEW.statement_id 
            AND user_reviewed = TRUE
        )
    WHERE id = NEW.statement_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_statement_stats
    AFTER INSERT OR UPDATE ON public.bank_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_statement_stats();

-- Comments
COMMENT ON TABLE public.bank_statements IS 'Bank statements uploaded for automated processing and classification';
COMMENT ON TABLE public.bank_transactions IS 'Individual transactions extracted from bank statements with ML classification';
COMMENT ON TABLE public.document_processing_jobs IS 'Async job queue for document processing (bank statements, invoices, etc.)';

COMMENT ON COLUMN public.bank_transactions.classification IS 'AI/pattern classification: sale, expense, capital, loan, personal, etc.';
COMMENT ON COLUMN public.bank_transactions.classification_source IS 'Source of classification: business_pattern (learned), ai (Claude), rule_based, user (corrected), hybrid';
COMMENT ON COLUMN public.bank_transactions.compliance_flags IS 'Array of compliance warnings: section_191_risk, mixed_account, foreign_currency, etc.';
COMMENT ON COLUMN public.bank_transactions.is_mobile_money IS 'True if transaction is via OPay, PalmPay, Moniepoint, Kuda, etc.';
COMMENT ON COLUMN public.bank_transactions.is_ussd_transaction IS 'True if transaction appears to be USSD transfer (*737*, etc.)';
COMMENT ON COLUMN public.document_processing_jobs.result_summary IS 'JSON summary: {transactions: 45, classified: 40, reviewed: 5, accuracy: 0.89}';
