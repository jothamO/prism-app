# How to Get Supabase Service Key from Lovable

## Method 1: From Lovable Project Settings (Recommended)

1. Go to your Lovable project: https://lovable.dev/projects/your-project
2. Click **"Settings"** in the left sidebar
3. Click **"Integrations"** tab
4. Look for **"Supabase"** section
5. You should see:
   - `SUPABASE_URL` (already visible)
   - `SUPABASE_ANON_KEY` (public key)
   - `SUPABASE_SERVICE_ROLE_KEY` ← **This is what you need!**

If you don't see the service role key in Lovable, use Method 2.

## Method 2: From Supabase Dashboard Directly

1. Go to https://supabase.com/dashboard
2. Select your project: `rjajxabpndmpcgssymxw`
3. Click **"Settings"** (gear icon in left sidebar)
4. Click **"API"**
5. Scroll to **"Project API keys"** section
6. Copy the **`service_role`** key (not the `anon` key!)

**Warning**: The service_role key has admin access - keep it secret!

## Method 3: From Supabase Edge Function Env

If you have access to your Supabase Edge Functions:

1. Go to Supabase Dashboard → Edge Functions
2. Click on any function (e.g., `telegram-bot`)
3. Check the environment variables
4. Look for `SUPABASE_SERVICE_ROLE_KEY`

## Railway Environment Variables Format

**IMPORTANT**: Railway expects individual environment variables, NOT a .env file!

Add each variable separately in Railway dashboard:

```
Variable Name: SUPABASE_URL
Value: https://rjajxabpndmpcgssymxw.supabase.co

Variable Name: SUPABASE_SERVICE_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqYWp4YWJwbmRtcGNnc3N5bXh3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTYzODM2NzI5MCwiZXhwIjoxOTUzOTQzMjkwfQ.xxxxxxxxxxxxxxxxxxxxx

Variable Name: ANTHROPIC_API_KEY
Value: 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

Variable Name: PORT
Value: 18789

Variable Name: NODE_ENV
Value: production

Variable Name: ALLOWED_ORIGINS
Value: https://2507f1be-15c2-4df7-97a2-4b19e688c3cd.lovableproject.com

Variable Name: MAX_SESSIONS
Value: 10000

Variable Name: SESSION_TTL_MINUTES
Value: 60

Variable Name: IDEMPOTENCY_TTL_MINUTES
Value: 5

Variable Name: MAX_IDEMPOTENCY_KEYS
Value: 1000
```

## Fix Railway Deployment Error

The error happened because Railway tried to parse `.env.example` as environment variables.

**Solution**:

1. Delete all environment variables in Railway
2. Add them one by one using the format above
3. Click "Deploy" again

## Quick Test After Adding Service Key

```bash
# Test Supabase connection
curl https://rjajxabpndmpcgssymxw.supabase.co/rest/v1/ \
  -H "apikey: YOUR_SERVICE_KEY" \
  -H "Authorization: Bearer YOUR_SERVICE_KEY"

# Should return: {"message":"The server is running"}
```
