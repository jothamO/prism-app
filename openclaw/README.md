# PRISM OpenClaw Setup

This directory contains the OpenClaw configuration for PRISM.

## Quick Start

```bash
# Install dependencies
cd openclaw
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Run setup wizard
npm run wizard

# Start gateway
npm start
```

## Directory Structure

```
openclaw/
├── openclaw.json       # Main configuration
├── package.json        # Dependencies
├── .env.example        # Environment template
└── workspace/
    ├── SOUL.md         # PRISM personality
    ├── TOOLS.md        # Available tools
    ├── tools/
    │   └── prism-tools.ts  # Supabase integrations
    └── skills/
        ├── prism-tax/      # Income tax calculations
        ├── prism-vat/      # VAT calculations
        ├── prism-onboarding/  # User onboarding
        ├── prism-documents/   # Bank statement/receipt processing
        └── prism-identity/    # NIN/TIN/CAC verification
```

## Agent Routing

| Who | Agent | Access |
|-----|-------|--------|
| Jotham (owner) | `owner` | Full (all tools, no sandbox) |
| All users | `prism` | Limited (prism_* tools only, sandboxed) |

Owner is identified by:
- Email: jothamossai@gmail.com
- Telegram ID: 1389215188

## Channels

- **Telegram**: Enabled (requires TELEGRAM_BOT_TOKEN)
- **WhatsApp**: Enabled (requires QR pairing)
- **WebChat**: Enabled (embed in PRISM frontend)

## Next Steps

1. Set environment variables in `.env`
2. Run `npm run wizard` to complete setup
3. Pair WhatsApp by scanning QR code
4. Update Telegram webhook to point to OpenClaw
5. Test with owner and user accounts
