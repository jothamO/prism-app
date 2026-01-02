# Railway Deployment Checklist

## ✅ Pre-Deployment (Complete)

- [x] Gateway code pushed to GitHub
- [x] Commit: 9f52e22
- [x] Files: 14 files created in `gateway/` directory

## 📋 Deployment Steps

### Step 1: Run Supabase Migration

1. Go to your Supabase project dashboard
2. Click "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy and paste the contents of `gateway/migrations/001_chatbot_sessions.sql`
5. Click "Run"
6. Verify: `SELECT * FROM chatbot_sessions LIMIT 1;`

### Step 2: Create Railway Project

1. Go to [railway.app/new](https://railway.app/new)
2. Click "Deploy from GitHub repo"
3. Select `jothamO/prism-app` repository
4. Click "Add variables" before deploying

### Step 3: Configure Environment Variables

Add these in Railway dashboard:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
ANTHROPIC_API_KEY=sk-ant-api03-...
PORT=18789
NODE_ENV=production
ALLOWED_ORIGINS=https://your-lovable-domain.lovable.app
MAX_SESSIONS=10000
SESSION_TTL_MINUTES=60
IDEMPOTENCY_TTL_MINUTES=5
MAX_IDEMPOTENCY_KEYS=1000
```

**Where to find values**:
- `SUPABASE_URL`: Supabase Dashboard → Settings → API → Project URL
- `SUPABASE_SERVICE_KEY`: Supabase Dashboard → Settings → API → service_role key
- `ANTHROPIC_API_KEY`: [console.anthropic.com](https://console.anthropic.com) → API Keys
- `ALLOWED_ORIGINS`: Your Lovable project URL

### Step 4: Configure Build Settings

In Railway dashboard:
1. Click "Settings"
2. Set "Root Directory": `gateway`
3. Build Command: `npm install && npm run build` (auto-detected)
4. Start Command: `npm start` (auto-detected)
5. Click "Deploy"

### Step 5: Verify Deployment

Wait for deployment to complete (2-3 minutes), then:

1. Copy your Railway URL (e.g., `https://prism-gateway-production.up.railway.app`)
2. Test health endpoint:
   ```bash
   curl https://your-gateway.railway.app/health
   ```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-02T19:45:00.000Z",
  "uptime": 10.5,
  "sessions": { "size": 0, "max": 10000 },
  "idempotency": { "size": 0, "max": 1000 },
  "connectedClients": 0
}
```

### Step 6: Update Lovable Environment

1. Go to Lovable project settings
2. Add environment variable:
   ```
   RAILWAY_GATEWAY_URL=https://your-gateway.railway.app
   ```
3. Redeploy Lovable Edge Functions

### Step 7: Test End-to-End

1. Send a message to your Telegram/WhatsApp bot
2. Check Railway logs for incoming request
3. Verify response is sent back

## 🔍 Monitoring

### Railway Dashboard
- **Logs**: Real-time logs of all requests
- **Metrics**: CPU, memory, network usage
- **Deployments**: History of all deployments

### Health Check
Set up external monitoring (e.g., UptimeRobot):
- URL: `https://your-gateway.railway.app/health`
- Interval: Every 5 minutes
- Alert: Email/SMS if down

## 🐛 Troubleshooting

### Build fails
- Check Railway logs for error
- Verify `package.json` is correct
- Ensure `gateway/` directory exists

### "Missing Supabase credentials"
- Verify environment variables are set
- Check service key has correct permissions
- Test connection: `curl $SUPABASE_URL/rest/v1/`

### "Missing Anthropic API key"
- Verify key is set in Railway
- Test key: `curl https://api.anthropic.com/v1/messages -H "x-api-key: $ANTHROPIC_API_KEY"`

### High memory usage
- Reduce `MAX_SESSIONS` to 5000
- Check for memory leaks in logs
- Restart deployment

## 💰 Cost Estimate

**Railway Hobby Plan**: $5/month
- 500 execution hours/month
- $0.000231/GB-hour memory
- $0.000463/vCPU-hour CPU

**Estimated monthly cost**: $5-7/month for typical usage

## 📊 Success Criteria

- [ ] Health endpoint returns 200 OK
- [ ] Supabase connection working
- [ ] Session creation/retrieval working
- [ ] Idempotency preventing duplicates
- [ ] WebSocket connections accepted
- [ ] Logs show no errors

## 🎉 Next Steps After Deployment

1. Test with real Telegram/WhatsApp message
2. Monitor logs for 24 hours
3. Set up alerts for errors
4. Proceed to Phase 2: Document Processing Skill
