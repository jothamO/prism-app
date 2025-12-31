-- Create storage bucket for project statements
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-statements', 'project-statements', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policy: Users can read their own project statements
CREATE POLICY "Users can read their own statements"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'project-statements' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.projects WHERE user_id = auth.uid()
  )
);

-- RLS policy: Users can upload statements to their own projects
CREATE POLICY "Users can upload their own statements"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'project-statements' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.projects WHERE user_id = auth.uid()
  )
);

-- RLS policy: Service role can manage all statements (for edge functions)
CREATE POLICY "Service role can manage all statements"
ON storage.objects FOR ALL
USING (bucket_id = 'project-statements' AND auth.role() = 'service_role');