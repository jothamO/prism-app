-- V24: Project Intelligence - Project Summary Skill
-- Powers AI ability to answer questions about user's projects and budgets

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
        (SELECT ta.name FROM top_active ta LIMIT 1) as top_project_name,
        (SELECT ta.spent FROM top_active ta LIMIT 1)::NUMERIC as top_project_spent,
        (SELECT ta.remaining FROM top_active ta LIMIT 1)::NUMERIC as top_project_remaining
    FROM project_stats ps;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.get_project_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_summary TO service_role;

COMMENT ON FUNCTION public.get_project_summary IS 'V24 Project Intelligence: Returns project summary with budget utilization for AI context';
