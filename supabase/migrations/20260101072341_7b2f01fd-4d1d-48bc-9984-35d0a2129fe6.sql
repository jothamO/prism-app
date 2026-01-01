-- Add bot status columns to system_settings
ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS telegram_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT true;

-- Add blocked status to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

-- Create bot_commands table for managing menu commands
CREATE TABLE IF NOT EXISTS public.bot_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(20) NOT NULL DEFAULT 'telegram',
  command VARCHAR(50) NOT NULL,
  description VARCHAR(100) NOT NULL,
  response_text TEXT,
  is_standard BOOLEAN DEFAULT false,
  is_enabled BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform, command)
);

-- Enable RLS on bot_commands
ALTER TABLE public.bot_commands ENABLE ROW LEVEL SECURITY;

-- Only admins can manage bot commands
CREATE POLICY "Admins can manage bot commands"
ON public.bot_commands
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed standard Telegram commands
INSERT INTO public.bot_commands (platform, command, description, is_standard, is_enabled, sort_order) VALUES
('telegram', '/start', 'Start or check status', true, true, 1),
('telegram', '/help', 'Show help message', true, true, 2),
('telegram', '/status', 'Check verification status', true, false, 3),
('telegram', '/receipts', 'View recent receipts', true, false, 4),
('telegram', '/export', 'Export tax summary', true, false, 5)
ON CONFLICT (platform, command) DO NOTHING;

-- Add trigger for updated_at
CREATE OR REPLACE TRIGGER update_bot_commands_updated_at
BEFORE UPDATE ON public.bot_commands
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();