-- Table to track broadcast messages
CREATE TABLE public.broadcast_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('telegram', 'whatsapp', 'all')),
  message_text TEXT NOT NULL,
  filters JSONB,
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.broadcast_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage broadcast messages"
ON public.broadcast_messages FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin notification preferences
CREATE TABLE public.admin_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  email_on_new_user BOOLEAN DEFAULT true,
  email_on_failed_verification BOOLEAN DEFAULT true,
  email_on_receipt_error BOOLEAN DEFAULT false,
  email_daily_summary BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage their preferences"
ON public.admin_preferences FOR ALL TO authenticated
USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

-- System settings (single row table for global config)
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_reminder_days INTEGER DEFAULT 7,
  auto_verification_enabled BOOLEAN DEFAULT true,
  default_tax_year INTEGER DEFAULT 2025,
  welcome_message_telegram TEXT DEFAULT 'Welcome to PRISM! I will help you manage your taxes.',
  welcome_message_whatsapp TEXT DEFAULT 'Welcome to PRISM! I will help you manage your taxes.',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view system settings"
ON public.system_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update system settings"
ON public.system_settings FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert system settings"
ON public.system_settings FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert default system settings row
INSERT INTO public.system_settings (id) VALUES (gen_random_uuid());

-- Add trigger to update updated_at on admin_preferences
CREATE TRIGGER update_admin_preferences_updated_at
BEFORE UPDATE ON public.admin_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();