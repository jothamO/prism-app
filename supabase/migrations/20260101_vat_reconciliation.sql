-- Phase 4: Tax Act 2025 - VAT Reconciliation
-- Act Reference: Section 156 - Input tax credit and monthly reconciliation

-- Add VAT tracking to expenses
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS vat_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS vat_rate DECIMAL(5,4) DEFAULT 0.075,
ADD COLUMN IF NOT EXISTS can_claim_input_vat BOOLEAN DEFAULT TRUE;

-- Create VAT reconciliation table
CREATE TABLE IF NOT EXISTS vat_reconciliations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    period VARCHAR(7) NOT NULL, -- YYYY-MM format
    
    -- Output VAT (collected on sales)
    output_vat DECIMAL(15,2) NOT NULL DEFAULT 0,
    output_vat_invoices_count INT DEFAULT 0,
    
    -- Input VAT (paid on purchases)
    input_vat DECIMAL(15,2) NOT NULL DEFAULT 0,
    input_vat_expenses_count INT DEFAULT 0,
    
    -- Net position
    net_vat DECIMAL(15,2) NOT NULL, -- output - input
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'remit', 'credit', 'refund_requested', 'filed'
    
    -- Credit carried forward from previous month
    credit_brought_forward DECIMAL(15,2) DEFAULT 0,
    credit_carried_forward DECIMAL(15,2) DEFAULT 0,
    
    -- Filing details
    filed_at TIMESTAMPTZ,
    filed_by VARCHAR(50), -- 'system' or admin user
    remittance_proof VARCHAR(255), -- Document reference
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_vat_recon_user_period 
ON vat_reconciliations(user_id, period DESC);

CREATE INDEX IF NOT EXISTS idx_vat_recon_business_period 
ON vat_reconciliations(business_id, period DESC);

CREATE INDEX IF NOT EXISTS idx_vat_recon_status 
ON vat_reconciliations(status) 
WHERE status != 'filed';

-- Unique constraint: one reconciliation per user/business/period
CREATE UNIQUE INDEX IF NOT EXISTS idx_vat_recon_unique 
ON vat_reconciliations(user_id, COALESCE(business_id, '00000000-0000-0000-0000-000000000000'), period);

-- Add comments
COMMENT ON TABLE vat_reconciliations IS 'Monthly VAT reconciliation per Tax Act 2025 Section 156 - tracks output vs input VAT';
COMMENT ON COLUMN vat_reconciliations.period IS 'Month in YYYY-MM format, VAT must be remitted by 14th of following month';
COMMENT ON COLUMN vat_reconciliations.status IS 'remit=owe VAT, credit=carry forward, refund_requested=claimed refund, filed=completed';
