# Telegram Webhook Setup Guide

## Overview

Your Telegram bot receives messages via **webhooks** (Telegram calls your server when messages arrive) instead of polling (constantly asking Telegram for new messages).

## Current Status

✅ **Webhook URL**: `https://rjajxabpndmpcgssymxw.supabase.co/functions/v1/telegram-bot`  
⏳ **Webhook Secret**: Not yet configured (recommended for security)

---

## Step 1: Generate Webhook Secret (Optional but Recommended)

A webhook secret ensures that only Telegram can send requests to your bot (prevents fake requests from attackers).

### Generate a Strong Secret:

**Option A: Using PowerShell**
```powershell
# Generate a random 32-character secret
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

**Option B: Using Online Tool**
- Go to https://www.random.org/strings/
- Set: 32 characters, alphanumeric
- Click "Get Strings"

**Option C: Manual**
```
Example: aB3kL9mP2nQ7rS5tU8vW1xY4zC6dE0fG
```

**Save this secret** - you'll need it twice:
1. When setting up the webhook with Telegram
2. In your Supabase environment variables

---

## Step 2: Update Edge Function to Validate Secret

### Add Secret Validation to `telegram-bot/index.ts`

**Find line ~600** (in the main webhook handler, after health check):

**Add this code BEFORE processing the update**:

```typescript
// Handle Telegram webhook
if (req.method === "POST") {
  try {
    // NEW: Validate webhook secret
    const TELEGRAM_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
    
    if (TELEGRAM_WEBHOOK_SECRET) {
      const secretHeader = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
      
      if (secretHeader !== TELEGRAM_WEBHOOK_SECRET) {
        console.error("[Security] Invalid webhook secret");
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }
      
      console.log("[Security] Webhook secret validated ✓");
    }
    
    // Check if bot is enabled
    const botEnabled = await isBotEnabled();
    // ... rest of existing code
```

---

## Step 3: Add Secret to Supabase

### Via Supabase Dashboard:

1. Go to https://supabase.com/dashboard
2. Select your project
3. Navigate to: **Project Settings** → **Edge Functions** → **Secrets**
4. Click **"Add a new secret"**
5. Enter:
   - **Name**: `TELEGRAM_WEBHOOK_SECRET`
   - **Value**: `YOUR_32_CHARACTER_SECRET_HERE`
6. Click **Save**

---

## Step 4: Register Webhook with Telegram

You have **3 options**:

### Option A: Using Browser (Easiest)

1. Replace the values in this URL:
   ```
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://rjajxabpndmpcgssymxw.supabase.co/functions/v1/telegram-bot&secret_token=<YOUR_SECRET>
   ```

2. Example:
   ```
   https://api.telegram.org/bot7891234567:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw/setWebhook?url=https://rjajxabpndmpcgssymxw.supabase.co/functions/v1/telegram-bot&secret_token=aB3kL9mP2nQ7rS5tU8vW1xY4zC6dE0fG
   ```

3. Paste in browser and press Enter

4. You should see:
   ```json
   {
     "ok": true,
     "result": true,
     "description": "Webhook was set"
   }
   ```

### Option B: Using PowerShell

```powershell
$botToken = "YOUR_BOT_TOKEN_HERE"
$webhookUrl = "https://rjajxabpndmpcgssymxw.supabase.co/functions/v1/telegram-bot"
$secret = "YOUR_SECRET_HERE"

$url = "https://api.telegram.org/bot$botToken/setWebhook"
$body = @{
    url = $webhookUrl
    secret_token = $secret
} | ConvertTo-Json

Invoke-RestMethod -Uri $url -Method Post -Body $body -ContentType "application/json"
```

### Option C: Using the Built-in Setup Endpoint

1. Call your Edge Function's setup endpoint:
   ```
   https://rjajxabpndmpcgssymxw.supabase.co/functions/v1/telegram-bot?setup=true
   ```

2. **Note**: This uses the webhook URL without secret. You'll need to update it separately.

3. To add secret after:
   ```powershell
   # Update webhook with secret
   Invoke-RestMethod -Uri "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://rjajxabpndmpcgssymxw.supabase.co/functions/v1/telegram-bot&secret_token=<SECRET>"
   ```

---

## Step 5: Verify Webhook is Working

### Check Webhook Info:

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
```

**You should see**:
```json
{
  "ok": true,
  "result": {
    "url": "https://rjajxabpndmpcgssymxw.supabase.co/functions/v1/telegram-bot",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "max_connections": 40,
    "ip_address": "xxx.xxx.xxx.xxx"
  }
}
```

### Test the Bot:

1. Open Telegram
2. Send a message to your bot
3. Check Supabase logs:
   - Dashboard → Edge Functions → telegram-bot → Logs
   - Should see: `[Security] Webhook secret validated ✓`

---

## Security Best Practices

### 1. Always Use Secret Token in Production
- Prevents unauthorized requests
- Validates requests are from Telegram
- Free security layer

### 2. Rotate Secret Periodically
- Change secret every 3-6 months
- Update in both Supabase and Telegram

### 3. Monitor for Suspicious Activity
- Check Edge Function logs regularly
- Look for `Invalid webhook secret` errors
- Set up alerts for 403 responses

---

## Troubleshooting

### Bot not receiving messages?

**Check 1: Is webhook set?**
```
GET https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

**Check 2: Webhook responding?**
```
GET https://rjajxabpndmpcgssymxw.supabase.co/functions/v1/telegram-bot
```
Should return: `{"status":"ok","message":"Telegram bot is running"}`

**Check 3: Check Supabase logs**
- Look for errors
- Verify secret validation passes

**Check 4: Secret mismatch?**
- Verify `TELEGRAM_WEBHOOK_SECRET` in Supabase matches what you sent to Telegram
- Case-sensitive!

### Getting 403 Forbidden errors?

- Secret doesn't match
- Secret not set in Supabase
- Edge Function not redeployed after adding secret

### Messages delayed or not arriving?

- Check `pending_update_count` in webhook info
- If high (>100), webhook might be failing
- Check Supabase logs for errors

---

## Complete Checklist

- [ ] Generate 32-character random secret
- [ ] Add secret validation code to Edge Function
- [ ] Add `TELEGRAM_WEBHOOK_SECRET` to Supabase
- [ ] Register webhook with Telegram (with secret)
- [ ] Test: Send message to bot
- [ ] Verify: Check logs show "Webhook secret validated ✓"
- [ ] Check: `getWebhookInfo` shows correct URL
- [ ] Monitor: Set up alerts for 403 errors

---

## Quick Setup (TL;DR)

```powershell
# 1. Generate secret
$secret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
Write-Host "Your secret: $secret"

# 2. Add to Supabase Dashboard
# Project Settings → Edge Functions → Secrets → TELEGRAM_WEBHOOK_SECRET

# 3. Set webhook
$token = "YOUR_BOT_TOKEN"
$url = "https://api.telegram.org/bot$token/setWebhook?url=https://rjajxabpndmpcgssymxw.supabase.co/functions/v1/telegram-bot&secret_token=$secret"
Invoke-RestMethod -Uri $url

# 4. Verify
Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getWebhookInfo"
```

---

**Done!** Your Telegram bot now has secure webhook authentication. 🔒
