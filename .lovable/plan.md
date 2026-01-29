

## Enforce Mutual Exclusivity: Telegram OR WhatsApp (Not Both)

### Overview
Implement a business rule where users can only connect **one** messaging platform at a time - either Telegram OR WhatsApp. Web chat is always available and doesn't count toward this limit.

---

### Current State
- Database has separate `telegram_id` and `whatsapp_id` columns
- Both can be populated simultaneously (no constraint)
- Dashboard shows "Connect Telegram" button
- No "Connect WhatsApp" button exists in UI (WhatsApp linking happens by messaging the bot directly)
- Settings shows disconnect buttons for both platforms

---

### Changes Required

#### 1. Backend: generate-telegram-token Edge Function
**File**: `supabase/functions/generate-telegram-token/index.ts`

Add check to prevent Telegram connection if WhatsApp is already connected.

```typescript
// After fetching userData (around line 50), add:
if (userData.whatsapp_id) {
    return jsonResponse({
        success: false,
        error: 'WhatsApp is already connected. Disconnect WhatsApp first to use Telegram.',
        conflictingPlatform: 'whatsapp'
    }, 400);
}
```

---

#### 2. Backend: whatsapp-bot-gateway Edge Function
**File**: `supabase/functions/whatsapp-bot-gateway/index.ts`

Currently, WhatsApp uses a different flow - it matches on `whatsapp_id`. The bot message says to "link your WhatsApp account in Settings". 

**Question**: How does WhatsApp actually get linked? Looking at the gateway, it only checks for existing users, doesn't create the link.

After investigation: WhatsApp linking likely happens during registration or via a separate process. Need to add mutual exclusivity check wherever `whatsapp_id` gets set.

For now, add a check in the gateway that warns users if they're trying to use WhatsApp but already have Telegram connected:

```typescript
// After checking for existing user (line 181-185), add check for conflicting platform:
if (existingUser && existingUser.telegram_id) {
    await sendWhatsAppMessage(from,
        "⚠️ You already have Telegram connected.\n\n" +
        "PRISM only supports one messaging platform at a time. To use WhatsApp instead:\n" +
        "1. Go to Settings on the web\n" +
        "2. Disconnect Telegram\n" +
        "3. Message me again to activate WhatsApp"
    );
    return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
```

---

#### 3. Frontend: TelegramConnectModal
**File**: `src/components/TelegramConnectModal.tsx`

Handle the new error response when WhatsApp is already connected.

```typescript
// In generateToken function, handle conflictingPlatform error:
if (data.conflictingPlatform === 'whatsapp') {
    toast({
        title: "WhatsApp Already Connected",
        description: "Disconnect WhatsApp in Settings before connecting Telegram.",
        variant: "destructive"
    });
    return;
}
```

---

#### 4. Frontend: Settings Page
**File**: `src/pages/Settings.tsx`

Update the UI to clearly show the mutual exclusivity rule:
- Add info text explaining users can only have one messaging platform
- Show which platform is currently active
- Optionally: Add a "Switch to Telegram/WhatsApp" action that disconnects one and guides to connect the other

```tsx
{/* Add info text in Profile section */}
{(profile?.telegramConnected || profile?.whatsappConnected) && (
    <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-lg">
        💡 You can only use one messaging platform at a time. 
        Disconnect the current one to switch.
    </div>
)}
```

---

#### 5. Frontend: Dashboard Onboarding
**File**: `src/pages/Dashboard.tsx`

Update the onboarding step to show "Connect Messaging" with choice of Telegram or WhatsApp, instead of just "Connect Telegram".

**Option A**: Keep current behavior (only shows Connect Telegram button when neither is connected)
**Option B**: Create a platform chooser modal

For simplicity, **Option A** is recommended - the current flow already only shows the button when not connected.

Add check to hide Telegram connect button if WhatsApp is already connected:

```tsx
{/* Telegram - only show if no messaging platform connected */}
{!profile?.telegramConnected && !profile?.whatsappConnected && (
    <button onClick={() => setShowTelegramModal(true)}>
        {/* ... */}
    </button>
)}
```

---

### Summary of File Changes

| File | Changes |
|------|---------|
| `supabase/functions/generate-telegram-token/index.ts` | Block if WhatsApp connected |
| `supabase/functions/whatsapp-bot-gateway/index.ts` | Warn if Telegram connected, add query for telegram_id |
| `src/components/TelegramConnectModal.tsx` | Handle conflict error gracefully |
| `src/pages/Settings.tsx` | Add info text about platform exclusivity |
| `src/pages/Dashboard.tsx` | Hide Telegram button if WhatsApp connected |

---

### User Experience

**Scenario 1: User has Telegram, tries WhatsApp**
1. User messages WhatsApp bot
2. Bot replies: "You already have Telegram connected. Disconnect Telegram first to use WhatsApp."

**Scenario 2: User has WhatsApp, tries Telegram**
1. User clicks "Connect Telegram" in dashboard
2. Modal shows error: "WhatsApp Already Connected. Disconnect WhatsApp in Settings first."

**Scenario 3: User has neither**
1. User sees "Connect Telegram" or can message WhatsApp bot
2. First one to connect wins

---

### Technical Details

**WhatsApp linking flow investigation needed**: The current `whatsapp-bot-gateway` queries for users by `whatsapp_id`, but it's unclear where `whatsapp_id` gets initially set. This may happen:
- During web registration with phone number
- Via a separate linking flow not yet implemented

If WhatsApp linking is via registration, we'd also need to update `register-user` to check for existing Telegram connection.

