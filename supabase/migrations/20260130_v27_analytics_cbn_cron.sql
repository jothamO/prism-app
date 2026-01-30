-- =====================================================
-- V27: Automated CBN Exchange Rate Fetching
-- Schedules daily fetches at 9:30 AM and 10:00 AM WAT
-- =====================================================

-- Primary Fetch: 9:30 AM WAT (08:30 UTC)
SELECT cron.schedule(
  'cbn-rate-fetch-primary',
  '30 8 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/cbn-rate-fetcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{"force_refresh": true}'::jsonb
  );
  $$
);

-- Secondary Fetch (Retry/Update): 10:00 AM WAT (09:00 UTC)
SELECT cron.schedule(
  'cbn-rate-fetch-secondary',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/cbn-rate-fetcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{"force_refresh": true}'::jsonb
  );
  $$
);

COMMENT ON JOB 'cbn-rate-fetch-primary' IS 'Daily CBN exchange rate fetch at 9:30 AM WAT';
COMMENT ON JOB 'cbn-rate-fetch-secondary' IS 'Follow-up CBN exchange rate fetch at 10:00 AM WAT to ensure latest data';
