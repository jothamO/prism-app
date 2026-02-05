# Migrate Lovable Cloud to Self-Hosted Supabase

## ✅ Migration Targets Configured

| Property | Source (Lovable Cloud) | Target (Self-Hosted) |
|----------|------------------------|----------------------|
| **Project URL** | https://rjajxabpndmpcgssymxw.supabase.co | https://mgozsryewbirhxjpcuvy.supabase.co |
| **Project Ref** | rjajxabpndmpcgssymxw | mgozsryewbirhxjpcuvy |

## Current State Assessment

| Component | Count | Details |
|-----------|-------|---------|
| Migration files | 153 | Schema definitions, RLS policies, triggers |
| Edge Functions | 70 | Tax calculators, bots, webhooks, AI services |
| Database tables | 50+ | Users, transactions, compliance rules, etc. |
| RLS policies | 100+ | Row-level security across all tables |
| Secrets | 13 | API keys and tokens |

## Generated Migration Artifacts

| File | Description |
|------|-------------|
| `scripts/migration/MIGRATION_GUIDE.md` | Complete step-by-step guide |
| `scripts/migration/deploy-functions.sh` | Bash script for edge function deployment |
| `scripts/migration/deploy-functions.ps1` | PowerShell script for Windows |
| `scripts/migration/secrets-checklist.md` | All secrets to configure |

## Migration Steps

### Phase 1: Schema Migration
```bash
# Link and push all 153 migrations
supabase link --project-ref mgozsryewbirhxjpcuvy
supabase db push
```

### Phase 2: Data Migration
```bash
# Export from Lovable Cloud
pg_dump "postgresql://postgres:[SERVICE_KEY]@db.rjajxabpndmpcgssymxw.supabase.co:5432/postgres" \
  --data-only > prism_data.sql

# Import to self-hosted
psql "postgresql://postgres:[SERVICE_KEY]@db.mgozsryewbirhxjpcuvy.supabase.co:5432/postgres" \
  < prism_data.sql
```

### Phase 3: Edge Functions
```bash
# Deploy all 70 functions
./scripts/migration/deploy-functions.sh
# Or on Windows:
./scripts/migration/deploy-functions.ps1
```

### Phase 4: Configure Secrets
See `scripts/migration/secrets-checklist.md` for all 13 secrets to add.

### Phase 5: Update Frontend
```env
VITE_SUPABASE_URL=https://mgozsryewbirhxjpcuvy.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nb3pzcnlld2Jpcmh4anBjdXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5ODIwMjQsImV4cCI6MjA4NTU1ODAyNH0.2zlR8_cm7I897zScTgPAZLz0goCQ9n3H9HyTDx9KWUA
```

## Status

- [x] Credentials collected
- [x] Migration guide generated
- [x] Deployment scripts created
- [x] Secrets checklist created
- [ ] Schema pushed to self-hosted
- [ ] Data exported and imported
- [ ] Edge functions deployed
- [ ] Secrets configured
- [ ] Frontend updated

