-- Create missing get_expiring_rules RPC function using correct column name (effective_to)
CREATE OR REPLACE FUNCTION public.get_expiring_rules(p_days_ahead INTEGER DEFAULT 30)
RETURNS TABLE(
    id UUID,
    rule_code TEXT,
    rule_name TEXT,
    effective_to TIMESTAMPTZ,
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
        cr.effective_to,
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

-- Reset document_parts to pending since actual provisions/rules don't match counts
UPDATE public.document_parts
SET 
    provisions_count = 0,
    rules_count = 0,
    status = 'pending',
    processed_at = NULL
WHERE parent_document_id = '4ed41522-0768-42a0-8ff9-99445a763006';

-- Delete orphan rules from Nigeria Tax Act that have no matching provisions
DELETE FROM public.compliance_rules
WHERE document_id = '4ed41522-0768-42a0-8ff9-99445a763006';