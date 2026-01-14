-- User Subscription System - FIXED
-- Creates user_pricing_tiers and helper functions only
-- (user_subscriptions already exists with different schema)

-------------------------------------------
-- 1. User Pricing Tiers (NEW TABLE)
-------------------------------------------
CREATE TABLE IF NOT EXISTS user_pricing_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    price_monthly INTEGER NOT NULL DEFAULT 0,
    price_yearly INTEGER,
    target_description TEXT,
    max_team_members INTEGER NOT NULL DEFAULT 1,
    max_bank_accounts INTEGER NOT NULL DEFAULT 0,
    max_ocr_docs_per_month INTEGER NOT NULL DEFAULT 0,
    max_chats_per_day INTEGER,
    has_pdf_reports BOOLEAN DEFAULT FALSE,
    has_reminders BOOLEAN DEFAULT FALSE,
    has_filing_assistance BOOLEAN DEFAULT FALSE,
    has_priority_support BOOLEAN DEFAULT FALSE,
    has_api_access BOOLEAN DEFAULT FALSE,
    min_revenue_band TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert pricing tiers
INSERT INTO user_pricing_tiers (name, display_name, price_monthly, price_yearly, max_team_members, max_bank_accounts, max_ocr_docs_per_month, max_chats_per_day, has_pdf_reports, has_reminders, has_filing_assistance, has_priority_support, has_api_access, min_revenue_band, sort_order, is_featured)
VALUES 
    ('free', 'Free', 0, 0, 1, 0, 0, 5, false, false, false, false, false, NULL, 1, false),
    ('personal', 'Personal', 500000, 5000000, 1, 1, 5, NULL, true, true, false, false, false, NULL, 2, false),
    ('personal_plus', 'Personal Plus', 1000000, 10000000, 1, 2, 10, NULL, true, true, true, false, false, NULL, 3, false),
    ('business_lite', 'Business Lite', 1000000, 10000000, 2, 2, 20, NULL, true, true, true, false, false, 'under_25m', 4, false),
    ('business_standard', 'Business Standard', 2500000, 25000000, 5, 5, 50, NULL, true, true, true, false, false, '25m_100m', 5, true),
    ('business_pro', 'Business Pro', 5000000, 50000000, 10, 10, 100, NULL, true, true, true, true, false, '100m_500m', 6, false),
    ('enterprise', 'Enterprise', 0, 0, 999999, 999999, 999999, NULL, true, true, true, true, true, 'over_500m', 7, false)
ON CONFLICT (name) DO UPDATE SET
    price_monthly = EXCLUDED.price_monthly,
    price_yearly = EXCLUDED.price_yearly,
    max_team_members = EXCLUDED.max_team_members,
    max_bank_accounts = EXCLUDED.max_bank_accounts,
    max_ocr_docs_per_month = EXCLUDED.max_ocr_docs_per_month;

-------------------------------------------
-- 2. Subscription Add-ons
-------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES user_subscriptions(id) ON DELETE CASCADE,
    addon_type TEXT NOT NULL CHECK (addon_type IN ('extra_bank', 'extra_team', 'ocr_pack')),
    quantity INTEGER NOT NULL DEFAULT 1,
    price_per_unit INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-------------------------------------------
-- 3. Add missing columns to user_subscriptions
-------------------------------------------
ALTER TABLE user_subscriptions 
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly',
ADD COLUMN IF NOT EXISTS paystack_email_token TEXT,
ADD COLUMN IF NOT EXISTS ocr_docs_used_this_period INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS chats_used_today INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS chats_last_reset DATE DEFAULT CURRENT_DATE;

-------------------------------------------
-- 4. Indexes
-------------------------------------------
CREATE INDEX IF NOT EXISTS idx_addons_sub ON subscription_addons(subscription_id);

-------------------------------------------
-- 5. RLS Policies
-------------------------------------------
ALTER TABLE user_pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_pricing_read ON user_pricing_tiers;
CREATE POLICY user_pricing_read ON user_pricing_tiers
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS addons_own ON subscription_addons;
CREATE POLICY addons_own ON subscription_addons
    FOR ALL USING (
        subscription_id IN (
            SELECT id FROM user_subscriptions WHERE user_id = auth.uid()
        )
    );

-------------------------------------------
-- 6. Grants
-------------------------------------------
GRANT SELECT ON user_pricing_tiers TO anon, authenticated;
GRANT ALL ON subscription_addons TO authenticated;

-------------------------------------------
-- 7. Comments
-------------------------------------------
COMMENT ON TABLE user_pricing_tiers IS 'User subscription pricing tiers (Free, Personal, Business, Enterprise)';
COMMENT ON TABLE subscription_addons IS 'Extra banks, team members, OCR packs purchased';