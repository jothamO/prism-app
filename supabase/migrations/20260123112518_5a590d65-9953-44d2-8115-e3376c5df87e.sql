-- =====================================================
-- V12: Compliance Automations - Scheduled Notifications
-- Morning briefings, weekly summaries, quarterly reviews
-- =====================================================

-- Enable pg_net extension for HTTP calls (required for cron jobs)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Note: pg_cron may not be available on all Supabase plans
-- Attempt to enable it, but wrap in exception handling
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available - use external scheduler instead';
END $$;

-- =====================================================
-- Cron jobs (only if pg_cron is available)
-- =====================================================
DO $$
BEGIN
  -- Morning Briefing - Daily at 8am WAT (7am UTC)
  PERFORM cron.schedule(
    'morning-compliance-briefing',
    '0 7 * * *',
    $job$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/compliance-automations',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{"type": "morning_briefing"}'::jsonb
    );
    $job$
  );

  -- Weekly Summary - Monday 9am WAT (8am UTC)
  PERFORM cron.schedule(
    'weekly-tax-summary',
    '0 8 * * 1',
    $job$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/compliance-automations',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{"type": "weekly_summary"}'::jsonb
    );
    $job$
  );

  -- Quarterly Review - 1st of Jan, Apr, Jul, Oct at 9am WAT
  PERFORM cron.schedule(
    'quarterly-tax-review',
    '0 8 1 1,4,7,10 *',
    $job$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/compliance-automations',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{"type": "quarterly_review"}'::jsonb
    );
    $job$
  );

  RAISE NOTICE 'Cron jobs scheduled successfully';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available - use external scheduler to call compliance-automations endpoint';
END $$;

-- =====================================================
-- Add notification type tracking
-- =====================================================
ALTER TABLE IF EXISTS public.notification_history 
ADD COLUMN IF NOT EXISTS automation_type TEXT;

COMMENT ON COLUMN public.notification_history.automation_type IS 'Type of automated notification: morning_briefing, weekly_summary, quarterly_review';