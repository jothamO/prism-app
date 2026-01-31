-- Migration: Transaction enhancements for splitting, receipts, and recurring detection
-- Purpose: Support FIRS/LIRS compliant transaction splitting, receipt-to-markdown conversion, VAT breakdown

-- =====================================================
-- Phase 4: Transaction Splitting Support
-- =====================================================

-- Add parent transaction reference for splits
ALTER TABLE bank_transactions 
ADD COLUMN IF NOT EXISTS parent_transaction_id UUID REFERENCES bank_transactions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_split BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS split_note TEXT;

-- Index for efficient split queries
CREATE INDEX IF NOT EXISTS idx_bank_transactions_parent 
ON bank_transactions(parent_transaction_id) 
WHERE parent_transaction_id IS NOT NULL;

-- =====================================================
-- Phase 5D: Receipt Processing (PDF/Image → Markdown)
-- =====================================================

ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS receipt_markdown TEXT,
ADD COLUMN IF NOT EXISTS receipt_source_hash TEXT;  -- SHA-256 of original file for verification

-- Index for finding transactions with receipts
CREATE INDEX IF NOT EXISTS idx_bank_transactions_has_receipt 
ON bank_transactions(user_id) 
WHERE receipt_markdown IS NOT NULL;

-- =====================================================
-- Phase 5E: Recurring Transaction Detection
-- =====================================================

ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS recurring_pattern TEXT;  -- e.g., "monthly", "weekly", "DSTV", "Netflix"

-- Index for recurring transactions
CREATE INDEX IF NOT EXISTS idx_bank_transactions_recurring 
ON bank_transactions(user_id, is_recurring) 
WHERE is_recurring = true;

-- =====================================================
-- Phase 5F: VAT Breakdown
-- =====================================================

ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS vat_gross NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS vat_net NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) DEFAULT 7.5;  -- Nigeria VAT rate

-- =====================================================
-- User Notes for Smart Reclassification
-- =====================================================

ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS user_note TEXT;  -- Free text that triggers AI reclassification

-- =====================================================
-- Comment updates for documentation
-- =====================================================

COMMENT ON COLUMN bank_transactions.parent_transaction_id IS 'For split transactions, references the original parent transaction';
COMMENT ON COLUMN bank_transactions.is_split IS 'True if this is a child transaction from a split';
COMMENT ON COLUMN bank_transactions.split_note IS 'Explanation of why transaction was split (e.g., "48500 hospital + 1500 personal")';
COMMENT ON COLUMN bank_transactions.receipt_markdown IS 'Markdown content extracted from uploaded receipt/PDF';
COMMENT ON COLUMN bank_transactions.receipt_source_hash IS 'SHA-256 hash of original uploaded file for verification (original not stored)';
COMMENT ON COLUMN bank_transactions.is_recurring IS 'True if detected as recurring (Netflix, rent, etc.)';
COMMENT ON COLUMN bank_transactions.recurring_pattern IS 'Pattern name or vendor for recurring detection';
COMMENT ON COLUMN bank_transactions.vat_gross IS 'VAT-inclusive amount';
COMMENT ON COLUMN bank_transactions.vat_net IS 'Net amount excluding VAT';
COMMENT ON COLUMN bank_transactions.vat_amount IS 'VAT portion of the transaction';
COMMENT ON COLUMN bank_transactions.vat_rate IS 'VAT rate applied (default 7.5%)';
COMMENT ON COLUMN bank_transactions.user_note IS 'User-provided context for smart reclassification';
