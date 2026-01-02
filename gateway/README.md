# PRISM Clawdis Gateway

Tax-restricted AI assistant control plane for PRISM chatbot.

## Features

- ✅ WebSocket server for real-time communication
- ✅ Session management with Supabase
- ✅ Skills system (tax-restricted)
- ✅ Claude Haiku 4.5 integration
- ✅ Idempotency handling
- ✅ Multi-platform support (WhatsApp, Telegram)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Update `.env` with your credentials:
   - Supabase URL and service key
   - Anthropic API key
   - Allowed origins

4. Run in development:
```bash
npm run dev
```

5. Build for production:
```bash
npm run build
npm start
```

## Deployment (Railway)

1. Create new Railway project
2. Connect GitHub repo
3. Set environment variables in Railway dashboard
4. Deploy!

Railway will automatically:
- Run `npm install && npm run build`
- Start with `npm start`
- Monitor `/health` endpoint

## Project Structure

```
gateway/
├── src/
│   ├── index.ts                 # Entry point
│   ├── gateway-server.ts        # WebSocket server
│   ├── session-manager.ts       # Session management
│   ├── protocol.ts              # Protocol definitions
│   ├── idempotency.ts           # Idempotency handler
│   ├── skills/                  # Skills directory
│   │   ├── skill-router.ts
│   │   └── document-processing/
│   └── services/
│       ├── claude.service.ts
│       └── supabase.service.ts
├── package.json
├── tsconfig.json
└── README.md
```

## API

### WebSocket

Connect to `ws://localhost:18789`

Send:
```json
{
  "method": "sendMessage",
  "params": {
    "userId": "user123",
    "platform": "whatsapp",
    "message": "Upload bank statement",
    "idempotencyKey": "msg_123"
  }
}
```

### HTTP Endpoints

- `GET /health` - Health check
- `POST /chat` - Send message (alternative to WebSocket)
- `POST /document/process` - Upload document

## Testing

```bash
npm test
```

## License

MIT
