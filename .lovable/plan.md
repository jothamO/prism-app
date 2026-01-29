

## Add "Disconnect Telegram" Button to Settings

### Overview
Add an unlink button to the Settings page so users can disconnect their Telegram account, calling the existing `unlink-account` edge function.

---

### Changes Required

#### 1. Fix Edge Function Build Error
**File**: `supabase/functions/unlink-account/index.ts`

The catch block has a TypeScript error - `error` is of type `unknown`.

```typescript
// Line 110-113: Change from
} catch (error) {
    console.error('Unlink exception:', error);
    return jsonResponse({ error: error.message }, 500);
}

// To:
} catch (error) {
    console.error('Unlink exception:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
}
```

---

#### 2. Update Settings Profile Section
**File**: `src/pages/Settings.tsx`

Add a "Disconnect" button next to the Telegram status display.

**Current UI (lines 232-243)**:
```
Telegram: ✓ Connected
```

**New UI**:
```
Telegram: ✓ Connected  [Disconnect]
```

**Implementation**:
1. Add `Unlink` icon import from lucide-react
2. Add `unlinking` state for loading indicator
3. Create `unlinkTelegram` async function that:
   - Calls `supabase.functions.invoke('unlink-account', { body: { platform: 'telegram' } })`
   - Shows success/error toast
   - Updates profile state to `telegramConnected: false`
4. Add disconnect button conditionally when `telegramConnected` is true

**UI Design**:
- Small "Disconnect" button with red/destructive styling
- Confirmation dialog to prevent accidental disconnection
- Loading spinner during the unlink process

---

### Code Changes

| File | Change |
|------|--------|
| `supabase/functions/unlink-account/index.ts` | Fix TypeScript error on line 112 |
| `src/pages/Settings.tsx` | Add disconnect button + handler |

---

### User Flow

```text
1. User visits /settings
2. Sees "Telegram: ✓ Connected [Disconnect]"
3. Clicks "Disconnect"
4. Confirmation dialog: "Are you sure you want to disconnect Telegram?"
5. User confirms
6. API call to unlink-account
7. Success toast: "Telegram disconnected successfully"
8. UI updates to show "Not connected"
```

---

### Technical Details

**New imports needed**:
```typescript
import { Unlink } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
```

**New state**:
```typescript
const [unlinking, setUnlinking] = useState(false);
```

**Handler function**:
```typescript
const unlinkTelegram = async () => {
    setUnlinking(true);
    try {
        const { error } = await supabase.functions.invoke('unlink-account', {
            body: { platform: 'telegram' }
        });
        if (error) throw error;
        
        setProfile(prev => prev ? { ...prev, telegramConnected: false } : null);
        toast({ title: 'Disconnected', description: 'Telegram account unlinked successfully' });
    } catch (err) {
        toast({ title: 'Error', description: 'Failed to disconnect Telegram', variant: 'destructive' });
    } finally {
        setUnlinking(false);
    }
};
```

