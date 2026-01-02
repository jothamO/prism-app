-- Phase 6: Bank Charges & EMTL Compliance Tables
-- Created: 2026-01-02
-- Purpose: Support automatic detection and categorization of bank charges and EMTL

-- EMTL Charges Table
CREATE TABLE IF NOT EXISTS emtl_charges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id TEXT NOT NULL UNIQUE,
    amount DECIMAL(10, 2) NOT NULL DEFAULT 50.00,
    linked_transfer_id TEXT,
    transfer_amount DECIMAL(15, 2),
    status TEXT NOT NULL CHECK (status IN ('legitimate', 'exempt_illegal', 'suspicious')),
    category TEXT NOT NULL CHECK (category IN ('emtl', 'stamp_duty')),
    reason TEXT,
    is_deductible BOOLEAN NOT NULL DEFAULT true,
    has_vat BOOLEAN NOT NULL DEFAULT false,
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Bank Charges Table
CREATE TABLE IF NOT EXISTS bank_charges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id TEXT NOT NULL UNIQUE,
    amount DECIMAL(10, 2) NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('sms_alert', 'card_maintenance', 'cot', 'atm_fee', 'transfer_fee', 'other')),
    description TEXT NOT NULL,
    is_deductible BOOLEAN NOT NULL DEFAULT true,
    vat_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    base_amount DECIMAL(10, 2) NOT NULL,
    confidence DECIMAL(3, 2) NOT NULL DEFAULT 0.5,
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_emtl_charges_user_id ON emtl_charges(user_id);
CREATE INDEX IF NOT EXISTS idx_emtl_charges_status ON emtl_charges(status);
CREATE INDEX IF NOT EXISTS idx_emtl_charges_detected_at ON emtl_charges(detected_at);

CREATE INDEX IF NOT EXISTS idx_bank_charges_user_id ON bank_charges(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_charges_category ON bank_charges(category);
CREATE INDEX IF NOT EXISTS idx_bank_charges_detected_at ON bank_charges(detected_at);

-- Updated_at trigger for emtl_charges
CREATE OR REPLACE FUNCTION update_emtl_charges_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER emtl_charges_updated_at
    BEFORE UPDATE ON emtl_charges
    FOR EACH ROW
    EXECUTE FUNCTION update_emtl_charges_updated_at();

-- Updated_at trigger for bank_charges
CREATE OR REPLACE FUNCTION update_bank_charges_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bank_charges_updated_at
    BEFORE UPDATE ON bank_charges
    FOR EACH ROW
    EXECUTE FUNCTION update_bank_charges_updated_at();

-- Comments for documentation
COMMENT ON TABLE emtl_charges IS 'Electronic Money Transfer Levy charges (₦50) detected from bank statements';
COMMENT ON COLUMN emtl_charges.status IS 'legitimate: Valid charge, exempt_illegal: Should not have been charged, suspicious: Needs review';
COMMENT ON COLUMN emtl_charges.is_deductible IS 'Whether charge is deductible as business expense (false for illegal charges)';

COMMENT ON TABLE bank_charges IS 'Bank service charges with VAT extraction';
COMMENT ON COLUMN bank_charges.vat_amount IS 'VAT component (7.5%) extracted from total charge';
COMMENT ON COLUMN bank_charges.base_amount IS 'Base charge amount before VAT';
COMMENT ON COLUMN bank_charges.confidence IS 'Confidence score of categorization (0.0-1.0)';
