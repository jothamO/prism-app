-- V20: Calendar Layer - Upcoming Deadlines Skill
-- This function powers the AI's ability to answer "What's due?"

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
AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_end_date DATE := CURRENT_DATE + p_days_ahead;
BEGIN
    RETURN QUERY
    WITH upcoming AS (
        SELECT 
            td.id,
            td.deadline_type::TEXT,
            td.title,
            td.description,
            -- Calculate next occurrence based on recurrence
            CASE 
                WHEN td.specific_date IS NOT NULL THEN td.specific_date
                WHEN td.recurrence = 'monthly' THEN 
                    CASE 
                        WHEN td.day_of_month >= EXTRACT(DAY FROM v_today)::INT 
                        THEN DATE_TRUNC('month', v_today) + (td.day_of_month - 1) * INTERVAL '1 day'
                        ELSE DATE_TRUNC('month', v_today + INTERVAL '1 month') + (td.day_of_month - 1) * INTERVAL '1 day'
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
        -- Check if user has filed (placeholder - can be expanded)
        FALSE as is_filed,
        CASE 
            WHEN (u.next_due - v_today) <= 3 THEN 'critical'
            WHEN (u.next_due - v_today) <= 7 THEN 'high'
            WHEN (u.next_due - v_today) <= 14 THEN 'medium'
            ELSE 'low'
        END as urgency
    FROM upcoming u
    WHERE u.next_due BETWEEN v_today AND v_end_date
    ORDER BY u.next_due ASC;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.get_upcoming_deadlines TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_upcoming_deadlines TO service_role;

COMMENT ON FUNCTION public.get_upcoming_deadlines IS 'V20 Calendar Skill: Returns upcoming tax deadlines with urgency levels. Powers AI responses to "What''s due?"';
