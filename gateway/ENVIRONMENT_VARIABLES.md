# Railway Gateway Environment Variables

Complete documentation for all environment variables needed to deploy the PRISM Gateway on Railway.

## Quick Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_URL` | ✅ Yes | - | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | ✅ Yes | - | Supabase service role key |
| `ANTHROPIC_API_KEY` | ✅ Yes | - | Anthropic API key for AI |
| `MONO_SECRET_KEY` | ⚡ Recommended | - | Mono API secret for ID verification |
| `MONO_PUBLIC_KEY` | ⚡ Recommended | - | Mono API public key |
| `PORT` | ❌ No | `18789` | Server port |
| `NODE_ENV` | ❌ No | `development` | Environment mode |
| `ALLOWED_ORIGINS` | ❌ No | Lovable app URL | CORS allowed origins |
| `MAX_SESSIONS` | ❌ No | `10000` | Max concurrent sessions |
| `SESSION_TTL_MINUTES` | ❌ No | `60` | Session timeout |
| `IDEMPOTENCY_TTL_MINUTES` | ❌ No | `60` | Idempotency key TTL |
| `MAX_IDEMPOTENCY_KEYS` | ❌ No | `10000` | Max idempotency keys |

---

## Required Variables

### `SUPABASE_URL`
- **Required**: Yes
- **Description**: Full URL of your Supabase project
- **Format**: `https://<project-id>.supabase.co`
- **Example**: `https://rjajxabpndmpcgssymxw.supabase.co`
- **How to get**: Lovable Cloud → Backend → Settings, or Supabase Dashboard → Settings → API

### `SUPABASE_SERVICE_KEY`
- **Required**: Yes
- **Description**: Service role key with admin access (bypasses RLS)
- **Format**: JWT token starting with `eyJ...`
- **Security**: ⚠️ NEVER expose this key publicly
- **How to get**: 
  1. Lovable Cloud → Backend → API Keys
  2. Or: Supabase Dashboard → Settings → API → `service_role` key

### `ANTHROPIC_API_KEY`
- **Required**: Yes
- **Description**: API key for Claude AI (document processing, classification)
- **Format**: `sk-ant-api03-...`
- **How to get**: [console.anthropic.com](https://console.anthropic.com/)
- **Used by**: Document processing, AI classification, receipt OCR

---

## Recommended Variables

### `MONO_SECRET_KEY`
- **Required**: No (but needed for ID verification)
- **Description**: Mono API secret key for NIN/CAC/TIN/BVN verification
- **Format**: `live_sk_...` (production) or `test_sk_...` (sandbox)
- **How to get**: [app.withmono.com](https://app.withmono.com/) → API Keys
- **Used by**: Identity verification skill
- **Note**: Without this, ID verification runs in demo mode

### `MONO_PUBLIC_KEY`
- **Required**: No (but recommended with MONO_SECRET_KEY)
- **Description**: Mono API public key for Mono Connect widget
- **Format**: `live_pk_...` or `test_pk_...`
- **How to get**: Same as MONO_SECRET_KEY

---

## Optional Variables

### `PORT`
- **Default**: `18789`
- **Description**: HTTP server port
- **Railway note**: Railway assigns a port automatically via `PORT` env var

### `NODE_ENV`
- **Default**: `development`
- **Recommended**: `production` for Railway
- **Description**: Node.js environment mode
- **Values**: `development`, `production`, `test`

### `ALLOWED_ORIGINS`
- **Default**: `https://prismtaxassistant.lovable.app`
- **Description**: Comma-separated list of allowed CORS origins
- **Format**: `https://domain1.com,https://domain2.com`
- **Example**: `https://2507f1be-15c2-4df7-97a2-4b19e688c3cd.lovableproject.com`

### `MAX_SESSIONS`
- **Default**: `10000`
- **Description**: Maximum concurrent chatbot sessions in memory
- **Adjust**: Reduce if experiencing memory issues

### `SESSION_TTL_MINUTES`
- **Default**: `60`
- **Description**: Session timeout in minutes
- **Adjust**: Increase for longer conversations

### `IDEMPOTENCY_TTL_MINUTES`
- **Default**: `60`
- **Description**: How long to cache idempotency keys
- **Purpose**: Prevents duplicate message processing

### `MAX_IDEMPOTENCY_KEYS`
- **Default**: `10000`
- **Description**: Maximum idempotency keys to store
- **Adjust**: Usually doesn't need changing

---

## Railway Configuration

### Step-by-Step Setup

1. **Go to Railway Dashboard**
   - Navigate to your `prism-app` service
   - Click **Variables** tab

2. **Add Required Variables**
   ```
   SUPABASE_URL = https://rjajxabpndmpcgssymxw.supabase.co
   SUPABASE_SERVICE_KEY = eyJ... (your service role key)
   ANTHROPIC_API_KEY = sk-ant-api03-...
   ```

3. **Add Recommended Variables**
   ```
   MONO_SECRET_KEY = live_sk_... (from Mono dashboard)
   MONO_PUBLIC_KEY = live_pk_... (from Mono dashboard)
   ```

4. **Add Production Settings**
   ```
   NODE_ENV = production
   ALLOWED_ORIGINS = https://2507f1be-15c2-4df7-97a2-4b19e688c3cd.lovableproject.com
   ```

5. **Deploy**
   - Click **Deploy** to apply changes
   - Check logs for any startup errors

### Verify Configuration

After deployment, test the health endpoint:

```bash
curl https://your-railway-url.up.railway.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "timestamp": "...",
  "skills": ["document-processing", "vat-calculation", "tax-calculation", "identity-verification", "receipt-processing"]
}
```

---

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Missing required environment variable: SUPABASE_URL` | Variable not set | Add SUPABASE_URL in Railway |
| `Missing required environment variable: SUPABASE_SERVICE_KEY` | Variable not set | Add SUPABASE_SERVICE_KEY |
| `Mono API error: 401` | Invalid MONO_SECRET_KEY | Check key is correct and not expired |
| `CORS error` | Origin not allowed | Add your app URL to ALLOWED_ORIGINS |
| `Connection refused` | Port mismatch | Let Railway assign PORT automatically |

### Getting SUPABASE_SERVICE_KEY

1. **From Lovable Cloud**:
   - Go to your project → Backend
   - Look for API Keys or Settings section

2. **From Supabase Dashboard**:
   - Go to [supabase.com/dashboard](https://supabase.com/dashboard)
   - Select project → Settings → API
   - Copy the `service_role` key (NOT the `anon` key)

### Verifying Skills

Test each skill via the simulator or direct API:

```bash
# Test document processing
curl -X POST https://your-url/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Process bank statement", "userId": "test-123"}'

# Test identity verification
curl -X POST https://your-url/message \
  -H "Content-Type: application/json" \
  -d '{"message": "verify NIN 12345678901", "userId": "test-123"}'
```

---

## Security Recommendations

1. **Never commit secrets** - Use Railway's environment variables
2. **Use production keys** - Don't use test/sandbox keys in production
3. **Rotate keys regularly** - Especially if exposed
4. **Limit ALLOWED_ORIGINS** - Only allow your actual app domains
5. **Monitor usage** - Check Mono and Anthropic dashboards for unusual activity
