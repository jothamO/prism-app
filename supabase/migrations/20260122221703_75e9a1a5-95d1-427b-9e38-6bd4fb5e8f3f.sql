-- Drop and recreate get_expiring_rules with correct return type
DROP FUNCTION IF EXISTS public.get_expiring_rules(INTEGER);

CREATE OR REPLACE FUNCTION public.get_expiring_rules(p_days_ahead INTEGER DEFAULT 30)
RETURNS TABLE(
    id UUID,
    rule_code TEXT,
    rule_name TEXT,
    expiration_date TIMESTAMPTZ,
    days_until_expiration INTEGER,
    document_title TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT 
        cr.id,
        cr.rule_code,
        cr.rule_name,
        cr.effective_to as expiration_date,
        (cr.effective_to::date - CURRENT_DATE)::INTEGER as days_until_expiration,
        ld.title as document_title
    FROM public.compliance_rules cr
    LEFT JOIN public.legal_documents ld ON cr.document_id = ld.id
    WHERE cr.effective_to IS NOT NULL
      AND cr.effective_to::date > CURRENT_DATE
      AND cr.effective_to::date <= CURRENT_DATE + (p_days_ahead || ' days')::INTERVAL
      AND cr.is_active = true
    ORDER BY cr.effective_to ASC;
$$;