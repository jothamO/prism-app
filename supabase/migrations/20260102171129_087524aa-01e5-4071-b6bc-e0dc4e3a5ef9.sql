-- Phase 6: Bank Charges & EMTL Compliance Tables + Supporting Schema Changes

-- 1. Create emtl_charges table
CREATE TABLE IF NOT EXISTS emtl_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- 2. Create bank_charges table
CREATE TABLE IF NOT EXISTS bank_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- 3. Create analytics_events table (for weekly-savings-alert.worker.ts)
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Add missing columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS business_sector VARCHAR(100);

-- 5. Add missing columns to review_queue table
ALTER TABLE review_queue ADD COLUMN IF NOT EXISTS type VARCHAR(100);
ALTER TABLE review_queue ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 6. Create indexes for emtl_charges
CREATE INDEX IF NOT EXISTS idx_emtl_charges_user_id ON emtl_charges(user_id);
CREATE INDEX IF NOT EXISTS idx_emtl_charges_status ON emtl_charges(status);
CREATE INDEX IF NOT EXISTS idx_emtl_charges_detected_at ON emtl_charges(detected_at);

-- 7. Create indexes for bank_charges
CREATE INDEX IF NOT EXISTS idx_bank_charges_user_id ON bank_charges(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_charges_category ON bank_charges(category);
CREATE INDEX IF NOT EXISTS idx_bank_charges_detected_at ON bank_charges(detected_at);

-- 8. Create indexes for analytics_events
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);

-- 9. Enable RLS on new tables
ALTER TABLE emtl_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- 10. RLS policies for emtl_charges
CREATE POLICY "Users can view their own EMTL charges" ON emtl_charges
  FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own EMTL charges" ON emtl_charges
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all EMTL charges" ON emtl_charges
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- 11. RLS policies for bank_charges
CREATE POLICY "Users can view their own bank charges" ON bank_charges
  FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own bank charges" ON bank_charges
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all bank charges" ON bank_charges
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- 12. RLS policies for analytics_events
CREATE POLICY "Users can view their own events" ON analytics_events
  FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own events" ON analytics_events
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all events" ON analytics_events
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- 13. Updated_at trigger for emtl_charges
CREATE OR REPLACE FUNCTION update_emtl_charges_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS emtl_charges_updated_at ON emtl_charges;
CREATE TRIGGER emtl_charges_updated_at
    BEFORE UPDATE ON emtl_charges
    FOR EACH ROW
    EXECUTE FUNCTION update_emtl_charges_updated_at();

-- 14. Updated_at trigger for bank_charges
CREATE OR REPLACE FUNCTION update_bank_charges_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS bank_charges_updated_at ON bank_charges;
CREATE TRIGGER bank_charges_updated_at
    BEFORE UPDATE ON bank_charges
    FOR EACH ROW
    EXECUTE FUNCTION update_bank_charges_updated_at();

-- 15. Comments for documentation
COMMENT ON TABLE emtl_charges IS 'Electronic Money Transfer Levy charges (₦50) detected from bank statements';
COMMENT ON COLUMN emtl_charges.status IS 'legitimate: Valid charge, exempt_illegal: Should not have been charged, suspicious: Needs review';
COMMENT ON TABLE bank_charges IS 'Bank service charges with VAT extraction';
COMMENT ON TABLE analytics_events IS 'User analytics events for tracking and insights';