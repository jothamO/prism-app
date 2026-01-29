

## Run V20 Calendar Skill Migration & Activate Function

### Problem Analysis

The `get_upcoming_deadlines` function is currently **broken** due to a type mismatch:
- Table column `title` is `VARCHAR(255)`
- Function return type declares `TEXT`
- PostgreSQL strict type checking causes: `structure of query does not match function result type`

The migration file **V20** provides an updated version that:
- Uses different parameters: `p_user_id UUID`, `p_days_ahead INT` (matching context-builder.ts)
- Returns enhanced columns: `deadline_id`, `deadline_type`, `title`, `description`, `due_date`, `days_until`, `is_filed`, `urgency`
- Adds urgency classification (critical/high/medium/low)
- Properly casts columns to match return types

---

### Implementation Steps

#### Step 1: Fix and Run the Migration

The migration needs one small fix - explicit type casting to avoid the VARCHAR/TEXT mismatch:

```sql
-- V20: Calendar Layer - Upcoming Deadlines Skill
CREATE OR REPLACE FUNCTION public.get_upcoming_deadlines(
    p_user_id UUID DEFAULT NULL,
    p_days_ahead INT DEFAULT 30
)
RETURNS TABLE (
    deadline_id UUID,
    deadline_type TEXT,
    title TEXT,
    description TEXT,
    due_date DATE,
    days_until INT,
    is_filed BOOLEAN,
    urgency TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_end_date DATE := CURRENT_DATE + p_days_ahead;
BEGIN
    RETURN QUERY
    WITH upcoming AS (
        SELECT 
            td.id,
            td.deadline_type::TEXT,    -- Cast to TEXT
            td.title::TEXT,            -- Cast to TEXT  
            td.description::TEXT,      -- Already TEXT but explicit
            CASE 
                WHEN td.specific_date IS NOT NULL THEN td.specific_date
                WHEN td.recurrence = 'monthly' THEN 
                    CASE 
                        WHEN td.day_of_month >= EXTRACT(DAY FROM v_today)::INT 
                        THEN DATE_TRUNC('month', v_today)::DATE + (td.day_of_month - 1)
                        ELSE (DATE_TRUNC('month', v_today) + INTERVAL '1 month')::DATE + (td.day_of_month - 1)
                    END
                WHEN td.recurrence = 'annual' THEN
                    MAKE_DATE(
                        CASE 
                            WHEN MAKE_DATE(EXTRACT(YEAR FROM v_today)::INT, td.month_of_year, td.day_of_month) >= v_today 
                            THEN EXTRACT(YEAR FROM v_today)::INT
                            ELSE EXTRACT(YEAR FROM v_today)::INT + 1
                        END,
                        td.month_of_year,
                        td.day_of_month
                    )
                ELSE v_today
            END::DATE as next_due
        FROM public.tax_deadlines td
        WHERE td.is_active = true
    )
    SELECT 
        u.id as deadline_id,
        u.deadline_type,
        u.title,
        u.description,
        u.next_due as due_date,
        (u.next_due - v_today)::INT as days_until,
        FALSE as is_filed,
        CASE 
            WHEN (u.next_due - v_today) <= 3 THEN 'critical'
            WHEN (u.next_due - v_today) <= 7 THEN 'high'
            WHEN (u.next_due - v_today) <= 14 THEN 'medium'
            ELSE 'low'
        END::TEXT as urgency
    FROM upcoming u
    WHERE u.next_due BETWEEN v_today AND v_end_date
    ORDER BY u.next_due ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_upcoming_deadlines TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_upcoming_deadlines TO service_role;

COMMENT ON FUNCTION public.get_upcoming_deadlines IS 
  'V20 Calendar Skill: Returns upcoming tax deadlines with urgency levels. Powers AI responses to "What''s due?"';
```

---

#### Step 2: Update context-builder.ts (if needed)

Check if the context-builder.ts properly handles the new return columns. Looking at the code:

```typescript
// Current code (line 130-137)
return {
    upcomingDeadlines: (data || []).map((d: any) => ({
        title: d.title,
        dueDate: d.due_date,    // ✅ Matches new column
        daysUntil: d.days_until, // ✅ Matches new column
        urgency: d.urgency       // ✅ Matches new column
    }))
};
```

**No changes needed** - the context-builder already expects `due_date`, `days_until`, and `urgency` columns which the V20 migration provides.

---

#### Step 3: Verify the Function Works

After running the migration, verify with:
```sql
SELECT * FROM public.get_upcoming_deadlines(NULL, 30) LIMIT 5;
```

Expected result: List of upcoming deadlines with urgency levels.

---

### What the Calendar Skill Enables

Once activated, the AI can respond to questions like:
- "What's due this month?"
- "Any upcoming deadlines?"
- "When is my VAT return due?"

The context-builder automatically injects deadlines into the AI prompt with urgency emojis:
- 🚨 Critical (≤3 days)
- ⚠️ High (≤7 days)
- 📅 Medium/Low (>7 days)

---

### Technical Details

| Item | Value |
|------|-------|
| Function Name | `get_upcoming_deadlines` |
| Parameters | `p_user_id UUID`, `p_days_ahead INT` |
| Returns | `deadline_id`, `deadline_type`, `title`, `description`, `due_date`, `days_until`, `is_filed`, `urgency` |
| Used By | `context-builder.ts` → `generateSystemPrompt()` |
| Security | `SECURITY DEFINER` with explicit search_path |

