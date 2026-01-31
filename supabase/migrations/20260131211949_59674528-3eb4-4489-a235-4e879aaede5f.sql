-- Transaction Enhancements Migration
-- Adds splitting, receipt processing, recurring detection, and VAT breakdown

-- 1. Add transaction splitting columns
ALTER TABLE public.bank_transactions 
ADD COLUMN IF NOT EXISTS parent_transaction_id UUID REFERENCES public.bank_transactions(id),
ADD COLUMN IF NOT EXISTS is_split BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS split_note TEXT;

-- 2. Add receipt processing columns (privacy-first: no original storage)
ALTER TABLE public.bank_transactions 
ADD COLUMN IF NOT EXISTS receipt_markdown TEXT,
ADD COLUMN IF NOT EXISTS receipt_source_hash TEXT;

-- 3. Add recurring transaction detection
ALTER TABLE public.bank_transactions 
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS recurring_pattern TEXT;

-- 4. Add VAT breakdown columns (Nigerian VAT default 7.5%)
ALTER TABLE public.bank_transactions 
ADD COLUMN IF NOT EXISTS vat_gross NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS vat_net NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) DEFAULT 7.5;

-- 5. Add user note for AI reclassification context
ALTER TABLE public.bank_transactions 
ADD COLUMN IF NOT EXISTS user_note TEXT;

-- 6. Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_bank_transactions_parent 
ON public.bank_transactions(parent_transaction_id) 
WHERE parent_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_has_receipt 
ON public.bank_transactions(id) 
WHERE receipt_markdown IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_recurring 
ON public.bank_transactions(is_recurring, recurring_pattern) 
WHERE is_recurring = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN public.bank_transactions.receipt_markdown IS 'OCR-extracted receipt content in Markdown format. Original image is NOT stored for privacy.';
COMMENT ON COLUMN public.bank_transactions.receipt_source_hash IS 'SHA-256 hash of original receipt image for verification purposes.';
COMMENT ON COLUMN public.bank_transactions.vat_rate IS 'VAT rate applied, defaults to Nigerian standard 7.5%';