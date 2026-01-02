# Gateway Adapter Setup

## New Edge Functions Created

1. **telegram-bot-gateway** - Simplified Telegram adapter
2. **whatsapp-bot-gateway** - Simplified WhatsApp adapter

These replace the existing complex bot logic by forwarding everything to the Railway Gateway.

## Deployment Steps

### 1. Add Railway Gateway URL to Lovable

In your Lovable project settings, add this environment variable:

```
RAILWAY_GATEWAY_URL=https://your-gateway-domain.railway.app
```

(Replace with your actual Railway domain)

### 2. Deploy New Edge Functions

The new functions will auto-deploy when you push to GitHub.

### 3. Update Telegram Webhook (Optional)

If you want to switch Telegram to use the new adapter:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://rjajxabpndmpcgssymxw.supabase.co/functions/v1/telegram-bot-gateway"
  }'
```

### 4. Test the Integration

Send a message to your Telegram bot. It should:
1. Hit the Edge Function
2. Forward to Railway Gateway
3. Gateway processes and responds
4. Response sent back to Telegram

## Architecture Flow

```
User (Telegram/WhatsApp)
    ↓
Edge Function (telegram-bot-gateway / whatsapp-bot-gateway)
    ↓
Railway Gateway (/chat endpoint)
    ↓
Session Manager + Skills
    ↓
Response back to user
```

## Benefits

- ✅ Centralized message handling in Gateway
- ✅ Session management in one place
- ✅ Easy to add new skills
- ✅ Consistent behavior across platforms
- ✅ Easier to test and debug

## Monitoring

Check Railway logs to see incoming messages:
```
[Telegram] Forwarding to Gateway: 123456 - /start
[Gateway Response] Success
```

## Rollback Plan

If issues occur, you can:
1. Switch webhook back to `telegram-bot` (old function)
2. Keep using existing Edge Functions
3. Debug Gateway separately

The old Edge Functions are still there and working!
