# Telegram Bot Alpha Testing Setup

## Quick Start (5 minutes)

### 1. Create Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Send `/newbot`
3. Name: `PRISM Tax Assistant`  
4. Username: `your_unique_name_bot` (must end with 'bot')
5. Copy the token (looks like: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Add Token to Environment

```bash
# .env file
TELEGRAM_BOT_TOKEN=your_token_here
```

### 3. Install Dependencies

The package is already installing in the background. Wait for it to complete.

### 4. Start the Bot

```bash
npm run dev
```

The bot will automatically start if `TELEGRAM_BOT_TOKEN` is set.

### 5. Test It!

1. Open Telegram
2. Search for your bot (@your_unique_name_bot)
3. Send `/start`
4. Bot should respond: "👋 Welcome to PRISM!"

---

## Features Implemented

### ✅ Onboarding Flow
- Entity type selection (Individual/Business)
- NIN verification (11 digits)
- CAC verification (RC/BN format)
- Mock API for alpha testing

### ✅ Receipt Processing
- Photo upload support
- OCR extraction (placeholder)
- Auto-categorization

### ✅ Conversation Management
- State tracking
- Multi-step flows
- Button interactions

### ✅ Platform-Agnostic Design
- Same codebase works for WhatsApp
- Easy migration path
- Reusable message handler

---

## Testing Checklist

- [ ] Bot responds to /start
- [ ] Entity type selection works
- [ ] NIN input validates format
- [ ] CAC input validates format
- [ ] Buttons display correctly
- [ ] Photo upload works
- [ ] Help command works

---

## Files Created

1. `src/services/telegram-bot.service.ts` - Main bot service
2. `src/services/message-handler.service.ts` - Platform-agnostic logic
3. `src/services/tax-id-resolver.service.ts` - NIN/CAC validation
4. `src/bot.ts` - Bot initialization

---

## Next Steps

1. Wait for npm install to complete
2. Add TELEGRAM_BOT_TOKEN to .env
3. Start server: `npm run dev`
4. Test onboarding flow
5. Invite 3-5 friends for alpha testing

---

## Migration to WhatsApp (Later)

When ready to switch to WhatsApp:

1. Create Meta developer account
2. Get WhatsApp Cloud API credentials
3. Update platform in code: `new MessageHandlerService('whatsapp')`
4. Deploy webhook
5. Done! Same logic, new platform.

**Estimated Migration Time**: 2 hours

---

## Cost

**Alpha (Telegram)**: $0 unlimited  
**Beta (WhatsApp)**: $0 for first 1K conversations/month  
**Production**: ~$25/month for 1,000 users
