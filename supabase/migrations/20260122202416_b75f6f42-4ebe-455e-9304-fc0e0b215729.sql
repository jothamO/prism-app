-- =====================================================
-- Duplicate Rule Detection
-- Detects similar/duplicate compliance rules
-- =====================================================

-- 1. Function to find potential duplicate rules
CREATE OR REPLACE FUNCTION public.find_duplicate_rules()
RETURNS TABLE(
    rule_id_1 UUID,
    rule_code_1 TEXT,
    rule_name_1 TEXT,
    rule_id_2 UUID,
    rule_code_2 TEXT,
    rule_name_2 TEXT,
    similarity_score NUMERIC,
    duplicate_reason TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r1.id as rule_id_1,
        r1.rule_code as rule_code_1,
        r1.rule_name as rule_name_1,
        r2.id as rule_id_2,
        r2.rule_code as rule_code_2,
        r2.rule_name as rule_name_2,
        CASE 
            WHEN r1.rule_name = r2.rule_name THEN 100.0
            WHEN LOWER(r1.rule_name) = LOWER(r2.rule_name) THEN 95.0
            WHEN similarity(r1.rule_name, r2.rule_name) > 0.7 THEN (similarity(r1.rule_name, r2.rule_name) * 100)::NUMERIC
            ELSE 0.0
        END as similarity_score,
        CASE
            WHEN r1.rule_name = r2.rule_name THEN 'Exact name match'
            WHEN LOWER(r1.rule_name) = LOWER(r2.rule_name) THEN 'Case-insensitive name match'
            WHEN r1.rule_type = r2.rule_type AND r1.description = r2.description THEN 'Same type and description'
            ELSE 'Similar names'
        END as duplicate_reason
    FROM public.compliance_rules r1
    JOIN public.compliance_rules r2 ON r1.id < r2.id
    WHERE 
        r1.is_active = true AND r2.is_active = true
        AND (
            r1.rule_name = r2.rule_name
            OR (r1.rule_type = r2.rule_type AND similarity(r1.rule_name, r2.rule_name) > 0.7)
            OR (r1.description IS NOT NULL AND r1.description = r2.description AND LENGTH(r1.description) > 20)
        )
    ORDER BY similarity_score DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_rules() TO authenticated;

-- 2. Function to check for duplicates before inserting new rule
CREATE OR REPLACE FUNCTION public.check_rule_duplicate(
    p_rule_name TEXT,
    p_rule_type TEXT,
    p_description TEXT DEFAULT NULL
)
RETURNS TABLE(
    existing_rule_id UUID,
    existing_rule_code TEXT,
    existing_rule_name TEXT,
    similarity_score NUMERIC,
    recommendation TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id as existing_rule_id,
        r.rule_code as existing_rule_code,
        r.rule_name as existing_rule_name,
        CASE 
            WHEN r.rule_name = p_rule_name THEN 100.0
            WHEN LOWER(r.rule_name) = LOWER(p_rule_name) THEN 95.0
            ELSE (similarity(r.rule_name, p_rule_name) * 100)::NUMERIC
        END as similarity_score,
        CASE
            WHEN r.rule_name = p_rule_name THEN 'BLOCK: Exact duplicate exists'
            WHEN LOWER(r.rule_name) = LOWER(p_rule_name) THEN 'BLOCK: Case-insensitive duplicate exists'
            WHEN similarity(r.rule_name, p_rule_name) > 0.8 THEN 'WARN: Very similar rule exists'
            ELSE 'WARN: Similar rule exists'
        END as recommendation
    FROM public.compliance_rules r
    WHERE 
        r.is_active = true
        AND r.rule_type = p_rule_type
        AND (
            r.rule_name = p_rule_name
            OR LOWER(r.rule_name) = LOWER(p_rule_name)
            OR similarity(r.rule_name, p_rule_name) > 0.6
        )
    ORDER BY similarity_score DESC
    LIMIT 5;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rule_duplicate(TEXT, TEXT, TEXT) TO authenticated;

-- 3. Create pg_trgm extension for similarity function (if not exists)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 4. Get duplicate count for dashboard
CREATE OR REPLACE FUNCTION public.get_duplicate_rule_count()
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT COUNT(*)::INTEGER 
    FROM (SELECT DISTINCT rule_id_1 FROM public.find_duplicate_rules()) sub;
$$;

GRANT EXECUTE ON FUNCTION public.get_duplicate_rule_count() TO authenticated;

COMMENT ON FUNCTION public.find_duplicate_rules() IS 
    'Find all potential duplicate rules based on name similarity and type';
COMMENT ON FUNCTION public.check_rule_duplicate(TEXT, TEXT, TEXT) IS 
    'Check if a new rule would be a duplicate before inserting';