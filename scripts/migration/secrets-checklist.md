# Secrets Checklist for Self-Hosted Supabase

## Target: https://mgozsryewbirhxjpcuvy.supabase.co

Add these secrets in your Supabase Dashboard: **Settings → Edge Functions → Secrets**

---

## 🔴 Required Secrets (13 total)

### AI & Document Processing
| Secret | Description | Where to get it |
|--------|-------------|-----------------|
| `ANTHROPIC_API_KEY` | Claude AI for OCR and document processing | https://console.anthropic.com/settings/keys |

### Banking & Identity (Mono)
| Secret | Description | Where to get it |
|--------|-------------|-----------------|
| `MONO_SECRET_KEY` | Server-side API calls | https://app.withmono.com/apps |
| `MONO_PUBLIC_KEY` | Widget initialization (client-side) | https://app.withmono.com/apps |

### Payments (Paystack)
| Secret | Description | Where to get it |
|--------|-------------|-----------------|
| `PAYSTACK_SECRET_KEY` | Payment processing | https://dashboard.paystack.com/#/settings/developers |

### Messaging
| Secret | Description | Where to get it |
|--------|-------------|-----------------|
| `TELEGRAM_BOT_TOKEN` | Bot API access | @BotFather on Telegram |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook validation | Generate a random UUID |
| `RESEND_API_KEY` | Email sending | https://resend.com/api-keys |

### Development Tools
| Secret | Description | Where to get it |
|--------|-------------|-----------------|
| `GITHUB_TOKEN` | GitHub releases and API | https://github.com/settings/tokens |
| `FIRECRAWL_API_KEY` | Web scraping | https://firecrawl.dev |

### External Services
| Secret | Description | Where to get it |
|--------|-------------|-----------------|
| `RAILWAY_GATEWAY_URL` | Your Railway deployment URL | Railway dashboard |
| `GOOGLE_CLOUD_CREDENTIALS` | GCP service account JSON | GCP Console → IAM |
| `GOOGLE_CLOUD_PROJECT_ID` | GCP project ID | GCP Console |

### Lovable AI (Optional)
| Secret | Description | Where to get it |
|--------|-------------|-----------------|
| `LOVABLE_API_KEY` | Lovable AI models | Your Lovable workspace |

---

## 🟢 Auto-Provided by Supabase

These are automatically injected - DO NOT add manually:

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Your project URL |
| `SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin service key |

---

## Quick Copy Commands

### Using Supabase CLI

```bash
# Set secrets via CLI
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx --project-ref mgozsryewbirhxjpcuvy
supabase secrets set MONO_SECRET_KEY=live_sk_xxxxx --project-ref mgozsryewbirhxjpcuvy
supabase secrets set MONO_PUBLIC_KEY=live_pk_xxxxx --project-ref mgozsryewbirhxjpcuvy
supabase secrets set PAYSTACK_SECRET_KEY=sk_live_xxxxx --project-ref mgozsryewbirhxjpcuvy
supabase secrets set TELEGRAM_BOT_TOKEN=123456:ABC-DEF --project-ref mgozsryewbirhxjpcuvy
supabase secrets set TELEGRAM_WEBHOOK_SECRET=your-secret --project-ref mgozsryewbirhxjpcuvy
supabase secrets set RESEND_API_KEY=re_xxxxx --project-ref mgozsryewbirhxjpcuvy
supabase secrets set GITHUB_TOKEN=ghp_xxxxx --project-ref mgozsryewbirhxjpcuvy
```

### Verify Secrets

```bash
supabase secrets list --project-ref mgozsryewbirhxjpcuvy
```

---

## Verification

After setting secrets, test the edge functions:

```bash
# Test basic function
curl https://mgozsryewbirhxjpcuvy.supabase.co/functions/v1/get-service-key

# Test with auth (requires anon key)
curl https://mgozsryewbirhxjpcuvy.supabase.co/functions/v1/vat-calculator \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"amount": 100000}'
```
