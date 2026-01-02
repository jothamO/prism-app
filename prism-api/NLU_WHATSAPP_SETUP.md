# NLU & WhatsApp Buttons - Quick Start Guide

## What's New

### 3 Major Features Added:

1. **✅ Natural Language Understanding (Gemini 3 Flash)**
   - Understands plain English instead of commands
   - Example: "show me my house project spending" → executes query

2. **✅ WhatsApp Interactive Buttons**
   - Reply Buttons (max 3) for choices
   - List Messages (max 10) for categories

3. **✅ Intent Router**
   - Routes NLU to appropriate handlers
   - Preserves onboarding flow

---

## Setup

### 1. Environment Variables

Add to `.env`:

```bash
# Already have this (for Telegram bot OCR)
LOVABLE_API_KEY=your_lovable_key_here

# WhatsApp Cloud API (if using WhatsApp)
WHATSAPP_ACCESS_TOKEN=your_whatsapp_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_id
```

### Get Lovable API Key:
- Already configured if Telegram bot OCR is working
- Used for Gemini 3 Flash NLU

### Get WhatsApp Credentials:
1. Go to https://developers.facebook.com
2. Create Meta Business App
3. Add WhatsApp product
4. Get Access Token + Phone Number ID

---

## Testing NLU

### Test 1: Transaction Query

**User says:** "Hey Prism, show me what I spent on the house project last week"

**NLU classifies as:**
```json
{
  "intent": "get_transaction_summary",
  "confidence": 0.92,
  "entities": {
    "project": "house project",
    "timeframe": "last week"
  }
}
```

**Bot responds with (WhatsApp):**
- List Message with options

### Test 2: Tax Relief Query

**User says:** "How much can I save on rent relief?"

**NLU classifies as:**
```json
{
  "intent": "get_tax_relief_info",
  "confidence": 0.88,
  "entities": {
    "relief_type": "rent"
  }
}
```

**Bot responds with:**
- List Message showing all tax reliefs

### Test 3: Suspicious Categorization (Section 191)

**User says:** "Tag my new TV as a business expense"

**NLU detects artificial transaction:**
```json
{
  "intent": "artificial_transaction_warning",
  "confidence": 0.95,
  "entities": {
    "item": "TV",
    "claimed_category": "business expense"
  }
}
```

**Bot warns:**
```
⚠️ Tax Compliance Warning (Section 191)

Claiming "TV" as "business expense" may be viewed as an artificial transaction by FIRS.

This is typically a personal expense. Are you sure?

[Yes, Proceed] [Recategorize] [Cancel]
```

---

## WhatsApp Button Examples

### Example 1: Reply Buttons (Onboarding)

```typescript
// After user sends /start
await whatsappInteractiveService.sendReplyButtons(
  userPhone,
  "👋 Welcome to PRISM!\n\nAre you registering as an individual or a business?",
  [
    { id: 'entity_individual', title: '👤 Individual' },
    { id: 'entity_business', title: '🏢 Business' }
  ]
);
```

**User sees:**
```
👋 Welcome to PRISM!

Are you registering as an individual or a business?

[👤 Individual] [🏢 Business]
```

### Example 2: List Message (Tax Reliefs)

```typescript
await whatsappInteractiveService.sendListMessage(
  userPhone,
  {
    header: 'Tax Reliefs (NTA 2025)',
    body: "Which tax relief would you like to explore?",
    footer: 'Section 21 - Tax Act 2025',
    buttonText: 'View Reliefs',
    sections: [
      {
        title: 'Personal Reliefs',
        rows: [
          { id: 'relief_rent', title: 'Rent Relief (20%)', description: 'Max ₦500K/year' },
          { id: 'relief_pension', title: 'Pension (8%)', description: 'Mandatory contribution' }
        ]
      },
      {
        title: 'Business Reliefs',
        rows: [
          { id: 'relief_small_biz', title: 'Small Business 0%', description: 'Revenue < ₦50M' }
        ]
      }
    ]
  }
);
```

**User sees:**
```
Tax Reliefs (NTA 2025)

Which tax relief would you like to explore?

Section 21 - Tax Act 2025

[View Reliefs]

Personal Reliefs
├─ Rent Relief (20%) - Max ₦500K/year
├─ Pension (8%) - Mandatory contribution

Business Reliefs
├─ Small Business 0% - Revenue < ₦50M
```

---

## Integration with Existing Code

### WhatsApp Webhook Handler

```typescript
// In your WhatsApp webhook handler
import { intentRouterService } from './services/intent-router.service';
import { whatsappInteractiveService } from './services/whatsapp-interactive.service';

app.post('/webhooks/whatsapp', async (req, res) => {
  const webhookData = req.body;

  // Check for button response
  const buttonResponse = whatsappInteractiveService.handleButtonResponse(webhookData);

  if (buttonResponse) {
    // User clicked a button
    console.log(`Button clicked: ${buttonResponse.buttonId}`);

    // Route based on button ID
    const response = await intentRouterService.routeMessage(
      buttonResponse.userId,
      buttonResponse.buttonText, // Use button text as message
      'whatsapp'
    );

    // Send response
    if (response.useInteractiveButtons) {
      const buttonConfig = response.buttons[0];

      if (buttonConfig.type === 'reply') {
        await whatsappInteractiveService.sendReplyButtons(
          buttonResponse.userId,
          response.message + '\n\nSelect an option:',
          buttonConfig.options
        );
      } else if (buttonConfig.type === 'list') {
        await whatsappInteractiveService.sendListMessage(
          buttonResponse.userId,
          buttonConfig.options
        );
      }
    } else {
      await whatsappService.sendMessage(buttonResponse.userId, response.message);
    }

    return res.sendStatus(200);
  }

  // Handle regular text message
  const message = webhookData.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (message?.type === 'text') {
    const response = await intentRouterService.routeMessage(
      message.from,
      message.text.body,
      'whatsapp'
    );

    await whatsappService.sendMessage(message.from, response.message);
  }

  res.sendStatus(200);
});
```

---

## Verify It's Working

### Check 1: NLU Service

```bash
# Test NLU directly
curl -X POST http://localhost:3000/api/test-nlu \
  -H "Content-Type: application/json" \
  -d '{"message": "show me my spending this month"}'
```

**Expected response:**
```json
{
  "intent": "get_transaction_summary",
  "confidence": 0.85,
  "entities": {
    "timeframe": "this month"
  }
}
```

### Check 2: WhatsApp Buttons
1. Send message to WhatsApp test number
2. Should receive buttons (not plain text)
3. Click button
4. Should trigger appropriate handler

### Check 3: Logs

Look for:
```
[Intent Router] Detected: get_transaction_summary (confidence: 0.92)
[NLU Service] Using Gemini 3 Flash
[WhatsApp] Sending List Message with 5 options
```

---

## Troubleshooting

### NLU not working?

**Check 1:** Is `LOVABLE_API_KEY` set?
```bash
echo $LOVABLE_API_KEY
```

**Check 2:** Fallback detection active?
```
[NLU Service] LOVABLE_API_KEY not set, using fallback.
```
Fallback uses keyword matching (less accurate but works offline).

### WhatsApp buttons not showing?

**Issue 1:** Using 360Dialog instead of Cloud API
- Solution: 360Dialog has different button API, needs separate implementation.

**Issue 2:** More than 3 Reply Buttons
- Error: WhatsApp Reply Buttons limited to 3
- Solution: Use List Messages instead.

**Issue 3:** More than 10 List items
- Error: WhatsApp List Messages limited to 10 total rows
- Solution: Reduce options or split into categories.

### Button clicks not working?

Check webhook payload:
```json
{
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "type": "interactive",
          "interactive": {
            "button_reply": {
              "id": "entity_individual",
              "title": "👤 Individual"
            }
          }
        }]
      }
    }]
  }]
}
```

If missing `button_reply` or `list_reply`, webhook handler needs update.

---

## Next Steps

1. ✅ Test NLU with sample queries
2. ✅ Test WhatsApp buttons (if using WhatsApp)
3. ⏳ Add missing features:
   - Bank connection
   - Tax filing reminders
   - Monthly insights
4. ⏳ Deploy to production

---

## Cost

| Service | Cost |
|---------|------|
| Gemini 3 Flash | Free via Lovable AI |
| WhatsApp Buttons | Same as text ($0.005-0.03/msg) |
| Telegram | Free |

**Total Additional Cost: $0** 🎉

---

Ready to test! Send "show me my transactions" to your bot and watch the magic happen! ✨
