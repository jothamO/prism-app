

## Create Functional Project Dialogs

### Overview

The Projects page references two dialog components that don't exist yet, causing import errors. This plan creates both dialogs with full functionality.

---

### Components to Create

#### 1. NewProjectDialog.tsx

A dialog for users to create new projects directly from the web interface.

**Form Fields:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Project Name | Text input | Yes | Free text |
| Budget | Number input | Yes | Nigerian Naira amount |
| Source Person | Text input | Yes | Who provided the funds |
| Source Relationship | Select | Yes | Client, Employer, Agency, Other |
| Tax Treatment | Select | No | Standard, Gift, Agency Fund |
| Description | Textarea | No | Optional notes |

**Flow:**
1. User clicks "New Project" button in header
2. Dialog opens with form
3. On submit: fetch user's internal ID, insert into `projects` table
4. On success: close dialog, refresh projects list, show success toast

---

#### 2. ProjectStatementDialog.tsx

A dialog that generates a summary statement for a selected project, useful for tax records or client reporting.

**Features:**
- Shows project overview (name, source, budget, spent, balance)
- Lists all expenses with dates and amounts
- Displays tax treatment applied
- Provides a printable/shareable format
- "Download as PDF" button (future enhancement, starts with print functionality)

**Flow:**
1. User selects a project
2. Clicks "Generate Statement" button in project details panel
3. Dialog opens with formatted project statement
4. User can print or copy the information

---

### File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/components/projects/NewProjectDialog.tsx` | Create | Form dialog for creating projects |
| `src/components/projects/ProjectStatementDialog.tsx` | Create | Statement view dialog |
| `src/pages/Projects.tsx` | Update | Add dialog imports, wire up buttons |

---

### Projects.tsx Updates

1. **Import the new dialogs** at the top
2. **Add state** for dialog open/close: `newProjectOpen`, statement dialog already triggered by button
3. **Replace** the current "New Project" button (that shows toast) with one that opens `NewProjectDialog`
4. **Add** "Generate Statement" button in project details section that opens `ProjectStatementDialog`

---

### Technical Details

**Database Insert Pattern** (from `Projects.tsx` existing pattern):
```typescript
// Get internal user ID first
const { data: userData } = await supabase
  .from('users')
  .select('id')
  .eq('auth_user_id', user.id)
  .single();

// Then insert project
await supabase.from('projects').insert({
  user_id: userData.id,
  name: formData.name,
  budget: formData.budget,
  source_person: formData.sourcePerson,
  source_relationship: formData.sourceRelationship,
  tax_treatment: formData.taxTreatment || 'standard',
  status: 'active',
  spent: 0,
});
```

**Component Props Pattern** (following `BankConnectModal.tsx`):
```typescript
interface NewProjectDialogProps {
  onProjectCreated: () => void;  // Callback to refresh list
}

interface ProjectStatementDialogProps {
  project: Project;
  receipts: ProjectReceipt[];
}
```

---

### User Experience

**Before:**
- "New Project" button shows toast saying "Use Telegram/WhatsApp"
- No way to generate project statements

**After:**
- "New Project" button opens form dialog for immediate project creation
- "Generate Statement" button in project details creates printable summary
- Both dialogs follow existing UI patterns with proper loading states and error handling

