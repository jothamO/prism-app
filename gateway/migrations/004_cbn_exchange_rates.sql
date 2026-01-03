-- Phase 3: Nigerian Enhancements - CBN Exchange Rates Table

-- Create table for caching CBN exchange rates
CREATE TABLE IF NOT EXISTS public.cbn_exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency VARCHAR(3) NOT NULL,  -- USD, GBP, EUR, etc.
    rate NUMERIC(10,4) NOT NULL,   -- Exchange rate (₦ per 1 unit of foreign currency)
    rate_date DATE NOT NULL,       -- Date of the rate
    source VARCHAR(20) NOT NULL,   -- 'cbn_api', 'fallback', etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint: one rate per currency per day
    UNIQUE(currency, rate_date)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_cbn_rates_currency_date 
ON cbn_exchange_rates(currency, rate_date DESC);

-- Trigger for updated_at
CREATE TRIGGER update_cbn_rates_updated_at
    BEFORE UPDATE ON cbn_exchange_rates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE public.cbn_exchange_rates ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read rates
CREATE POLICY "Anyone can view exchange rates"
ON public.cbn_exchange_rates FOR SELECT
USING (true);

-- Only admins can insert/update rates
CREATE POLICY "Admins can manage rates"
ON public.cbn_exchange_rates FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Comments
COMMENT ON TABLE cbn_exchange_rates IS 'Cached Central Bank of Nigeria exchange rates for foreign currency compliance';
COMMENT ON COLUMN cbn_exchange_rates.rate IS 'How many Naira for 1 unit of foreign currency (e.g., ₦1,650 per $1 USD)';
