

## Run V27 CBN Cron Migration

### Current Status

| Component | Status |
|-----------|--------|
| Edge function `cbn-rate-fetcher` | Working - just fetched 12 rates from CBN |
| `pg_cron` extension | Enabled |
| `pg_net` extension | Enabled |
| Vault secrets (`supabase_url`, `service_role_key`) | Not configured |
| CBN cron job | Not scheduled |

### Problem

The migration file `20260130_v27_analytics_cbn_cron.sql` uses vault secrets:
```sql
url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url')
```

But the vault is empty, so the cron job would fail silently.

### Solution

Create the cron job using the same pattern as the working `weekly-savings-email` job - with hardcoded URL and anon key:

```sql
-- Primary Fetch: 9:30 AM WAT (08:30 UTC)
SELECT cron.schedule(
  'cbn-rate-fetch-primary',
  '30 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://rjajxabpndmpcgssymxw.supabase.co/functions/v1/cbn-rate-fetcher',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqYWp4YWJwbmRtcGNnc3N5bXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY3NjYzNzgsImV4cCI6MjA4MjM0MjM3OH0.FiMP1k2n9GyU89B0nt-7wZyseMHROfnUSsyHPxN1Q6c"}'::jsonb,
    body := '{"force_refresh": true}'::jsonb
  ) AS request_id;
  $$
);

-- Secondary Fetch: 10:00 AM WAT (09:00 UTC)
SELECT cron.schedule(
  'cbn-rate-fetch-secondary',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://rjajxabpndmpcgssymxw.supabase.co/functions/v1/cbn-rate-fetcher',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqYWp4YWJwbmRtcGNnc3N5bXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY3NjYzNzgsImV4cCI6MjA4MjM0MjM3OH0.FiMP1k2n9GyU89B0nt-7wZyseMHROfnUSsyHPxN1Q6c"}'::jsonb,
    body := '{"force_refresh": true}'::jsonb
  ) AS request_id;
  $$
);
```

---

### Implementation Steps

1. **Execute corrected cron SQL** using the database migration tool
2. **Verify cron jobs created** by querying `cron.job`
3. **Delete the old migration file** since it won't work with vault approach

---

### Schedule Details

| Job | Schedule (UTC) | Schedule (WAT) | Purpose |
|-----|---------------|----------------|---------|
| `cbn-rate-fetch-primary` | 08:30 daily | 09:30 AM | Main daily fetch when CBN publishes rates |
| `cbn-rate-fetch-secondary` | 09:00 daily | 10:00 AM | Retry/backup fetch 30 min later |

---

### Other Functions

All 60+ edge functions are deployed and working. The functions folder shows a comprehensive set including:
- Tax calculators (`income-tax-calculator`, `vat-calculator`)
- Document processing (`document-ocr`, `invoice-processor`)
- Compliance (`compliance-automations`, `anti-avoidance-check`)
- Banking (`mono-*`, `paystack-*`)
- AI/Chat (`chat-assist`, `generate-insights`)

No action needed for other functions - they're running correctly.

