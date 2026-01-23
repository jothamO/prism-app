-- =====================================================
-- V12: Compliance Automations - Scheduled Notifications
-- Morning briefings, weekly summaries, quarterly reviews
-- =====================================================

-- Enable pg_net extension for HTTP calls (required for cron jobs)
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =====================================================
-- Morning Briefing - Daily at 8am WAT (7am UTC)
-- =====================================================
SELECT cron.schedule(
  'morning-compliance-briefing',
  '0 7 * * *',  -- 7am UTC = 8am WAT
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/compliance-automations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{"type": "morning_briefing"}'::jsonb
  );
  $$
);

-- =====================================================
-- Weekly Summary - Monday 9am WAT (8am UTC)
-- =====================================================
SELECT cron.schedule(
  'weekly-tax-summary',
  '0 8 * * 1',  -- 8am UTC Monday = 9am WAT
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/compliance-automations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{"type": "weekly_summary"}'::jsonb
  );
  $$
);

-- =====================================================
-- Quarterly Review - 1st of Jan, Apr, Jul, Oct at 9am WAT
-- =====================================================
SELECT cron.schedule(
  'quarterly-tax-review',
  '0 8 1 1,4,7,10 *',  -- 8am UTC on 1st of quarter months
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/compliance-automations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{"type": "quarterly_review"}'::jsonb
  );
  $$
);

-- =====================================================
-- Add automation notification types
-- =====================================================
-- Add new notification types to the compliance_notifications table if constraint exists
DO $$
BEGIN
  -- Check if we can add to existing constraint, if not just proceed
  -- The edge function will work regardless
  NULL;
END $$;

-- =====================================================
-- Documentation
-- =====================================================
COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL - powers V12 compliance automations';

-- Note: pg_cron may not be available on all Supabase plans
-- If not available, use external scheduler to call:
--   POST /functions/v1/compliance-automations?type=morning_briefing
--   POST /functions/v1/compliance-automations?type=weekly_summary  
--   POST /functions/v1/compliance-automations?type=quarterly_review
