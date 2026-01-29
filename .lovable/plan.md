

## Fix Build Error + Run V24 Project Intelligence Migration

### Part 1: Fix Build Error in action-service.ts

**Problem**: Line 203 uses `supabase.sql` which doesn't exist on the Supabase client:
```typescript
deadline_reminders: supabase.sql`...`  // ❌ Invalid
```

**Root Cause**: 
1. `supabase.sql` template literal is not a valid Supabase JS client method
2. The `deadline_reminders` column doesn't exist in `user_preferences` table

**Solution**: Rewrite the reminder handler to store preferences in `notification_preferences` JSONB column (which exists):

```typescript
async function handleSetReminder(request: ActionRequest): Promise<ActionResult> {
    const params = request.params as unknown as ReminderParams;

    if (!params.deadlineId) {
        return {
            success: false,
            message: 'No deadline specified for reminder'
        };
    }

    const supabase = getSupabaseAdmin();

    // Check if deadline exists
    const { data: deadline, error: deadlineError } = await supabase
        .from('tax_deadlines')
        .select('id, title')
        .eq('id', params.deadlineId)
        .single();

    if (deadlineError || !deadline) {
        return {
            success: false,
            message: 'Deadline not found'
        };
    }

    // Get current preferences
    const { data: currentPrefs } = await supabase
        .from('user_preferences')
        .select('notification_preferences')
        .eq('user_id', request.userId)
        .single();

    // Merge new reminder into existing preferences
    const existingPrefs = currentPrefs?.notification_preferences || {};
    const deadlineReminders = existingPrefs.deadline_reminders || {};
    deadlineReminders[params.deadlineId] = params.reminderDays || 3;

    const updatedPrefs = {
        ...existingPrefs,
        deadline_reminders: deadlineReminders
    };

    // Upsert preferences
    const { error } = await supabase
        .from('user_preferences')
        .upsert({
            user_id: request.userId,
            notification_preferences: updatedPrefs
        }, {
            onConflict: 'user_id'
        });

    if (error) {
        return {
            success: false,
            message: `Failed to set reminder: ${error.message}`
        };
    }

    return {
        success: true,
        message: `Reminder set for "${deadline.title}" - I'll notify you ${params.reminderDays || 3} days before.`
    };
}
```

---

### Part 2: Run V24 Project Intelligence Migration

**Migration Content**: Creates `get_project_summary(p_user_id)` function that returns:
- `total_projects`, `active_count`, `completed_count`
- `total_budget`, `total_spent`, `budget_remaining`
- `budget_utilization` (percentage)
- `top_project_name`, `top_project_spent`, `top_project_remaining`

**Enhancement Needed**: Add `SET search_path TO 'public'` for security:

```sql
-- V24: Project Intelligence - Project Summary Skill
CREATE OR REPLACE FUNCTION public.get_project_summary(
    p_user_id UUID
)
RETURNS TABLE (
    total_projects INT,
    active_count INT,
    completed_count INT,
    total_budget NUMERIC,
    total_spent NUMERIC,
    budget_remaining NUMERIC,
    budget_utilization NUMERIC,
    top_project_name TEXT,
    top_project_spent NUMERIC,
    top_project_remaining NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    WITH project_stats AS (
        SELECT 
            p.id,
            p.name,
            p.budget,
            p.spent,
            p.status,
            (p.budget - p.spent) as remaining
        FROM public.projects p
        WHERE p.user_id = p_user_id
    ),
    top_active AS (
        SELECT name, spent, remaining
        FROM project_stats
        WHERE status = 'active'
        ORDER BY budget DESC
        LIMIT 1
    )
    SELECT
        COUNT(*)::INT as total_projects,
        COUNT(*) FILTER (WHERE ps.status = 'active')::INT as active_count,
        COUNT(*) FILTER (WHERE ps.status = 'completed')::INT as completed_count,
        COALESCE(SUM(ps.budget), 0)::NUMERIC as total_budget,
        COALESCE(SUM(ps.spent), 0)::NUMERIC as total_spent,
        COALESCE(SUM(ps.remaining), 0)::NUMERIC as budget_remaining,
        CASE 
            WHEN SUM(ps.budget) > 0 THEN ROUND((SUM(ps.spent) / SUM(ps.budget)) * 100, 1)
            ELSE 0 
        END::NUMERIC as budget_utilization,
        (SELECT ta.name FROM top_active ta LIMIT 1)::TEXT as top_project_name,
        (SELECT ta.spent FROM top_active ta LIMIT 1)::NUMERIC as top_project_spent,
        (SELECT ta.remaining FROM top_active ta LIMIT 1)::NUMERIC as top_project_remaining
    FROM project_stats ps;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_summary TO service_role;

COMMENT ON FUNCTION public.get_project_summary IS 'V24 Project Intelligence: Returns project summary with budget utilization for AI context';
```

---

### What This Enables

Once activated, the AI can answer project questions like:
- "How are my projects doing?"
- "What's my total budget utilization?"
- "Which project has spent the most?"
- "How much budget do I have remaining?"

---

### Implementation Order

| Step | Action | Purpose |
|------|--------|---------|
| 1 | Fix `action-service.ts` | Resolve build error |
| 2 | Run V24 migration | Create project summary function |
| 3 | Verify function works | Test with sample query |

