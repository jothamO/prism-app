-- Fix: Set security_invoker on active_user_knowledge view
-- This ensures the view respects the querying user's RLS policies
CREATE OR REPLACE VIEW public.active_user_knowledge 
WITH (security_invoker = true) AS
SELECT 
    user_id,
    layer,
    entity_name,
    fact_content,
    confidence,
    created_at
FROM public.atomic_facts
WHERE NOT is_superseded;