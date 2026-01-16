-- =====================================================
-- Fix RLS for code_proposal_queue - Allow service_role access
-- =====================================================
-- The service_role should bypass RLS, but Supabase edge functions
-- need explicit policies when using service role key

-- Add policy for service role to access queue
DROP POLICY IF EXISTS "Service role can manage queue" ON public.code_proposal_queue;
CREATE POLICY "Service role can manage queue"
    ON public.code_proposal_queue
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Also ensure authenticated admins can still access
DROP POLICY IF EXISTS "Admins can manage code proposal queue" ON public.code_proposal_queue;
CREATE POLICY "Admins can manage code proposal queue"
    ON public.code_proposal_queue
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add policy for code_change_proposals table too
DROP POLICY IF EXISTS "Service role can manage proposals" ON public.code_change_proposals;
CREATE POLICY "Service role can manage proposals"
    ON public.code_change_proposals
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Ensure compliance_rules is accessible by service role
DROP POLICY IF EXISTS "Service role can read compliance_rules" ON public.compliance_rules;
CREATE POLICY "Service role can read compliance_rules"
    ON public.compliance_rules
    FOR SELECT
    TO service_role
    USING (true);
