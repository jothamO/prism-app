-- Create storage bucket for bank statements (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'bank-statements', 
    'bank-statements', 
    false, 
    20971520,
    ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for bank-statements bucket (with unique names)
CREATE POLICY "Bank statements - users view own"
ON storage.objects FOR SELECT
USING (bucket_id = 'bank-statements' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Bank statements - users upload own"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'bank-statements' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Bank statements - users delete own"
ON storage.objects FOR DELETE
USING (bucket_id = 'bank-statements' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Bank statements - service role full access"
ON storage.objects FOR ALL
USING (bucket_id = 'bank-statements')
WITH CHECK (bucket_id = 'bank-statements');