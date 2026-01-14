-- Priority 1: Centralization - Database Tables
-- calculation_logs, api_pricing_tiers, user_subscriptions

-- 1. Calculation Logs - Audit trail for all tax calculations
CREATE TABLE IF NOT EXISTS calculation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    
    -- What was calculated
    tax_type TEXT NOT NULL, -- 'pit', 'cit', 'vat', 'wht', 'cgt', 'stamp', 'levy', 'metr'
    input JSONB NOT NULL,   -- Raw input parameters
    output JSONB NOT NULL,  -- Calculation result
    
    -- Source tracking
    source TEXT NOT NULL,   -- 'web_chat', 'telegram', 'whatsapp', 'api', 'admin'
    session_id TEXT,        -- For grouping related calculations
    
    -- Metadata
    rules_version DATE,     -- Date of rules used
    response_time_ms INTEGER,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for calculation_logs
CREATE INDEX IF NOT EXISTS idx_calc_logs_user ON calculation_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calc_logs_type ON calculation_logs(tax_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calc_logs_source ON calculation_logs(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calc_logs_api_key ON calculation_logs(api_key_id) WHERE api_key_id IS NOT NULL;

-- 2. API Pricing Tiers - Admin-configurable pricing
CREATE TABLE IF NOT EXISTS api_pricing_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,          -- 'free', 'starter', 'business', 'enterprise'
    display_name TEXT NOT NULL,          -- 'Free', 'Starter', etc.
    price_monthly INTEGER NOT NULL,      -- In kobo (₦0 = 0, ₦5000 = 500000)
    price_yearly INTEGER,                -- Annual pricing (optional discount)
    
    -- Rate limits
    requests_per_min INTEGER NOT NULL,
    requests_per_day INTEGER NOT NULL,
    
    -- Feature flags
    can_access_documents BOOLEAN DEFAULT FALSE,
    can_access_ocr BOOLEAN DEFAULT FALSE,
    can_use_webhooks BOOLEAN DEFAULT FALSE,
    can_bulk_process BOOLEAN DEFAULT FALSE,
    priority_support BOOLEAN DEFAULT FALSE,
    
    -- Display
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,   -- Highlight in pricing page
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default pricing tiers
INSERT INTO api_pricing_tiers (name, display_name, price_monthly, requests_per_min, requests_per_day, can_access_documents, can_access_ocr, can_use_webhooks, sort_order, is_featured)
VALUES 
    ('free', 'Free', 0, 10, 100, false, false, false, 1, false),
    ('starter', 'Starter', 500000, 60, 5000, false, false, true, 2, false),
    ('business', 'Business', 5000000, 300, 50000, true, true, true, 3, true),
    ('enterprise', 'Enterprise', 50000000, 999999, 999999, true, true, true, 4, false)
ON CONFLICT (name) DO UPDATE SET
    price_monthly = EXCLUDED.price_monthly,
    requests_per_min = EXCLUDED.requests_per_min,
    requests_per_day = EXCLUDED.requests_per_day;

-- 3. User Subscriptions - Track API tier subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier_id UUID NOT NULL REFERENCES api_pricing_tiers(id),
    
    -- Subscription state
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing', 'paused')),
    
    -- Payment integration
    paystack_customer_id TEXT,
    paystack_subscription_code TEXT,
    paystack_plan_code TEXT,
    
    -- Billing period
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    
    -- Usage tracking
    requests_this_period INTEGER DEFAULT 0,
    last_request_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id) -- One active subscription per user
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_paystack ON user_subscriptions(paystack_subscription_code);

-- 4. RLS Policies
ALTER TABLE calculation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Calculation logs: users see their own, admins see all
CREATE POLICY calc_logs_user ON calculation_logs
    FOR SELECT USING (user_id = auth.uid());

-- Pricing tiers: everyone can read active tiers
CREATE POLICY pricing_tiers_read ON api_pricing_tiers
    FOR SELECT USING (is_active = true);

-- Subscriptions: users see their own
CREATE POLICY subscriptions_user ON user_subscriptions
    FOR ALL USING (user_id = auth.uid());

-- 5. Function to log a calculation
CREATE OR REPLACE FUNCTION log_calculation(
    p_user_id UUID,
    p_api_key_id UUID,
    p_tax_type TEXT,
    p_input JSONB,
    p_output JSONB,
    p_source TEXT,
    p_response_time_ms INTEGER DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO calculation_logs (
        user_id, api_key_id, tax_type, input, output, source, 
        rules_version, response_time_ms
    ) VALUES (
        p_user_id, p_api_key_id, p_tax_type, p_input, p_output, p_source,
        CURRENT_DATE, p_response_time_ms
    ) RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grants
GRANT SELECT ON calculation_logs TO authenticated;
GRANT SELECT ON api_pricing_tiers TO anon, authenticated;
GRANT ALL ON user_subscriptions TO authenticated;

COMMENT ON TABLE calculation_logs IS 'Audit trail for all tax calculations across all interfaces';
COMMENT ON TABLE api_pricing_tiers IS 'Admin-configurable API pricing tiers';
COMMENT ON TABLE user_subscriptions IS 'User API tier subscriptions with Paystack integration';
