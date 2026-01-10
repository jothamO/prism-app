-- Add processing_mode column to system_settings
ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS processing_mode text NOT NULL DEFAULT 'gateway'
CHECK (processing_mode IN ('gateway', 'edge_functions'));

-- Add comment for documentation
COMMENT ON COLUMN public.system_settings.processing_mode IS 'Controls bot message processing: gateway = Railway Gateway, edge_functions = Supabase Edge Functions';