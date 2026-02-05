

# Migrate Lovable Cloud to Self-Hosted Supabase

## Current State Assessment

Your Lovable Cloud project contains:

| Component | Count | Details |
|-----------|-------|---------|
| Migration files | 153 | Schema definitions, RLS policies, triggers |
| Edge Functions | 70+ | Tax calculators, bots, webhooks, AI services |
| Database tables | 50+ | Users, transactions, compliance rules, etc. |
| RLS policies | 100+ | Row-level security across all tables |

## Migration Strategy

### Phase 1: Schema Export

You'll need to export the complete database schema from Lovable Cloud and apply it to your self-hosted instance.

**Option A: Use Supabase CLI (Recommended)**
```bash
# Link to your self-hosted Supabase
supabase link --project-ref YOUR_SELF_HOSTED_PROJECT_ID

# Apply all migrations in order
supabase db push
```

**Option B: Manual SQL Export**
I can generate a consolidated SQL file containing all 153 migrations that you can run against your self-hosted instance.

### Phase 2: Data Migration

Export data from Lovable Cloud and import to self-hosted:
```bash
# Export from Lovable Cloud
pg_dump postgresql://postgres:[SERVICE_KEY]@db.rjajxabpndmpcgssymxw.supabase.co:5432/postgres > prism_data.sql

# Import to self-hosted
psql YOUR_SELF_HOSTED_CONNECTION_STRING < prism_data.sql
```

### Phase 3: Edge Functions Deployment

Deploy all 70+ edge functions to your self-hosted instance:
```bash
cd supabase
supabase functions deploy --project-ref YOUR_SELF_HOSTED_PROJECT_ID
```

### Phase 4: Environment Configuration

Update your self-hosted Supabase with required secrets:
- `OPENAI_API_KEY`
- `MONO_SECRET_KEY`
- `TELEGRAM_BOT_TOKEN`
- `PAYSTACK_SECRET_KEY`
- And others as needed

### Phase 5: Frontend Configuration

Update `.env` to point to your self-hosted Supabase:
```env
VITE_SUPABASE_URL=https://your-self-hosted-supabase.com
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
```

## What I Can Generate For You

1. **Consolidated migration file** - All 153 migrations merged into one SQL file
2. **Edge functions deployment script** - Automated deployment commands
3. **Secrets checklist** - All required environment variables
4. **Connection test script** - Verify self-hosted setup is working

## Requirements From You

To proceed, I'll need:
1. Your self-hosted Supabase project URL
2. Your self-hosted Supabase anon key
3. Your self-hosted Supabase service role key (for data migration)

## Important Notes

- **Data stays in Lovable Cloud** until you explicitly export it
- **Edge functions** need to be redeployed to your self-hosted instance
- **Secrets** are not automatically transferred - you must reconfigure them
- After migration, update your frontend to use the new credentials

