-- Fix conversation_state table RLS policy - remove overly permissive "true" policy
-- The telegram-bot edge function uses SERVICE_ROLE_KEY which bypasses RLS
-- So we can safely restrict direct access to admins only

DROP POLICY IF EXISTS "Service role can manage conversation states" ON public.conversation_state;

-- Only admins can directly access conversation_state through the API
-- Edge functions using SERVICE_ROLE_KEY will bypass RLS automatically
CREATE POLICY "Only admins can access conversation_state"
  ON public.conversation_state FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));