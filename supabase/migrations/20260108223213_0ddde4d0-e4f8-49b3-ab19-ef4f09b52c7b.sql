-- =============================================================
-- COMPLIANCE LIFECYCLE ENHANCEMENTS MIGRATION
-- Part 1: Auto-sync Tax Deadlines
-- Part 2: Scheduled Notifications
-- Part 4: Webhooks System
-- Part 3: Effective Date Filtering (updated views)
-- =============================================================

-- =====================
-- PART 1: TAX DEADLINES AUTO-SYNC
-- =====================

-- Add source_rule_id column to tax_deadlines for linking
ALTER TABLE tax_deadlines 
ADD COLUMN IF NOT EXISTS source_rule_id UUID REFERENCES compliance_rules(id) ON DELETE SET NULL;

-- Add unique constraint for source_rule_id (only one deadline per rule)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_deadlines_source_rule 
ON tax_deadlines(source_rule_id) WHERE source_rule_id IS NOT NULL;

-- Create function to sync deadline rules to tax_deadlines
CREATE OR REPLACE FUNCTION sync_deadline_rules_to_tax_calendar()
RETURNS trigger AS $$
BEGIN
    -- Only process deadline rules when active
    IF NEW.rule_type IN ('deadline', 'filing_deadline') AND NEW.is_active = true THEN
        INSERT INTO tax_deadlines (
            deadline_type,
            title,
            description,
            recurrence,
            day_of_month,
            month_of_year,
            specific_date,
            source_rule_id,
            is_active
        )
        VALUES (
            COALESCE((NEW.parameters->>'deadline_type')::varchar, NEW.rule_code),
            NEW.rule_name,
            NEW.description,
            COALESCE((NEW.parameters->>'recurrence')::varchar, 'annual'),
            (NEW.parameters->>'day')::integer,
            (NEW.parameters->>'month')::integer,
            NEW.effective_from::date,
            NEW.id,
            true
        )
        ON CONFLICT (source_rule_id) WHERE source_rule_id IS NOT NULL
        DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            recurrence = EXCLUDED.recurrence,
            day_of_month = EXCLUDED.day_of_month,
            month_of_year = EXCLUDED.month_of_year,
            specific_date = EXCLUDED.specific_date,
            is_active = EXCLUDED.is_active,
            updated_at = NOW();
    END IF;
    
    -- Handle deactivation
    IF TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false THEN
        UPDATE tax_deadlines SET is_active = false, updated_at = NOW()
        WHERE source_rule_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-sync deadline rules
DROP TRIGGER IF EXISTS trigger_sync_deadline_rules ON compliance_rules;
CREATE TRIGGER trigger_sync_deadline_rules
    AFTER INSERT OR UPDATE ON compliance_rules
    FOR EACH ROW EXECUTE FUNCTION sync_deadline_rules_to_tax_calendar();

-- =====================
-- PART 2: NOTIFICATION HISTORY TABLE
-- =====================

-- Create notification_history table to prevent duplicate notifications
CREATE TABLE IF NOT EXISTS notification_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_key VARCHAR(255) UNIQUE NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    reference_id UUID,
    reference_date DATE,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    recipients_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE notification_history ENABLE ROW LEVEL SECURITY;

-- Admins can read notification history
CREATE POLICY "Admins can read notification history"
    ON notification_history
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND account_type = 'admin'
    ));

-- System can insert notification history (via service role)
CREATE POLICY "Service role manages notification history"
    ON notification_history
    FOR ALL
    USING (auth.uid() IS NULL);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_notification_history_type ON notification_history(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_history_sent_at ON notification_history(sent_at);

-- =====================
-- PART 4: WEBHOOK SUBSCRIPTIONS
-- =====================

-- Create webhook_subscriptions table
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    endpoint_url TEXT NOT NULL,
    secret_key TEXT NOT NULL,
    events TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    failure_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;

-- Business owners can manage their webhooks
CREATE POLICY "Business owners manage webhooks"
    ON webhook_subscriptions
    FOR ALL
    USING (business_id IN (
        SELECT id FROM businesses WHERE owner_user_id = auth.uid()
    ));

-- Admins can view all webhooks
CREATE POLICY "Admins can view all webhooks"
    ON webhook_subscriptions
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND account_type = 'admin'
    ));

-- Create webhook_delivery_log table
CREATE TABLE IF NOT EXISTS webhook_delivery_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    response_status INTEGER,
    response_body TEXT,
    success BOOLEAN DEFAULT false,
    attempt_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE webhook_delivery_log ENABLE ROW LEVEL SECURITY;

-- Business owners can view their delivery logs
CREATE POLICY "Business owners view delivery logs"
    ON webhook_delivery_log
    FOR SELECT
    USING (subscription_id IN (
        SELECT id FROM webhook_subscriptions WHERE business_id IN (
            SELECT id FROM businesses WHERE owner_user_id = auth.uid()
        )
    ));

-- Admins can view all logs
CREATE POLICY "Admins view all delivery logs"
    ON webhook_delivery_log
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND account_type = 'admin'
    ));

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_business ON webhook_subscriptions(business_id);
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_active ON webhook_subscriptions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_log_subscription ON webhook_delivery_log(subscription_id);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_log_created ON webhook_delivery_log(created_at);

-- Add trigger for updated_at
CREATE TRIGGER update_webhook_subscriptions_updated_at
    BEFORE UPDATE ON webhook_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================
-- PART 3: UPDATED MATERIALIZED VIEWS
-- =====================

-- Drop and recreate active_tax_rules with proper date filtering
DROP MATERIALIZED VIEW IF EXISTS active_tax_rules CASCADE;

CREATE MATERIALIZED VIEW active_tax_rules AS
SELECT 
    id,
    rule_code,
    rule_name,
    rule_type,
    parameters,
    description,
    effective_from,
    effective_to,
    priority,
    is_active
FROM compliance_rules
WHERE is_active = true
  AND (effective_from IS NULL OR effective_from <= CURRENT_DATE)
  AND (effective_to IS NULL OR effective_to >= CURRENT_DATE);

CREATE UNIQUE INDEX idx_active_tax_rules_id ON active_tax_rules(id);
CREATE INDEX idx_active_tax_rules_code ON active_tax_rules(rule_code);
CREATE INDEX idx_active_tax_rules_type ON active_tax_rules(rule_type);

-- Create upcoming_tax_rules view for regulations not yet effective
CREATE MATERIALIZED VIEW IF NOT EXISTS upcoming_tax_rules AS
SELECT 
    id,
    rule_code,
    rule_name,
    rule_type,
    parameters,
    description,
    effective_from,
    effective_to,
    priority
FROM compliance_rules
WHERE is_active = true
  AND effective_from > CURRENT_DATE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_upcoming_rules_id ON upcoming_tax_rules(id);
CREATE INDEX IF NOT EXISTS idx_upcoming_rules_date ON upcoming_tax_rules(effective_from);

-- Update the refresh trigger to also refresh upcoming_tax_rules
CREATE OR REPLACE FUNCTION refresh_all_tax_rule_views()
RETURNS trigger AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY active_tax_rules;
    REFRESH MATERIALIZED VIEW CONCURRENTLY upcoming_tax_rules;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Replace the existing trigger
DROP TRIGGER IF EXISTS refresh_active_tax_rules ON compliance_rules;
CREATE TRIGGER refresh_all_tax_rules_trigger
    AFTER INSERT OR UPDATE OR DELETE ON compliance_rules
    FOR EACH STATEMENT EXECUTE FUNCTION refresh_all_tax_rule_views();

-- =====================
-- BACKFILL EXISTING DEADLINE RULES
-- =====================

-- Sync existing deadline rules to tax_deadlines
INSERT INTO tax_deadlines (deadline_type, title, description, recurrence, day_of_month, month_of_year, specific_date, source_rule_id, is_active)
SELECT 
    COALESCE((parameters->>'deadline_type')::varchar, rule_code),
    rule_name,
    description,
    COALESCE((parameters->>'recurrence')::varchar, 'annual'),
    (parameters->>'day')::integer,
    (parameters->>'month')::integer,
    effective_from::date,
    id,
    true
FROM compliance_rules
WHERE rule_type IN ('deadline', 'filing_deadline')
  AND is_active = true
  AND id NOT IN (SELECT source_rule_id FROM tax_deadlines WHERE source_rule_id IS NOT NULL)
ON CONFLICT (source_rule_id) WHERE source_rule_id IS NOT NULL DO NOTHING;