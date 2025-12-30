-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================================
-- PHASE 1: CREATE CORE TABLES
-- ===========================================

-- Users table (core user profile with WhatsApp info)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number VARCHAR(15) UNIQUE NOT NULL,
  email VARCHAR(255),
  business_name VARCHAR(255) NOT NULL,
  tin VARCHAR(20) UNIQUE NOT NULL,
  business_type VARCHAR(50),
  
  subscription_tier VARCHAR(20) DEFAULT 'basic',
  subscription_status VARCHAR(20) DEFAULT 'trial',
  subscription_expires_at TIMESTAMPTZ,
  
  has_active_vat BOOLEAN DEFAULT true,
  onboarding_completed BOOLEAN DEFAULT false,
  onboarding_step INT DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Accounts (Bank connections via Mono)
CREATE TABLE IF NOT EXISTS public.user_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  
  mono_account_id VARCHAR(255) UNIQUE NOT NULL,
  bank_name VARCHAR(100),
  account_number VARCHAR(20),
  account_type VARCHAR(50),
  
  purpose VARCHAR(50),
  track_sales BOOLEAN DEFAULT true,
  track_expenses BOOLEAN DEFAULT false,
  
  last_synced_at TIMESTAMPTZ,
  sync_status VARCHAR(20),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices/Transactions
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.user_accounts(id),
  
  invoice_number VARCHAR(100),
  date DATE NOT NULL,
  customer_name VARCHAR(255),
  customer_tin VARCHAR(20),
  
  items JSONB NOT NULL,
  
  subtotal DECIMAL(15,2) NOT NULL,
  vat_amount DECIMAL(15,2) NOT NULL,
  total DECIMAL(15,2) NOT NULL,
  
  period VARCHAR(7) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending_remittance',
  
  source VARCHAR(20),
  bank_reference VARCHAR(100),
  image_url TEXT,
  
  needs_review BOOLEAN DEFAULT false,
  review_reasons TEXT[],
  user_confirmed BOOLEAN DEFAULT false,
  confidence_score DECIMAL(3,2),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_user_period ON public.invoices(user_id, period);
CREATE INDEX IF NOT EXISTS idx_invoices_needs_review ON public.invoices(needs_review) WHERE needs_review = true;

-- Expenses (for input VAT)
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  
  description VARCHAR(255) NOT NULL,
  supplier_name VARCHAR(255),
  
  amount DECIMAL(15,2) NOT NULL,
  vat_amount DECIMAL(15,2) DEFAULT 0,
  vat_rate DECIMAL(4,3) DEFAULT 0.075,
  
  date DATE NOT NULL,
  period VARCHAR(7) NOT NULL,
  
  receipt_url TEXT,
  category VARCHAR(50),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- VAT Filings
CREATE TABLE IF NOT EXISTS public.filings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  
  tax_type VARCHAR(10) DEFAULT 'VAT',
  period VARCHAR(7) NOT NULL,
  
  output_vat DECIMAL(15,2),
  input_vat DECIMAL(15,2),
  net_amount DECIMAL(15,2) NOT NULL,
  
  status VARCHAR(20) DEFAULT 'draft',
  submission_method VARCHAR(20),
  submitted_at TIMESTAMPTZ,
  
  pdf_url TEXT,
  remita_rrr VARCHAR(20),
  payment_status VARCHAR(20) DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  
  invoice_count INT,
  expense_count INT,
  auto_filed BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages (WhatsApp history)
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  
  direction VARCHAR(10) NOT NULL,
  message_type VARCHAR(20),
  content TEXT,
  media_url TEXT,
  
  whatsapp_message_id VARCHAR(100),
  whatsapp_status VARCHAR(20),
  
  context JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Review Queue (human intervention)
CREATE TABLE IF NOT EXISTS public.review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id),
  
  reasons TEXT[] NOT NULL,
  priority VARCHAR(10) DEFAULT 'medium',
  status VARCHAR(20) DEFAULT 'pending',
  
  assigned_to UUID,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Reminders
CREATE TABLE IF NOT EXISTS public.reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  
  reminder_type VARCHAR(20) NOT NULL,
  tax_type VARCHAR(10),
  due_date DATE NOT NULL,
  message TEXT NOT NULL,
  
  send_at TIMESTAMPTZ NOT NULL,
  sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Non-revenue transactions (loans, capital, etc)
CREATE TABLE IF NOT EXISTS public.non_revenue_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  
  transaction_type VARCHAR(50),
  amount DECIMAL(15,2) NOT NULL,
  source VARCHAR(255),
  date DATE NOT NULL,
  
  bank_reference VARCHAR(100),
  excluded_from_vat BOOLEAN DEFAULT true,
  
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  admin_id UUID,
  
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  
  old_values JSONB,
  new_values JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- PHASE 2: ALIGN BUSINESSES TABLE
-- ===========================================

-- Add missing columns to existing businesses table
ALTER TABLE public.businesses 
  ADD COLUMN IF NOT EXISTS vat_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS next_filing_date DATE;

-- Migrate data from old columns to new columns
UPDATE public.businesses SET vat_enabled = vat_registered WHERE vat_enabled IS NULL;
UPDATE public.businesses SET is_primary = is_default WHERE is_primary IS NULL;

-- ===========================================
-- PHASE 3: MULTI-BUSINESS LINKAGE
-- ===========================================

-- Add business_id to transaction tables
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
ALTER TABLE public.filings ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);
ALTER TABLE public.user_accounts ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id);

-- Create indexes for business_id columns
CREATE INDEX IF NOT EXISTS idx_invoices_business_id ON public.invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_expenses_business_id ON public.expenses(business_id);
CREATE INDEX IF NOT EXISTS idx_filings_business_id ON public.filings(business_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_business_id ON public.user_accounts(business_id);

-- ===========================================
-- PHASE 4: ENABLE RLS ON ALL TABLES
-- ===========================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.non_revenue_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- PHASE 5: RLS POLICIES
-- ===========================================

-- Users table policies
CREATE POLICY "Users can view their own user record" ON public.users
  FOR SELECT USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update their own user record" ON public.users
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Admins can manage all users" ON public.users
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- User Accounts policies
CREATE POLICY "Users can view their own accounts" ON public.user_accounts
  FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own accounts" ON public.user_accounts
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own accounts" ON public.user_accounts
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own accounts" ON public.user_accounts
  FOR DELETE USING (user_id = auth.uid());

-- Invoices policies
CREATE POLICY "Users can view their own invoices" ON public.invoices
  FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own invoices" ON public.invoices
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own invoices" ON public.invoices
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own invoices" ON public.invoices
  FOR DELETE USING (user_id = auth.uid());

-- Expenses policies
CREATE POLICY "Users can view their own expenses" ON public.expenses
  FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own expenses" ON public.expenses
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own expenses" ON public.expenses
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own expenses" ON public.expenses
  FOR DELETE USING (user_id = auth.uid());

-- Filings policies
CREATE POLICY "Users can view their own filings" ON public.filings
  FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own filings" ON public.filings
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own filings" ON public.filings
  FOR UPDATE USING (user_id = auth.uid());

-- Messages policies
CREATE POLICY "Users can view their own messages" ON public.messages
  FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own messages" ON public.messages
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Review Queue policies
CREATE POLICY "Users can view their own review items" ON public.review_queue
  FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage review queue" ON public.review_queue
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Reminders policies
CREATE POLICY "Users can view their own reminders" ON public.reminders
  FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own reminders" ON public.reminders
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own reminders" ON public.reminders
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own reminders" ON public.reminders
  FOR DELETE USING (user_id = auth.uid());

-- Non-revenue transactions policies
CREATE POLICY "Users can view their own non-revenue transactions" ON public.non_revenue_transactions
  FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own non-revenue transactions" ON public.non_revenue_transactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own non-revenue transactions" ON public.non_revenue_transactions
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own non-revenue transactions" ON public.non_revenue_transactions
  FOR DELETE USING (user_id = auth.uid());

-- Audit Log policies (read-only for users, full access for admins)
CREATE POLICY "Users can view their own audit logs" ON public.audit_log
  FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can create audit logs" ON public.audit_log
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===========================================
-- PHASE 6: UPDATED_AT TRIGGERS
-- ===========================================

-- Apply updated_at trigger to users table
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Apply updated_at trigger to invoices table  
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================
-- PHASE 7: ENABLE REALTIME FOR KEY TABLES
-- ===========================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.filings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;