-- Add gateway_enabled setting to system_settings
ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS gateway_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS gateway_enabled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS gateway_enabled_by UUID REFERENCES auth.users(id);

-- Update existing row to have gateway enabled by default
UPDATE public.system_settings SET gateway_enabled = true WHERE id IS NOT NULL;