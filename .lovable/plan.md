

# Local Development → Lovable Cloud Push Guide

## The Challenge

Lovable Cloud manages the Supabase project internally, which means:
- **Database password is not exposed** (required for `supabase db push`)
- **Project is already linked** to Lovable's deployment pipeline
- Edge functions and migrations are **auto-deployed** when you push code through Lovable

## Your Options

### Option 1: Push Through Lovable (Recommended)

The standard workflow for Lovable Cloud projects:

1. Make changes locally to `supabase/migrations/` and `supabase/functions/`
2. Commit and push to your GitHub repository
3. Lovable automatically detects changes and:
   - Applies new migrations to the database
   - Deploys updated edge functions

**Pros**: Automatic, secure, no credentials needed  
**Cons**: Must go through git/Lovable pipeline

### Option 2: Export Credentials via Edge Function

Create an edge function to retrieve the service role key for local CLI use:

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Local Machine  │────▶│  get-service-key │────▶│  CLI Operations │
│  (Supabase CLI) │     │  Edge Function   │     │  db push, etc.  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

**Already exists**: `supabase/functions/get-service-key/`

**Steps**:
1. Call the edge function to get credentials
2. Use credentials with Supabase CLI locally
3. Run `supabase db push` or `supabase functions deploy`

### Option 3: Migrate to Your Own Supabase

If you need full CLI access:
1. Create a new Supabase project at supabase.com
2. Apply all migrations from `supabase/migrations/`
3. Deploy all edge functions from `supabase/functions/`
4. Update frontend environment variables

---

## Recommended Steps for Option 2

### Step 1: Get Project Credentials

You already have:
- **Project ID**: `rjajxabpndmpcgssymxw`
- **URL**: `https://rjajxabpndmpcgssymxw.supabase.co`

### Step 2: Retrieve Service Key

Call the existing edge function:
```bash
curl https://rjajxabpndmpcgssymxw.supabase.co/functions/v1/get-service-key
```

### Step 3: Configure Local CLI

```bash
# Link your local project
supabase link --project-ref rjajxabpndmpcgssymxw

# When prompted for database password, you'll need the service key
# or use the --db-url flag with the connection string
```

### Step 4: Push Changes

```bash
# Apply migrations
supabase db push

# Deploy all edge functions
supabase functions deploy

# Or deploy specific function
supabase functions deploy process-receipt
```

---

## Important Notes

| Concern | Details |
|---------|---------|
| **Migration conflicts** | Lovable may have already applied migrations - check `supabase_migrations` table |
| **Edge function secrets** | Secrets set in Lovable Cloud need to be re-added via CLI |
| **Database password** | Not directly available - use service role key or connection pooler |

## What I Can Help With

1. **Test the `get-service-key` function** to retrieve your credentials
2. **Create an export script** to backup your current database state
3. **Generate CLI commands** for deploying specific functions
4. **Check migration status** to see what's already applied

