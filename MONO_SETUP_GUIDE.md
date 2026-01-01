# Adding MONO_SECRET_KEY to Supabase

## Step 1: Get Your Mono API Key

### If you have a Mono account:
1. Log in to https://app.mono.co
2. Go to **Settings** → **API Keys**
3. Copy your **Secret Key** (starts with `test_sk_` for sandbox or `live_sk_` for production)

### If you DON'T have a Mono account yet:
1. Sign up at https://app.mono.co
2. Verify your email
3. Complete onboarding
4. Go to **Settings** → **API Keys**
5. Use **Sandbox** keys for testing (free)

---

## Step 2: Add Secret to Supabase

### Option A: Via Supabase Dashboard (Recommended)

1. Go to your Supabase project: https://supabase.com/dashboard

2. Click on your project (prism-app)

3. Navigate to:
   ```
   Project Settings (gear icon) → Edge Functions → Secrets
   ```

4. Click **"Add a new secret"**

5. Enter:
   - **Name**: `MONO_SECRET_KEY`
   - **Value**: `test_sk_YOUR_KEY_HERE` (paste your Mono key)

6. Click **Save**

7. **Important**: Redeploy the function:
   - Go to **Edge Functions** tab
   - Find `telegram-bot`
   - Click **Deploy** or just save any file in Lovable (auto-redeploys)

### Option B: Via Supabase CLI

```bash
# Login to Supabase
npx supabase login

# Link to your project
npx supabase link

# Set the secret
npx supabase secrets set MONO_SECRET_KEY=test_sk_YOUR_KEY_HERE

# Redeploy Edge Functions
npx supabase functions deploy telegram-bot
```

---

## Step 3: Verify It Works

### Test 1: Check Logs

1. Go to **Supabase Dashboard** → **Edge Functions** → `telegram-bot`
2. Click **Logs**
3. Send a message to your Telegram bot
4. Look for:
   ```
   [NIN Verification] Verifying NIN: 659***
   [NIN Verification] Response status: success
   ```

### Test 2: Use Telegram Bot

1. Open Telegram
2. Message your bot
3. Send `/start`
4. Choose "Individual"
5. Enter a test NIN (from Mono sandbox docs)
6. **Should see**: "Welcome, [Real Name]!" instead of "Test User"

---

## Mono Sandbox Test Credentials

### For Sandbox Testing (Before using real NINs):

**Test NIN**: Check https://docs.mono.co/docs/sandbox#lookup for valid test NINs

**Or use Mono's Developer Portal**:
- Login to https://app.mono.co
- Go to "Sandbox" section
- View test credentials

---

## Troubleshooting

### If bot still shows "Test User":

**Check 1: Is MONO_SECRET_KEY set?**
```bash
# Via Supabase CLI
npx supabase secrets list
```

**Check 2: Did function redeploy?**
- Make a small change to any file in Lovable
- Or manually redeploy in Supabase Dashboard

**Check 3: Check logs for errors**
- Supabase Dashboard → Edge Functions → telegram-bot → Logs
- Look for "MONO_SECRET_KEY not configured" or API errors

### If you see "User (Mock - Add MONO_SECRET_KEY)":
- The secret is not set or function hasn't redeployed
- Follow Step 2 again

### If you see "NIN verification failed":
- Check your Mono API key is valid
- Verify you're using the correct environment (sandbox vs live)
- Check Mono dashboard for API usage/errors

---

## Cost & Limits

### Mono Lookup API Pricing:
- **Sandbox**: Free (for testing only)
- **Production**: Pay-per-lookup
  - Contact Mono sales for exact pricing
  - Typically: ₦50-200 per NIN verification

### Daily Limits:
- **Sandbox**: Usually 100-1000 lookups/day
- **Production**: Based on your plan

### Optimization Tip:
- Cache verification results in database (30 days)
- Reduces API calls by 90%+

---

## Next Steps

After adding the secret:

1. ✅ Test with Mono sandbox NIN
2. ✅ Verify bot shows real name
3. ✅ Test with your own NIN (if comfortable)
4. ✅ Invite alpha testers
5. ✅ Monitor Mono API usage in dashboard

---

## Production Checklist

Before switching to `live_sk_` keys:

- [ ] Test sandbox thoroughly
- [ ] Review Mono pricing
- [ ] Set up usage alerts in Mono dashboard
- [ ] Implement caching to reduce costs
- [ ] Update privacy policy (data processing disclosure)
- [ ] Add error handling for rate limits

---

**Ready to test!** 🚀

Once you add `MONO_SECRET_KEY`, the bot will show real names instead of "Test User".
