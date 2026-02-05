# Prism Tax Assistant - Migration Guide

## Target Self-Hosted Supabase

| Property | Value |
|----------|-------|
| **Project URL** | https://mgozsryewbirhxjpcuvy.supabase.co |
| **Project Ref** | mgozsryewbirhxjpcuvy |
| **Anon Key** | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nb3pzcnlld2Jpcmh4anBjdXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5ODIwMjQsImV4cCI6MjA4NTU1ODAyNH0.2zlR8_cm7I897zScTgPAZLz0goCQ9n3H9HyTDx9KWUA |

## Source Lovable Cloud

| Property | Value |
|----------|-------|
| **Project URL** | https://rjajxabpndmpcgssymxw.supabase.co |
| **Project Ref** | rjajxabpndmpcgssymxw |

---

## Phase 1: Schema Migration

### Option A: Supabase CLI (Recommended)

```bash
# 1. Install Supabase CLI
npm install -g supabase

# 2. Link to your self-hosted project
supabase link --project-ref mgozsryewbirhxjpcuvy

# 3. Push all migrations
supabase db push
```

### Option B: Direct SQL

Run the consolidated migration file `consolidated_schema.sql` in your Supabase SQL Editor.

---

## Phase 2: Data Migration

```bash
# 1. Export from Lovable Cloud (requires service role key)
pg_dump "postgresql://postgres:[LOVABLE_SERVICE_KEY]@db.rjajxabpndmpcgssymxw.supabase.co:5432/postgres" \
  --data-only \
  --exclude-table-data='auth.*' \
  --exclude-table-data='storage.*' \
  > prism_data.sql

# 2. Import to self-hosted
psql "postgresql://postgres:[YOUR_SERVICE_KEY]@db.mgozsryewbirhxjpcuvy.supabase.co:5432/postgres" \
  < prism_data.sql
```

---

## Phase 3: Edge Functions Deployment

```bash
# Deploy all edge functions to self-hosted
supabase functions deploy --project-ref mgozsryewbirhxjpcuvy
```

Or use the deployment script: `./scripts/migration/deploy-functions.sh`

---

## Phase 4: Secrets Configuration

Add these secrets in your self-hosted Supabase dashboard under **Settings → Secrets**:

### Required Secrets
| Secret Name | Description | Status in Lovable Cloud |
|-------------|-------------|-------------------------|
| `ANTHROPIC_API_KEY` | Claude AI for document processing | ✅ Configured |
| `MONO_SECRET_KEY` | Mono API for bank connections | ✅ Configured |
| `MONO_PUBLIC_KEY` | Mono widget initialization | ✅ Configured |
| `PAYSTACK_SECRET_KEY` | Payment processing | ✅ Configured |
| `TELEGRAM_BOT_TOKEN` | Telegram bot integration | ✅ Configured |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram webhook validation | ✅ Configured |
| `RESEND_API_KEY` | Email sending | ✅ Configured |
| `GITHUB_TOKEN` | GitHub releases | ✅ Configured |

### Optional Secrets
| Secret Name | Description | Status |
|-------------|-------------|--------|
| `FIRECRAWL_API_KEY` | Web scraping | ✅ Managed by connector |
| `RAILWAY_GATEWAY_URL` | External gateway | ✅ Configured |
| `GOOGLE_CLOUD_CREDENTIALS` | GCP integration | ✅ Configured |
| `GOOGLE_CLOUD_PROJECT_ID` | GCP project | ✅ Configured |

### Auto-Provided by Supabase
| Secret Name | Notes |
|-------------|-------|
| `SUPABASE_URL` | Auto-injected |
| `SUPABASE_ANON_KEY` | Auto-injected |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected |

---

## Phase 5: Frontend Configuration

Update your `.env` file (or Vercel/Netlify environment):

```env
VITE_SUPABASE_URL=https://mgozsryewbirhxjpcuvy.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nb3pzcnlld2Jpcmh4anBjdXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5ODIwMjQsImV4cCI6MjA4NTU1ODAyNH0.2zlR8_cm7I897zScTgPAZLz0goCQ9n3H9HyTDx9KWUA
VITE_SUPABASE_PROJECT_ID=mgozsryewbirhxjpcuvy
```

---

## Verification Checklist

- [ ] All tables created (50+ tables)
- [ ] RLS policies active (100+ policies)
- [ ] Edge functions deployed (70+ functions)
- [ ] Secrets configured (13 secrets)
- [ ] Frontend pointing to new URL
- [ ] Authentication working
- [ ] Data imported successfully

---

## Rollback

If migration fails, your Lovable Cloud data remains intact at:
`https://rjajxabpndmpcgssymxw.supabase.co`
