# Gateway Deployment Guide

## Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **Anthropic API Key**: Get from [console.anthropic.com](https://console.anthropic.com)
3. **Supabase Project**: Existing PRISM Supabase project

## Step 1: Database Setup

Run the migration in Supabase SQL Editor:

```sql
-- File: migrations/001_chatbot_sessions.sql
-- Copy and paste the entire file
```

Verify table created:
```sql
SELECT * FROM chatbot_sessions LIMIT 1;
```

## Step 2: Railway Setup

1. Go to [railway.app/new](https://railway.app/new)
2. Click "Deploy from GitHub repo"
3. Select `prism-app` repository
4. Set root directory: `gateway`

## Step 3: Environment Variables

In Railway dashboard, add these variables:

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

## Step 4: Deploy

Railway will automatically:
1. Run `npm install && npm run build`
2. Start with `npm start`
3. Monitor `/health` endpoint

## Step 5: Verify Deployment

Check health endpoint:
```bash
curl https://your-gateway.railway.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-02T19:20:00.000Z",
  "uptime": 123.45,
  "sessions": { "size": 0, "max": 10000 },
  "idempotency": { "size": 0, "max": 1000 },
  "connectedClients": 0
}
```

## Step 6: Update Lovable Edge Functions

Add environment variable in Lovable:
```
RAILWAY_GATEWAY_URL=https://your-gateway.railway.app
```

Update `supabase/functions/telegram-bot/index.ts`:
```typescript
const gatewayUrl = Deno.env.get('RAILWAY_GATEWAY_URL');
const response = await fetch(`${gatewayUrl}/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: message.from.id,
    platform: 'telegram',
    message: message.text,
    idempotencyKey: message.message_id.toString()
  })
});
```

## Step 7: Test End-to-End

1. Send message to Telegram bot
2. Check Railway logs for incoming request
3. Verify response sent back to Telegram

## Monitoring

### Railway Dashboard
- View logs in real-time
- Monitor CPU/memory usage
- Check deployment history

### Health Checks
Set up monitoring (e.g., UptimeRobot) to ping `/health` every 5 minutes

### Alerts
Configure Railway to alert on:
- Deployment failures
- High error rates
- Resource limits

## Troubleshooting

### "Missing Supabase credentials"
- Check `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set
- Verify service key has correct permissions

### "Missing Anthropic API key"
- Check `ANTHROPIC_API_KEY` is set
- Verify key is valid at console.anthropic.com

### WebSocket connection fails
- Check `ALLOWED_ORIGINS` includes your Lovable domain
- Verify Railway is listening on `0.0.0.0:18789`

### High memory usage
- Reduce `MAX_SESSIONS` if needed
- Check for memory leaks in logs

## Rollback

If deployment fails:
1. Go to Railway dashboard
2. Click "Deployments"
3. Select previous working deployment
4. Click "Redeploy"

## Cost Monitoring

Railway Hobby plan: $5/month
- Includes 500 hours/month
- $0.000231/GB-hour for memory
- $0.000463/vCPU-hour

Monitor usage in Railway dashboard to avoid overages.
