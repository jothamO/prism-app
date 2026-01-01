-- Fix 1: Add business ownership validation to upsert_business_pattern function
CREATE OR REPLACE FUNCTION public.upsert_business_pattern(p_business_id uuid, p_pattern text, p_category character varying, p_amount numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_pattern_id UUID;
BEGIN
    -- Validate business ownership (unless called by admin)
    IF NOT EXISTS (
        SELECT 1 FROM public.businesses 
        WHERE id = p_business_id 
        AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    ) THEN
        RAISE EXCEPTION 'Access denied: business not owned by user';
    END IF;

    INSERT INTO public.business_classification_patterns (
        business_id, item_pattern, category, occurrence_count, correct_predictions, total_amount, last_used_at
    )
    VALUES (
        p_business_id, LOWER(TRIM(p_pattern)), p_category, 1, 1, COALESCE(p_amount, 0), NOW()
    )
    ON CONFLICT (business_id, item_pattern, category)
    DO UPDATE SET
        occurrence_count = business_classification_patterns.occurrence_count + 1,
        correct_predictions = business_classification_patterns.correct_predictions + 1,
        total_amount = business_classification_patterns.total_amount + COALESCE(p_amount, 0),
        last_used_at = NOW()
    RETURNING id INTO v_pattern_id;
    
    RETURN v_pattern_id;
END;
$function$;

-- Fix 2: Add explicit INSERT policy to users table for defense-in-depth
-- Only admins can directly insert users (trigger-based creation bypasses RLS via SECURITY DEFINER)
CREATE POLICY "Admins can insert users"
  ON public.users FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));