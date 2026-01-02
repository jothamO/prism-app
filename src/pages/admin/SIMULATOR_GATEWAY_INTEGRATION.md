# Connecting Admin Simulator to Gateway

## Overview

The Admin Simulator can now optionally use the Railway Gateway instead of local logic.

## Setup

### 1. Add Environment Variable

Create `.env.local` in the project root:

```env
VITE_RAILWAY_GATEWAY_URL=https://your-gateway-domain.railway.app
```

### 2. Use Gateway Client (Optional)

In `AdminSimulator.tsx`, you can replace the complex message handling with:

```typescript
import { gatewayClient } from '@/lib/gatewayClient';

const handleSendMessage = async () => {
  if (!inputMessage.trim()) return;

  // Option 1: Use Gateway (new)
  if (useGateway) {
    try {
      const response = await gatewayClient.sendMessage({
        userId: simulatorUserId,
        platform: 'simulator',
        message: inputMessage,
        idempotencyKey: `simulator_${simulatorUserId}_${Date.now()}`,
        metadata: {
          testMode,
          entityType
        }
      });

      addBotMessage(response.message, response.buttons);
    } catch (error) {
      addBotMessage('❌ Gateway connection failed. Using local mode.');
      // Fallback to local logic
    }
  } else {
    // Option 2: Keep existing local logic (current)
    // ... existing code ...
  }
};
```

### 3. Add Toggle in UI

Add a toggle to switch between Gateway and local mode:

```typescript
const [useGateway, setUseGateway] = useState(false);

// In the UI:
<Switch
  checked={useGateway}
  onCheckedChange={setUseGateway}
>
  Use Railway Gateway
</Switch>
```

## Benefits of Gateway Mode

- ✅ Same logic as Telegram/WhatsApp
- ✅ Test Gateway without deploying
- ✅ Debug Gateway responses  
- ✅ Consistent behavior across platforms

## Keeping Local Mode

You can keep the existing local simulator logic as fallback/testing.

The Gateway Client will automatically fall back to local mode if:
- Gateway is unreachable
- Environment variable not set
- User toggles Gateway off

## Testing

1. Start local dev server
2. Toggle "Use Railway Gateway" ON
3. Send a message
4. Check Railway logs to see the request
5. Response should come back from Gateway

No changes needed if you want to keep local mode only!
