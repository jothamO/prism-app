

## Add WhatsApp Disconnect Support

### Overview
Extend the Settings page to support disconnecting WhatsApp accounts, mirroring the existing Telegram disconnect functionality. The backend edge function already supports both platforms.

---

### Database Status
The `users` table already has a `whatsapp_id` column - no database changes needed.

---

### Changes Required

#### 1. Update Settings.tsx Profile State
**File**: `src/pages/Settings.tsx`

Expand the profile state to track WhatsApp connection status.

**Current state (line 79)**:
```typescript
const [profile, setProfile] = useState<{ 
    fullName: string; 
    email: string; 
    telegramConnected: boolean 
} | null>(null);
```

**New state**:
```typescript
const [profile, setProfile] = useState<{ 
    fullName: string; 
    email: string; 
    telegramConnected: boolean;
    whatsappConnected: boolean;
} | null>(null);
```

---

#### 2. Fetch WhatsApp Status
**File**: `src/pages/Settings.tsx`

Update the `fetchSettings` query to include `whatsapp_id`.

**Current query (line 103)**:
```typescript
.select('full_name, email, telegram_id, notification_preferences')
```

**New query**:
```typescript
.select('full_name, email, telegram_id, whatsapp_id, notification_preferences')
```

**Update profile initialization (lines 108-112)**:
```typescript
setProfile({
    fullName: userData.full_name || '',
    email: userData.email || user.email || '',
    telegramConnected: !!userData.telegram_id,
    whatsappConnected: !!userData.whatsapp_id,
});
```

---

#### 3. Add Unlink WhatsApp Handler
**File**: `src/pages/Settings.tsx`

Add a new function similar to `unlinkTelegram`:

```typescript
const unlinkWhatsApp = async () => {
    setUnlinking(true);
    try {
        const { error } = await supabase.functions.invoke('unlink-account', {
            body: { platform: 'whatsapp' }
        });
        if (error) throw error;

        setProfile(prev => prev ? { ...prev, whatsappConnected: false } : null);
        toast({
            title: 'Disconnected',
            description: 'WhatsApp account unlinked successfully',
        });
    } catch (err) {
        console.error('Error unlinking WhatsApp:', err);
        toast({
            title: 'Error',
            description: 'Failed to disconnect WhatsApp',
            variant: 'destructive',
        });
    } finally {
        setUnlinking(false);
    }
};
```

---

#### 4. Add WhatsApp Row in UI
**File**: `src/pages/Settings.tsx`

Add a WhatsApp row below the Telegram row (after line 318):

```tsx
<div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
        <Label className="text-gray-500 text-sm">WhatsApp</Label>
        {profile?.whatsappConnected ? (
            <div className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-medium">Connected</span>
            </div>
        ) : (
            <span className="text-sm text-gray-500">Not connected</span>
        )}
    </div>
    {profile?.whatsappConnected && (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                    disabled={unlinking}
                >
                    {unlinking ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Unlink className="h-4 w-4 mr-1" />
                    )}
                    Disconnect
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect WhatsApp?</AlertDialogTitle>
                    <AlertDialogDescription>
                        You will no longer receive notifications via WhatsApp and won't be able to chat with PRISM through WhatsApp until you reconnect.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={unlinkWhatsApp}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        Disconnect
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )}
</div>
```

---

#### 5. Update useUserProfile Hook (Optional but Recommended)
**File**: `src/hooks/useUserProfile.ts`

Add WhatsApp fields to the UserProfile interface and mapping:

```typescript
// Add to interface (around line 27)
whatsappId?: string;
whatsappConnected: boolean;

// Add to mapping (around line 115)
whatsappId: userData.whatsapp_id,
whatsappConnected: !!userData.whatsapp_id,
```

---

### Summary of File Changes

| File | Changes |
|------|---------|
| `src/pages/Settings.tsx` | Add whatsappConnected state, fetch whatsapp_id, add unlinkWhatsApp handler, add WhatsApp UI row |
| `src/hooks/useUserProfile.ts` | Add whatsappId and whatsappConnected to interface and mapping |

---

### User Flow (WhatsApp)

```text
1. User visits /settings
2. Sees "WhatsApp: ✓ Connected [Disconnect]" (if connected)
3. Clicks "Disconnect"
4. Confirmation dialog: "Disconnect WhatsApp?"
5. User confirms
6. API call to unlink-account with platform: 'whatsapp'
7. Success toast: "WhatsApp account unlinked successfully"
8. UI updates to show "Not connected"
```

