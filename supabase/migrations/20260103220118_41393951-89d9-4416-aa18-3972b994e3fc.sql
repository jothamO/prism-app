-- Phase 3: Nigerian Enhancements - CBN Exchange Rates Table
CREATE TABLE IF NOT EXISTS public.cbn_exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency VARCHAR(3) NOT NULL,
    rate NUMERIC(10,4) NOT NULL,
    rate_date DATE NOT NULL,
    source VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(currency, rate_date)
);

CREATE INDEX IF NOT EXISTS idx_cbn_rates_currency_date 
ON cbn_exchange_rates(currency, rate_date DESC);

CREATE TRIGGER update_cbn_rates_updated_at
    BEFORE UPDATE ON cbn_exchange_rates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.cbn_exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view exchange rates"
ON public.cbn_exchange_rates FOR SELECT
USING (true);

CREATE POLICY "Admins can manage rates"
ON public.cbn_exchange_rates FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Extend businesses table for informal sector tracking
ALTER TABLE public.businesses 
ADD COLUMN IF NOT EXISTS informal_business BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cac_registration_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS business_stage VARCHAR(20) DEFAULT 'early';

-- Extend bank_transactions for business linkage, accuracy, and capital tracking
ALTER TABLE public.bank_transactions
ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS user_classification VARCHAR(100),
ADD COLUMN IF NOT EXISTS is_capital_injection BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS capital_type VARCHAR(50);

-- Index for business_id on transactions
CREATE INDEX IF NOT EXISTS idx_bank_transactions_business_id 
ON public.bank_transactions(business_id);

-- Comments
COMMENT ON TABLE cbn_exchange_rates IS 'Cached Central Bank of Nigeria exchange rates for foreign currency compliance';
COMMENT ON COLUMN cbn_exchange_rates.rate IS 'How many Naira for 1 unit of foreign currency';
COMMENT ON COLUMN businesses.informal_business IS 'Whether business is informal/unregistered';
COMMENT ON COLUMN businesses.cac_registration_number IS 'CAC registration number (RC/BN number)';
COMMENT ON COLUMN businesses.business_stage IS 'Business lifecycle: pre_revenue, early, growth, mature';
COMMENT ON COLUMN bank_transactions.user_classification IS 'User-confirmed classification for accuracy tracking';
COMMENT ON COLUMN bank_transactions.is_capital_injection IS 'Whether transaction is capital injection vs revenue';
COMMENT ON COLUMN bank_transactions.capital_type IS 'Type of capital: shareholder, family_support, loan, grant, investment';