-- User Subscription System
-- Phase 0: Legacy Migration + Phase 1: Database

-------------------------------------------
-- 1. User Pricing Tiers
-------------------------------------------
CREATE TABLE IF NOT EXISTS user_pricing_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    price_monthly INTEGER NOT NULL DEFAULT 0,  -- In kobo
    price_yearly INTEGER,                       -- In kobo (2 months free)
    target_description TEXT,
    
    -- Limits
    max_team_members INTEGER NOT NULL DEFAULT 1,
    max_bank_accounts INTEGER NOT NULL DEFAULT 0,
    max_ocr_docs_per_month INTEGER NOT NULL DEFAULT 0,
    max_chats_per_day INTEGER,  -- NULL = unlimited
    
    -- Features
    has_pdf_reports BOOLEAN DEFAULT FALSE,
    has_reminders BOOLEAN DEFAULT FALSE,
    has_filing_assistance BOOLEAN DEFAULT FALSE,
    has_priority_support BOOLEAN DEFAULT FALSE,
    has_api_access BOOLEAN DEFAULT FALSE,
    
    -- Revenue requirements (for self-selection)
    min_revenue_band TEXT,  -- 'under_25m', '25m_100m', '100m_500m', 'over_500m'
    
    -- Display
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert approved pricing tiers
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
-- 2. User Subscriptions
-------------------------------------------
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier_id UUID NOT NULL REFERENCES user_pricing_tiers(id),
    
    -- Subscription state
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'paused')),
    
    -- Trial
    trial_ends_at TIMESTAMPTZ,
    
    -- Billing
    billing_cycle TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    current_period_start TIMESTAMPTZ DEFAULT NOW(),
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    
    -- Paystack integration
    paystack_customer_code TEXT,
    paystack_subscription_code TEXT,
    paystack_email_token TEXT,
    
    -- Usage tracking (reset monthly)
    ocr_docs_used_this_period INTEGER DEFAULT 0,
    chats_used_today INTEGER DEFAULT 0,
    chats_last_reset DATE DEFAULT CURRENT_DATE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id)
);

-------------------------------------------
-- 3. Subscription Add-ons
-------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES user_subscriptions(id) ON DELETE CASCADE,
    addon_type TEXT NOT NULL CHECK (addon_type IN ('extra_bank', 'extra_team', 'ocr_pack')),
    quantity INTEGER NOT NULL DEFAULT 1,
    price_per_unit INTEGER NOT NULL,  -- In kobo
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-------------------------------------------
-- 4. Migrate existing users
-------------------------------------------
-- First, get the free tier ID
DO $$
DECLARE
    free_tier_id UUID;
    standard_tier_id UUID;
    enterprise_tier_id UUID;
BEGIN
    SELECT id INTO free_tier_id FROM user_pricing_tiers WHERE name = 'free';
    SELECT id INTO standard_tier_id FROM user_pricing_tiers WHERE name = 'business_standard';
    SELECT id INTO enterprise_tier_id FROM user_pricing_tiers WHERE name = 'enterprise';
    
    -- Migrate users based on old subscription_tier
    INSERT INTO user_subscriptions (user_id, tier_id, status)
    SELECT 
        u.id,
        CASE 
            WHEN u.subscription_tier = 'enterprise' THEN enterprise_tier_id
            WHEN u.subscription_tier = 'pro' THEN standard_tier_id
            ELSE free_tier_id
        END,
        'active'
    FROM users u
    WHERE NOT EXISTS (
        SELECT 1 FROM user_subscriptions us WHERE us.user_id = u.id
    );
END $$;

-------------------------------------------
-- 5. Indexes
-------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_subs_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subs_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_subs_tier ON user_subscriptions(tier_id);
CREATE INDEX IF NOT EXISTS idx_addons_sub ON subscription_addons(subscription_id);

-------------------------------------------
-- 6. RLS Policies
-------------------------------------------
ALTER TABLE user_pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_addons ENABLE ROW LEVEL SECURITY;

-- Pricing tiers: everyone can read active tiers
CREATE POLICY user_pricing_read ON user_pricing_tiers
    FOR SELECT USING (is_active = true);

-- Subscriptions: users see/edit their own
CREATE POLICY user_subs_own ON user_subscriptions
    FOR ALL USING (user_id = auth.uid());

-- Add-ons: users see their own via subscription
CREATE POLICY addons_own ON subscription_addons
    FOR ALL USING (
        subscription_id IN (
            SELECT id FROM user_subscriptions WHERE user_id = auth.uid()
        )
    );

-------------------------------------------
-- 7. Helper Functions
-------------------------------------------

-- Get user's current tier with limits
CREATE OR REPLACE FUNCTION get_user_tier(p_user_id UUID)
RETURNS TABLE(
    tier_name TEXT,
    max_banks INTEGER,
    max_team INTEGER,
    max_ocr INTEGER,
    max_chats INTEGER,
    banks_used INTEGER,
    team_used INTEGER,
    ocr_used INTEGER,
    chats_used INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        upt.name,
        upt.max_bank_accounts + COALESCE(SUM(CASE WHEN sa.addon_type = 'extra_bank' THEN sa.quantity ELSE 0 END), 0)::INTEGER,
        upt.max_team_members + COALESCE(SUM(CASE WHEN sa.addon_type = 'extra_team' THEN sa.quantity ELSE 0 END), 0)::INTEGER,
        upt.max_ocr_docs_per_month + COALESCE(SUM(CASE WHEN sa.addon_type = 'ocr_pack' THEN sa.quantity * 50 ELSE 0 END), 0)::INTEGER,
        upt.max_chats_per_day,
        (SELECT COUNT(*)::INTEGER FROM bank_connections bc WHERE bc.user_id = p_user_id),
        (SELECT COUNT(*)::INTEGER FROM team_members tm WHERE tm.team_id IN (SELECT t.id FROM teams t WHERE t.owner_id = p_user_id)),
        us.ocr_docs_used_this_period,
        CASE WHEN us.chats_last_reset = CURRENT_DATE THEN us.chats_used_today ELSE 0 END
    FROM user_subscriptions us
    JOIN user_pricing_tiers upt ON us.tier_id = upt.id
    LEFT JOIN subscription_addons sa ON sa.subscription_id = us.id
    WHERE us.user_id = p_user_id
    GROUP BY upt.name, upt.max_bank_accounts, upt.max_team_members, upt.max_ocr_docs_per_month, upt.max_chats_per_day, us.ocr_docs_used_this_period, us.chats_used_today, us.chats_last_reset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user can perform action
CREATE OR REPLACE FUNCTION check_user_limit(
    p_user_id UUID,
    p_action TEXT  -- 'bank', 'team', 'ocr', 'chat'
) RETURNS TABLE(
    allowed BOOLEAN,
    current_count INTEGER,
    max_allowed INTEGER,
    upgrade_message TEXT
) AS $$
DECLARE
    tier_data RECORD;
BEGIN
    SELECT * INTO tier_data FROM get_user_tier(p_user_id);
    
    IF tier_data IS NULL THEN
        RETURN QUERY SELECT false, 0, 0, 'No subscription found'::TEXT;
        RETURN;
    END IF;
    
    CASE p_action
        WHEN 'bank' THEN
            RETURN QUERY SELECT 
                tier_data.banks_used < tier_data.max_banks,
                tier_data.banks_used,
                tier_data.max_banks,
                CASE WHEN tier_data.banks_used >= tier_data.max_banks 
                    THEN 'Upgrade to link more bank accounts' 
                    ELSE NULL 
                END;
        WHEN 'team' THEN
            RETURN QUERY SELECT 
                tier_data.team_used < tier_data.max_team,
                tier_data.team_used,
                tier_data.max_team,
                CASE WHEN tier_data.team_used >= tier_data.max_team 
                    THEN 'Upgrade to add more team members' 
                    ELSE NULL 
                END;
        WHEN 'ocr' THEN
            RETURN QUERY SELECT 
                tier_data.ocr_used < tier_data.max_ocr,
                tier_data.ocr_used,
                tier_data.max_ocr,
                CASE WHEN tier_data.ocr_used >= tier_data.max_ocr 
                    THEN 'Upgrade for more document processing' 
                    ELSE NULL 
                END;
        WHEN 'chat' THEN
            IF tier_data.max_chats IS NULL THEN
                RETURN QUERY SELECT true, tier_data.chats_used, 999999, NULL::TEXT;
            ELSE
                RETURN QUERY SELECT 
                    tier_data.chats_used < tier_data.max_chats,
                    tier_data.chats_used,
                    tier_data.max_chats,
                    CASE WHEN tier_data.chats_used >= tier_data.max_chats 
                        THEN 'You''ve reached your daily chat limit. Upgrade for unlimited.' 
                        ELSE NULL 
                    END;
            END IF;
        ELSE
            RETURN QUERY SELECT false, 0, 0, 'Unknown action'::TEXT;
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment usage counter
CREATE OR REPLACE FUNCTION increment_usage(
    p_user_id UUID,
    p_type TEXT  -- 'ocr' or 'chat'
) RETURNS VOID AS $$
BEGIN
    IF p_type = 'ocr' THEN
        UPDATE user_subscriptions 
        SET ocr_docs_used_this_period = ocr_docs_used_this_period + 1,
            updated_at = NOW()
        WHERE user_id = p_user_id;
    ELSIF p_type = 'chat' THEN
        UPDATE user_subscriptions 
        SET chats_used_today = CASE 
                WHEN chats_last_reset = CURRENT_DATE THEN chats_used_today + 1 
                ELSE 1 
            END,
            chats_last_reset = CURRENT_DATE,
            updated_at = NOW()
        WHERE user_id = p_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-------------------------------------------
-- 8. Grants
-------------------------------------------
GRANT SELECT ON user_pricing_tiers TO anon, authenticated;
GRANT ALL ON user_subscriptions TO authenticated;
GRANT ALL ON subscription_addons TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_tier TO authenticated;
GRANT EXECUTE ON FUNCTION check_user_limit TO authenticated;
GRANT EXECUTE ON FUNCTION increment_usage TO authenticated;

-------------------------------------------
-- 9. Comments
-------------------------------------------
COMMENT ON TABLE user_pricing_tiers IS 'User subscription pricing tiers (Free, Personal, Business, Enterprise)';
COMMENT ON TABLE user_subscriptions IS 'User subscription state and usage tracking';
COMMENT ON TABLE subscription_addons IS 'Extra banks, team members, OCR packs purchased';
COMMENT ON FUNCTION check_user_limit IS 'Check if user can perform action based on tier limits';
