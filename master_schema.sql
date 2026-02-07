-- Create app role enum for admin roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE(user_id, role)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- User roles policies
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  
  -- Assign default 'user' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

-- Trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updating timestamps
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
-- Enable Multi-Business Support
-- Create businesses table for users to manage multiple businesses
CREATE TABLE IF NOT EXISTS public.businesses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  tin TEXT,
  vat_registered BOOLEAN DEFAULT false,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on businesses table
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for businesses
CREATE POLICY "Users can view their own businesses" 
ON public.businesses 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own businesses" 
ON public.businesses 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own businesses" 
ON public.businesses 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own businesses" 
ON public.businesses 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates on businesses
CREATE TRIGGER update_businesses_updated_at
BEFORE UPDATE ON public.businesses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster user lookups
CREATE INDEX idx_businesses_user_id ON public.businesses(user_id);
CREATE INDEX idx_businesses_is_default ON public.businesses(user_id, is_default) WHERE is_default = true;
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
-- =============================================
-- Migration 1: Analytics Tables
-- =============================================

-- Create user_events table for event tracking
CREATE TABLE IF NOT EXISTS public.user_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create analytics_summary table for pre-aggregated metrics
CREATE TABLE IF NOT EXISTS public.analytics_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name VARCHAR(50) NOT NULL,
  metric_value DECIMAL(15,2) NOT NULL,
  period VARCHAR(10) NOT NULL,
  period_date DATE NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for user_events
CREATE INDEX IF NOT EXISTS idx_events_user_type ON public.user_events(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON public.user_events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_type ON public.user_events(event_type);

-- Create indexes for analytics_summary
CREATE INDEX IF NOT EXISTS idx_analytics_metric ON public.analytics_summary(metric_name, period_date);
CREATE INDEX IF NOT EXISTS idx_analytics_period ON public.analytics_summary(period, period_date);

-- Enable RLS on user_events
ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

-- Enable RLS on analytics_summary
ALTER TABLE public.analytics_summary ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_events
CREATE POLICY "Users can view their own events"
ON public.user_events
FOR SELECT
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own events"
ON public.user_events
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all events"
ON public.user_events
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for analytics_summary (admin only)
CREATE POLICY "Admins can view analytics"
ON public.analytics_summary
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage analytics"
ON public.analytics_summary
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- =============================================
-- Migration 2: Review Queue Priority Score
-- =============================================

-- Add priority_score column to review_queue
ALTER TABLE public.review_queue 
ADD COLUMN IF NOT EXISTS priority_score DECIMAL(3,2) DEFAULT 0.5;

-- Create indexes for review_queue priority
CREATE INDEX IF NOT EXISTS idx_review_queue_priority ON public.review_queue(priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON public.review_queue(status, priority);
-- Add business_id to key tables
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id);
ALTER TABLE filings ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id);
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_invoices_business ON invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_expenses_business ON expenses(business_id);
CREATE INDEX IF NOT EXISTS idx_filings_business ON filings(business_id);

-- Backfill: For existing records, link to primary business or create one from user profile
DO $$
DECLARE
    r RECORD;
    b_id UUID;
BEGIN
    FOR r IN SELECT * FROM users LOOP
        -- Check if business exists
        SELECT id INTO b_id FROM businesses WHERE user_id = r.id LIMIT 1;
        
        -- If not, create one from user profile
        IF b_id IS NULL THEN
            INSERT INTO businesses (user_id, name, tin, is_primary)
            VALUES (r.id, r.business_name, r.tin, true)
            RETURNING id INTO b_id;
        END IF;

        -- Update records
        UPDATE invoices SET business_id = b_id WHERE user_id = r.id AND business_id IS NULL;
        UPDATE expenses SET business_id = b_id WHERE user_id = r.id AND business_id IS NULL;
        UPDATE filings SET business_id = b_id WHERE user_id = r.id AND business_id IS NULL;
        UPDATE user_accounts SET business_id = b_id WHERE user_id = r.id AND business_id IS NULL;
    END LOOP;
END $$;
-- Fix Function Search Path Mutable security warning
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
-- Tax Act 2025 Compliance Migrations
-- 1. Invoice Compliance (business registration number)
-- 2. VAT Reconciliation table and supporting columns

-- ============================================
-- PART 1: Invoice Compliance
-- ============================================

-- Add business_registration_number to invoices
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS business_registration_number VARCHAR(50);

-- Add registration columns to businesses
ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS registration_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS registration_type VARCHAR(20);

-- Add check constraint for registration_type
ALTER TABLE public.businesses
ADD CONSTRAINT chk_registration_type 
CHECK (registration_type IS NULL OR registration_type IN ('RC', 'BN', 'IT', 'PENDING'));

-- Create index for business registration lookups
CREATE INDEX IF NOT EXISTS idx_businesses_registration 
ON public.businesses(registration_number) 
WHERE registration_number IS NOT NULL AND registration_number != 'PENDING';

-- ============================================
-- PART 2: VAT Reconciliation
-- ============================================

-- Add can_claim_input_vat to expenses
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS can_claim_input_vat BOOLEAN DEFAULT TRUE;

-- Create vat_reconciliations table
CREATE TABLE IF NOT EXISTS public.vat_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    period VARCHAR(7) NOT NULL, -- YYYY-MM format
    output_vat DECIMAL(15,2) NOT NULL DEFAULT 0,
    output_vat_invoices_count INTEGER DEFAULT 0,
    input_vat DECIMAL(15,2) NOT NULL DEFAULT 0,
    input_vat_expenses_count INTEGER DEFAULT 0,
    net_vat DECIMAL(15,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'remit' CHECK (status IN ('remit', 'credit', 'refund_requested', 'filed')),
    credit_brought_forward DECIMAL(15,2) DEFAULT 0,
    credit_carried_forward DECIMAL(15,2) DEFAULT 0,
    filed_at TIMESTAMPTZ,
    filed_by VARCHAR(50),
    remittance_proof VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, business_id, period)
);

-- Enable RLS on vat_reconciliations
ALTER TABLE public.vat_reconciliations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vat_reconciliations
CREATE POLICY "Users can view their own reconciliations"
ON public.vat_reconciliations
FOR SELECT
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create their own reconciliations"
ON public.vat_reconciliations
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own reconciliations"
ON public.vat_reconciliations
FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all reconciliations"
ON public.vat_reconciliations
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for vat_reconciliations
CREATE INDEX IF NOT EXISTS idx_vat_recon_user_period 
ON public.vat_reconciliations(user_id, period DESC);

CREATE INDEX IF NOT EXISTS idx_vat_recon_business_period 
ON public.vat_reconciliations(business_id, period DESC) 
WHERE business_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vat_recon_status 
ON public.vat_reconciliations(status) 
WHERE status != 'filed';

-- Add trigger for updated_at
CREATE TRIGGER update_vat_reconciliations_updated_at
BEFORE UPDATE ON public.vat_reconciliations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comments
COMMENT ON TABLE public.vat_reconciliations IS 'Monthly VAT reconciliation records per Tax Act 2025 Section 156';
COMMENT ON COLUMN public.vat_reconciliations.output_vat IS 'VAT collected on sales';
COMMENT ON COLUMN public.vat_reconciliations.input_vat IS 'VAT paid on purchases (claimable)';
COMMENT ON COLUMN public.vat_reconciliations.net_vat IS 'Output VAT minus Input VAT minus credits';
COMMENT ON COLUMN public.vat_reconciliations.credit_brought_forward IS 'Credit from previous period';
COMMENT ON COLUMN public.vat_reconciliations.credit_carried_forward IS 'Credit to carry to next period';
COMMENT ON COLUMN public.expenses.can_claim_input_vat IS 'Whether this expense qualifies for input VAT credit';
COMMENT ON COLUMN public.businesses.registration_type IS 'RC=Company, BN=Business Name, IT=Incorporated Trustee';
-- Phase 4: Tax Act 2025 - Business Classification
-- Act Reference: Section 56 - Small companies (≤₦50M turnover) taxed at 0%

-- Add classification fields to businesses table
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS annual_turnover DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_fixed_assets DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_professional_services BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS classification VARCHAR(20) DEFAULT 'unclassified',
ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,4) DEFAULT 0.30,
ADD COLUMN IF NOT EXISTS last_classified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS classification_year INT;

-- Create index for classification queries
CREATE INDEX IF NOT EXISTS idx_businesses_classification 
ON businesses(classification, tax_rate);

CREATE INDEX IF NOT EXISTS idx_businesses_turnover 
ON businesses(annual_turnover DESC) 
WHERE annual_turnover > 0;

-- Add comments for documentation
COMMENT ON COLUMN businesses.annual_turnover IS 'Annual gross turnover for classification per Section 56';
COMMENT ON COLUMN businesses.total_fixed_assets IS 'Total fixed assets value for small company threshold (₦250M)';
COMMENT ON COLUMN businesses.is_professional_services IS 'Professional services firms excluded from small company status';
COMMENT ON COLUMN businesses.classification IS 'Tax classification: small (0% tax), medium/large (30% tax)';
COMMENT ON COLUMN businesses.tax_rate IS 'Applicable tax rate based on classification';
COMMENT ON COLUMN businesses.classification_year IS 'Year when classification was last calculated';
-- Apply NOT NULL constraint to registration_number column
ALTER TABLE businesses
ALTER COLUMN registration_number SET NOT NULL;
-- Create related_parties table for storing user-declared connected persons
CREATE TABLE public.related_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  party_name VARCHAR NOT NULL,
  party_tin VARCHAR,
  relationship_type VARCHAR NOT NULL, -- 'family', 'partner', 'controlled_entity', 'trust', 'director', 'shareholder'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.related_parties ENABLE ROW LEVEL SECURITY;

-- Users can view their own related parties
CREATE POLICY "Users can view their own related parties"
ON public.related_parties
FOR SELECT
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Users can create their own related parties
CREATE POLICY "Users can create their own related parties"
ON public.related_parties
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Users can update their own related parties
CREATE POLICY "Users can update their own related parties"
ON public.related_parties
FOR UPDATE
USING (user_id = auth.uid());

-- Users can delete their own related parties
CREATE POLICY "Users can delete their own related parties"
ON public.related_parties
FOR DELETE
USING (user_id = auth.uid());

-- Admins can manage all related parties
CREATE POLICY "Admins can manage all related parties"
ON public.related_parties
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_related_parties_updated_at
BEFORE UPDATE ON public.related_parties
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Enable pg_trgm extension for fuzzy pattern matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Table 1: ai_feedback - Stores user corrections on AI predictions
CREATE TABLE public.ai_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    ai_prediction JSONB NOT NULL,
    user_correction JSONB NOT NULL,
    item_description TEXT NOT NULL,
    amount NUMERIC(15,2),
    metadata JSONB DEFAULT '{}',
    ai_model_version VARCHAR(50),
    correction_type VARCHAR(50) NOT NULL,
    used_in_training BOOLEAN DEFAULT FALSE,
    training_batch_id VARCHAR(100),
    trained_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 2: invoice_validations - Tracks OCR/AI validation changes
CREATE TABLE public.invoice_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    original_data JSONB NOT NULL,
    validated_data JSONB NOT NULL,
    fields_changed TEXT[] DEFAULT '{}',
    ocr_confidence_score NUMERIC(5,4),
    validation_time_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 3: business_classification_patterns - Learned patterns per business
CREATE TABLE public.business_classification_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    item_pattern TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    occurrences INTEGER DEFAULT 1,
    occurrence_count INTEGER DEFAULT 1,
    correct_predictions INTEGER DEFAULT 1,
    total_amount NUMERIC(15,2) DEFAULT 0,
    average_amount NUMERIC(15,2),
    amount_variance NUMERIC(15,2),
    confidence NUMERIC(5,4) DEFAULT 0.5,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(business_id, item_pattern, category)
);

-- Table 4: ml_models - ML model version tracking
CREATE TABLE public.ml_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name VARCHAR(100) NOT NULL,
    version VARCHAR(50) NOT NULL,
    training_data_count INTEGER DEFAULT 0,
    accuracy NUMERIC(5,4),
    precision_score NUMERIC(5,4),
    recall_score NUMERIC(5,4),
    f1_score NUMERIC(5,4),
    is_active BOOLEAN DEFAULT FALSE,
    trained_at TIMESTAMP WITH TIME ZONE,
    deployed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(model_name, version)
);

-- Function: update_business_pattern_confidence - Trigger to auto-recalculate confidence
CREATE OR REPLACE FUNCTION public.update_business_pattern_confidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.confidence := CASE 
        WHEN NEW.occurrence_count > 0 THEN 
            LEAST(1.0, (NEW.correct_predictions::NUMERIC / NEW.occurrence_count) * 
                  (1 - EXP(-NEW.occurrence_count::NUMERIC / 10)))
        ELSE 0.5 
    END;
    RETURN NEW;
END;
$$;

-- Trigger to update confidence on insert/update
CREATE TRIGGER update_pattern_confidence
    BEFORE INSERT OR UPDATE ON public.business_classification_patterns
    FOR EACH ROW
    EXECUTE FUNCTION public.update_business_pattern_confidence();

-- Function: upsert_business_pattern - Atomically insert or update patterns
DROP FUNCTION IF EXISTS public.upsert_business_pattern(uuid, text, varchar, numeric);
CREATE OR REPLACE FUNCTION public.upsert_business_pattern(
    p_business_id UUID,
    p_pattern TEXT,
    p_category VARCHAR(100),
    p_amount NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pattern_id UUID;
BEGIN
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
$$;

-- Performance indexes
CREATE INDEX idx_ai_feedback_user_id ON public.ai_feedback(user_id);
CREATE INDEX idx_ai_feedback_business_id ON public.ai_feedback(business_id);
CREATE INDEX idx_ai_feedback_entity_type ON public.ai_feedback(entity_type);
CREATE INDEX idx_ai_feedback_used_in_training ON public.ai_feedback(used_in_training);
CREATE INDEX idx_ai_feedback_created_at ON public.ai_feedback(created_at);
CREATE INDEX idx_invoice_validations_invoice_id ON public.invoice_validations(invoice_id);
CREATE INDEX idx_invoice_validations_user_id ON public.invoice_validations(user_id);
CREATE INDEX idx_business_patterns_business_id ON public.business_classification_patterns(business_id);
CREATE INDEX idx_business_patterns_pattern_trgm ON public.business_classification_patterns USING gin(item_pattern gin_trgm_ops);

-- Enable RLS
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_classification_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_models ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_feedback
CREATE POLICY "Users can view their own feedback"
    ON public.ai_feedback FOR SELECT
    USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own feedback"
    ON public.ai_feedback FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own feedback"
    ON public.ai_feedback FOR UPDATE
    USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

-- RLS Policies for invoice_validations
CREATE POLICY "Users can view their own validations"
    ON public.invoice_validations FOR SELECT
    USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own validations"
    ON public.invoice_validations FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- RLS Policies for business_classification_patterns
CREATE POLICY "Users can view patterns for their businesses"
    ON public.business_classification_patterns FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.businesses 
            WHERE businesses.id = business_classification_patterns.business_id 
            AND businesses.user_id = auth.uid()
        ) OR has_role(auth.uid(), 'admin')
    );

CREATE POLICY "Users can manage patterns for their businesses"
    ON public.business_classification_patterns FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.businesses 
            WHERE businesses.id = business_classification_patterns.business_id 
            AND businesses.user_id = auth.uid()
        ) OR has_role(auth.uid(), 'admin')
    );

-- RLS Policies for ml_models (admin only)
CREATE POLICY "Admins can manage ml_models"
    ON public.ml_models FOR ALL
    USING (has_role(auth.uid(), 'admin'));
-- Add model_type and status columns to ml_models for better tracking
ALTER TABLE public.ml_models 
ADD COLUMN IF NOT EXISTS model_type VARCHAR(50) DEFAULT 'classification',
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'trained';
-- Create user_insights table for storing proactive insights
CREATE TABLE IF NOT EXISTS user_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month VARCHAR(7) NOT NULL,
    
    -- Insight details
    type VARCHAR(50) NOT NULL,
    priority VARCHAR(10) NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    action TEXT NOT NULL,
    
    -- Financial impact
    potential_saving DECIMAL(15,2),
    potential_cost DECIMAL(15,2),
    
    -- Metadata
    deadline DATE,
    metadata JSONB DEFAULT '{}',
    
    -- User interaction
    is_read BOOLEAN DEFAULT FALSE,
    is_acted_on BOOLEAN DEFAULT FALSE,
    acted_on_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_insights_user_month 
ON user_insights(user_id, month DESC);

CREATE INDEX IF NOT EXISTS idx_user_insights_priority 
ON user_insights(priority, potential_saving DESC NULLS LAST)
WHERE NOT is_read;

CREATE INDEX IF NOT EXISTS idx_user_insights_type 
ON user_insights(type, created_at DESC);

-- Enable RLS
ALTER TABLE user_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own insights"
ON user_insights FOR SELECT
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can update their own insights"
ON user_insights FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "System can insert insights"
ON user_insights FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can manage all insights"
ON user_insights FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_user_insights_updated_at
BEFORE UPDATE ON user_insights
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
-- Create projects table for tracking third-party/agency funds (Section 5 compliance)
CREATE TABLE public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES public.businesses(id),
    
    -- Project Details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    source_person VARCHAR(255) NOT NULL,
    source_relationship VARCHAR(50) NOT NULL,
    
    -- Financials
    budget DECIMAL(15,2) NOT NULL,
    spent DECIMAL(15,2) DEFAULT 0,
    
    -- Tax Treatment (Section 5 compliance)
    is_agency_fund BOOLEAN DEFAULT TRUE,
    tax_treatment VARCHAR(50) DEFAULT 'non_taxable',
    
    -- Status
    status VARCHAR(20) DEFAULT 'active',
    exclude_from_vat BOOLEAN DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    notes TEXT
);

-- Create project_receipts table for Section 32 compliance (Proof of Claims)
CREATE TABLE public.project_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    expense_id UUID REFERENCES public.expenses(id),
    
    -- Receipt Details
    receipt_url TEXT NOT NULL,
    vendor_name VARCHAR(255),
    amount DECIMAL(15,2) NOT NULL,
    date DATE NOT NULL,
    description TEXT,
    
    -- OCR Matching (Section 32 compliance)
    ocr_extracted_amount DECIMAL(15,2),
    ocr_extracted_vendor VARCHAR(255),
    ocr_confidence DECIMAL(3,2),
    is_verified BOOLEAN DEFAULT FALSE,
    verification_method VARCHAR(50),
    
    -- Bank Transaction Matching
    bank_reference VARCHAR(255),
    bank_match_confidence DECIMAL(3,2),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add project linking to expenses table
ALTER TABLE public.expenses ADD COLUMN project_id UUID REFERENCES public.projects(id);
ALTER TABLE public.expenses ADD COLUMN is_project_expense BOOLEAN DEFAULT FALSE;

-- Add project linking to non_revenue_transactions table
ALTER TABLE public.non_revenue_transactions ADD COLUMN project_id UUID REFERENCES public.projects(id);
ALTER TABLE public.non_revenue_transactions ADD COLUMN is_project_fund BOOLEAN DEFAULT FALSE;

-- Create indexes for performance
CREATE INDEX idx_projects_user_status ON public.projects(user_id, status);
CREATE INDEX idx_projects_user_id ON public.projects(user_id);
CREATE INDEX idx_expenses_project ON public.expenses(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_project_receipts_project ON public.project_receipts(project_id);
CREATE INDEX idx_non_revenue_project ON public.non_revenue_transactions(project_id) WHERE project_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_receipts ENABLE ROW LEVEL SECURITY;

-- RLS policies for projects
CREATE POLICY "Users can view their own projects"
ON public.projects FOR SELECT
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create their own projects"
ON public.projects FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own projects"
ON public.projects FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own projects"
ON public.projects FOR DELETE
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all projects"
ON public.projects FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for project_receipts
CREATE POLICY "Users can view receipts for their projects"
ON public.project_receipts FOR SELECT
USING (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_receipts.project_id AND projects.user_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Users can create receipts for their projects"
ON public.project_receipts FOR INSERT
WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_receipts.project_id AND projects.user_id = auth.uid())
);

CREATE POLICY "Users can update receipts for their projects"
ON public.project_receipts FOR UPDATE
USING (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_receipts.project_id AND projects.user_id = auth.uid())
);

CREATE POLICY "Users can delete receipts for their projects"
ON public.project_receipts FOR DELETE
USING (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_receipts.project_id AND projects.user_id = auth.uid())
);

CREATE POLICY "Admins can manage all receipts"
ON public.project_receipts FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger to update updated_at on projects
CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to update project spent amount when expense is added/updated
CREATE OR REPLACE FUNCTION public.update_project_spent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        IF NEW.project_id IS NOT NULL THEN
            UPDATE public.projects 
            SET spent = (
                SELECT COALESCE(SUM(amount), 0) 
                FROM public.expenses 
                WHERE project_id = NEW.project_id AND is_project_expense = TRUE
            ),
            updated_at = NOW()
            WHERE id = NEW.project_id;
        END IF;
        -- Handle case when project_id was changed (old project needs update too)
        IF TG_OP = 'UPDATE' AND OLD.project_id IS NOT NULL AND OLD.project_id != NEW.project_id THEN
            UPDATE public.projects 
            SET spent = (
                SELECT COALESCE(SUM(amount), 0) 
                FROM public.expenses 
                WHERE project_id = OLD.project_id AND is_project_expense = TRUE
            ),
            updated_at = NOW()
            WHERE id = OLD.project_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.project_id IS NOT NULL THEN
            UPDATE public.projects 
            SET spent = (
                SELECT COALESCE(SUM(amount), 0) 
                FROM public.expenses 
                WHERE project_id = OLD.project_id AND is_project_expense = TRUE
            ),
            updated_at = NOW()
            WHERE id = OLD.project_id;
        END IF;
        RETURN OLD;
    END IF;
END;
$$;

-- Trigger to auto-update project spent when expenses change
CREATE TRIGGER update_project_spent_on_expense
AFTER INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_project_spent();
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
-- Add age column to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS age INTEGER;

-- Create user_tax_profiles table
CREATE TABLE IF NOT EXISTS public.user_tax_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    user_type VARCHAR(50) DEFAULT 'individual',
    employment_status VARCHAR(50),
    income_types TEXT[] DEFAULT ARRAY[]::TEXT[],
    is_pensioner BOOLEAN DEFAULT FALSE,
    is_senior_citizen BOOLEAN DEFAULT FALSE,
    is_disabled BOOLEAN DEFAULT FALSE,
    has_diplomatic_immunity BOOLEAN DEFAULT FALSE,
    industry_type VARCHAR(100),
    is_professional_services BOOLEAN DEFAULT FALSE,
    ai_confidence DECIMAL(5,4),
    user_confirmed BOOLEAN DEFAULT FALSE,
    last_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create profile_corrections table
CREATE TABLE IF NOT EXISTS public.profile_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    ai_prediction JSONB NOT NULL,
    user_correction JSONB NOT NULL,
    signals JSONB,
    correction_reason TEXT,
    used_in_training BOOLEAN DEFAULT FALSE,
    training_batch_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_tax_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_corrections ENABLE ROW LEVEL SECURITY;

-- Create indexes for user_tax_profiles
CREATE INDEX IF NOT EXISTS idx_user_tax_profiles_user ON public.user_tax_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tax_profiles_pensioner ON public.user_tax_profiles(user_id) WHERE is_pensioner = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_tax_profiles_employment ON public.user_tax_profiles(employment_status);

-- Create indexes for profile_corrections
CREATE INDEX IF NOT EXISTS idx_profile_corrections_training ON public.profile_corrections(id) WHERE used_in_training = FALSE;
CREATE INDEX IF NOT EXISTS idx_profile_corrections_user ON public.profile_corrections(user_id, created_at DESC);

-- RLS Policies for user_tax_profiles
CREATE POLICY "Users can view their own tax profile"
ON public.user_tax_profiles
FOR SELECT
USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create their own tax profile"
ON public.user_tax_profiles
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own tax profile"
ON public.user_tax_profiles
FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all tax profiles"
ON public.user_tax_profiles
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for profile_corrections
CREATE POLICY "Users can view their own corrections"
ON public.profile_corrections
FOR SELECT
USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create their own corrections"
ON public.profile_corrections
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all corrections"
ON public.profile_corrections
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at on user_tax_profiles
CREATE TRIGGER update_user_tax_profiles_updated_at
BEFORE UPDATE ON public.user_tax_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Create receipts table for OCR-processed receipts
CREATE TABLE IF NOT EXISTS public.receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    image_url TEXT,
    merchant VARCHAR(255),
    amount NUMERIC(15,2),
    date DATE,
    category VARCHAR(100),
    confidence NUMERIC(5,4),
    confirmed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create conversation_state table for multi-platform chat state
CREATE TABLE IF NOT EXISTS public.conversation_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id VARCHAR(100),
    whatsapp_id VARCHAR(100),
    expecting VARCHAR(100),
    context JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_telegram_id UNIQUE (telegram_id),
    CONSTRAINT unique_whatsapp_id UNIQUE (whatsapp_id)
);

-- Add Telegram/platform support columns to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS telegram_id VARCHAR(100) UNIQUE,
ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(100),
ADD COLUMN IF NOT EXISTS whatsapp_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS full_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS nin VARCHAR(11),
ADD COLUMN IF NOT EXISTS cac_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS tax_regime VARCHAR(10),
ADD COLUMN IF NOT EXISTS company_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'whatsapp';

-- Make columns nullable for Telegram users who don't have WhatsApp
ALTER TABLE public.users ALTER COLUMN whatsapp_number DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN business_name DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN tin DROP NOT NULL;

-- Enable RLS on new tables
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_state ENABLE ROW LEVEL SECURITY;

-- RLS policies for receipts
CREATE POLICY "Users can view own receipts" ON public.receipts
    FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create own receipts" ON public.receipts
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own receipts" ON public.receipts
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own receipts" ON public.receipts
    FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all receipts" ON public.receipts
    FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for conversation_state (service-level access for bot)
CREATE POLICY "Admins can manage all conversation states" ON public.conversation_state
    FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage conversation states" ON public.conversation_state
    FOR ALL USING (true) WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_receipts_user_id ON public.receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_receipts_date ON public.receipts(date);
CREATE INDEX IF NOT EXISTS idx_conversation_state_telegram ON public.conversation_state(telegram_id) WHERE telegram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversation_state_whatsapp ON public.conversation_state(whatsapp_id) WHERE whatsapp_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON public.users(telegram_id) WHERE telegram_id IS NOT NULL;

-- Trigger for updated_at on receipts
CREATE TRIGGER update_receipts_updated_at
    BEFORE UPDATE ON public.receipts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on conversation_state
CREATE TRIGGER update_conversation_state_updated_at
    BEFORE UPDATE ON public.conversation_state
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
-- Analytics tables for event tracking and metrics
CREATE TABLE IF NOT EXISTS user_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_user_type ON user_events(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON user_events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_type ON user_events(event_type);

-- Pre-aggregated analytics summary
CREATE TABLE IF NOT EXISTS analytics_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_name VARCHAR(50) NOT NULL,
    metric_value DECIMAL(15,2),
    period VARCHAR(10), -- 'daily', 'weekly', 'monthly'
    period_date DATE,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_metric ON analytics_summary(metric_name, period_date);
CREATE INDEX IF NOT EXISTS idx_analytics_period ON analytics_summary(period, period_date);
-- Add priority columns to review_queue table
ALTER TABLE review_queue ADD COLUMN IF NOT EXISTS priority VARCHAR(10) DEFAULT 'medium';
ALTER TABLE review_queue ADD COLUMN IF NOT EXISTS priority_score DECIMAL(3,2) DEFAULT 0.5;

-- Create index for efficient sorting
CREATE INDEX IF NOT EXISTS idx_review_queue_priority ON review_queue(priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON review_queue(status, priority);

-- Update existing records with calculated priority
UPDATE review_queue rq
SET priority_score = LEAST(1.0, GREATEST(0.0,
    -- Amount score (0-0.4): normalized by ₦2M max
    (COALESCE((SELECT total FROM invoices WHERE id = rq.invoice_id), 0) / 2000000.0) * 0.4 +
    -- Confidence score (0-0.4): inverted (low confidence = high priority)
    (1 - COALESCE((SELECT confidence_score FROM invoices WHERE id = rq.invoice_id), 1)) * 0.4 +
    -- Age score (0-0.2): days old / 7 days max
    (EXTRACT(EPOCH FROM (NOW() - rq.created_at)) / (7 * 24 * 60 * 60)) * 0.2
)),
priority = CASE
    WHEN priority_score > 0.7 THEN 'high'
    WHEN priority_score > 0.4 THEN 'medium'
    ELSE 'low'
END
WHERE status = 'pending';
-- Fix 1: Add business ownership validation to upsert_business_pattern function
DROP FUNCTION IF EXISTS public.upsert_business_pattern(uuid, text, varchar, numeric);
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
-- Step 1: Drop indexes that depend on pg_trgm operators
DROP INDEX IF EXISTS public.idx_business_patterns_pattern_trgm;
DROP INDEX IF EXISTS public.idx_business_patterns_pattern;

-- Step 2: Move pg_trgm extension from public to extensions schema
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- Step 3: Recreate the indexes with schema-qualified operators
CREATE INDEX idx_business_patterns_pattern_trgm 
  ON public.business_classification_patterns 
  USING gin(item_pattern extensions.gin_trgm_ops);
-- Add verification metadata columns to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS verification_status VARCHAR DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS verification_source VARCHAR,
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS verification_data JSONB;

-- Add verification columns to related_parties table
ALTER TABLE public.related_parties 
ADD COLUMN IF NOT EXISTS tin_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS verification_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS verification_data JSONB;

-- Add index for verification status lookups
CREATE INDEX IF NOT EXISTS idx_users_verification_status ON public.users(verification_status);
CREATE INDEX IF NOT EXISTS idx_related_parties_tin_verified ON public.related_parties(tin_verified);
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
-- Phase 4: Tax Act 2025 - Business Classification
-- Act Reference: Section 56 - Small companies (≤₦50M turnover) taxed at 0%

-- Add classification fields to businesses table
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS annual_turnover DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_fixed_assets DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_professional_services BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS classification VARCHAR(20) DEFAULT 'unclassified',
ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,4) DEFAULT 0.30,
ADD COLUMN IF NOT EXISTS last_classified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS classification_year INT;

-- Add check constraint for classification
ALTER TABLE businesses
ADD CONSTRAINT check_classification 
CHECK (classification IN ('small', 'medium', 'large', 'unclassified'));

-- Add check constraint for tax rate
ALTER TABLE businesses
ADD CONSTRAINT check_tax_rate 
CHECK (tax_rate >= 0 AND tax_rate <= 1);

-- Create index for classification queries
CREATE INDEX IF NOT EXISTS idx_businesses_classification 
ON businesses(classification, tax_rate);

CREATE INDEX IF NOT EXISTS idx_businesses_turnover 
ON businesses(annual_turnover DESC) 
WHERE annual_turnover > 0;

-- Add comments
COMMENT ON COLUMN businesses.annual_turnover IS 'Annual gross turnover for classification per Section 56';
COMMENT ON COLUMN businesses.total_fixed_assets IS 'Total fixed assets value for small company threshold (₦250M)';
COMMENT ON COLUMN businesses.is_professional_services IS 'Professional services firms excluded from small company status';
COMMENT ON COLUMN businesses.classification IS 'Tax classification: small (0% tax), medium/large (30% tax)';
COMMENT ON COLUMN businesses.tax_rate IS 'Applicable tax rate based on classification';
COMMENT ON COLUMN businesses.classification_year IS 'Year when classification was last calculated';

-- Small company thresholds (Section 56):
-- Turnover ≤ ₦50,000,000 AND Fixed assets ≤ ₦250,000,000 = 0% tax
-- Professional services EXCLUDED from small company status
-- Phase 4: Tax Act 2025 Compliance - Invoice Requirements
-- Act Reference: Section 153 - Mandatory invoice fields including business registration number

-- Add business_registration_number to invoices table
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS business_registration_number VARCHAR(50);

-- Add registration fields to businesses table
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS registration_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS registration_type VARCHAR(20) CHECK (registration_type IN ('RC', 'BN', 'IT', 'PENDING'));

-- Update PENDING businesses to have a default
UPDATE businesses 
SET registration_number = 'PENDING'
WHERE registration_number IS NULL;

-- Make registration_number NOT NULL after backfill
ALTER TABLE businesses
ALTER COLUMN registration_number SET NOT NULL;

-- Set default for new records
ALTER TABLE businesses
ALTER COLUMN registration_number SET DEFAULT 'PENDING';

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_businesses_registration 
ON businesses(registration_number) 
WHERE registration_number != 'PENDING';

-- Add helpful comment
COMMENT ON COLUMN invoices.business_registration_number IS 'Business registration number per Tax Act 2025 Section 153 - Required for VAT compliance';
COMMENT ON COLUMN businesses.registration_type IS 'RC=Companies (CAC), BN=Business Name, IT=NGO/Trust, PENDING=Awaiting user input';
-- Phase 4: Tax Act 2025 - VAT Reconciliation
-- Act Reference: Section 156 - Input tax credit and monthly reconciliation

-- Add VAT tracking to expenses
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS vat_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS vat_rate DECIMAL(5,4) DEFAULT 0.075,
ADD COLUMN IF NOT EXISTS can_claim_input_vat BOOLEAN DEFAULT TRUE;

-- Create VAT reconciliation table
CREATE TABLE IF NOT EXISTS vat_reconciliations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    period VARCHAR(7) NOT NULL, -- YYYY-MM format
    
    -- Output VAT (collected on sales)
    output_vat DECIMAL(15,2) NOT NULL DEFAULT 0,
    output_vat_invoices_count INT DEFAULT 0,
    
    -- Input VAT (paid on purchases)
    input_vat DECIMAL(15,2) NOT NULL DEFAULT 0,
    input_vat_expenses_count INT DEFAULT 0,
    
    -- Net position
    net_vat DECIMAL(15,2) NOT NULL, -- output - input
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'remit', 'credit', 'refund_requested', 'filed'
    
    -- Credit carried forward from previous month
    credit_brought_forward DECIMAL(15,2) DEFAULT 0,
    credit_carried_forward DECIMAL(15,2) DEFAULT 0,
    
    -- Filing details
    filed_at TIMESTAMPTZ,
    filed_by VARCHAR(50), -- 'system' or admin user
    remittance_proof VARCHAR(255), -- Document reference
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_vat_recon_user_period 
ON vat_reconciliations(user_id, period DESC);

CREATE INDEX IF NOT EXISTS idx_vat_recon_business_period 
ON vat_reconciliations(business_id, period DESC);

CREATE INDEX IF NOT EXISTS idx_vat_recon_status 
ON vat_reconciliations(status) 
WHERE status != 'filed';

-- Unique constraint: one reconciliation per user/business/period
CREATE UNIQUE INDEX IF NOT EXISTS idx_vat_recon_unique 
ON vat_reconciliations(user_id, COALESCE(business_id, '00000000-0000-0000-0000-000000000000'), period);

-- Add comments
COMMENT ON TABLE vat_reconciliations IS 'Monthly VAT reconciliation per Tax Act 2025 Section 156 - tracks output vs input VAT';
COMMENT ON COLUMN vat_reconciliations.period IS 'Month in YYYY-MM format, VAT must be remitted by 14th of following month';
COMMENT ON COLUMN vat_reconciliations.status IS 'remit=owe VAT, credit=carry forward, refund_requested=claimed refund, filed=completed';
-- Phase 6: Bank Charges & EMTL Compliance Tables + Supporting Schema Changes

-- 1. Create emtl_charges table
CREATE TABLE IF NOT EXISTS emtl_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id TEXT NOT NULL UNIQUE,
    amount DECIMAL(10, 2) NOT NULL DEFAULT 50.00,
    linked_transfer_id TEXT,
    transfer_amount DECIMAL(15, 2),
    status TEXT NOT NULL CHECK (status IN ('legitimate', 'exempt_illegal', 'suspicious')),
    category TEXT NOT NULL CHECK (category IN ('emtl', 'stamp_duty')),
    reason TEXT,
    is_deductible BOOLEAN NOT NULL DEFAULT true,
    has_vat BOOLEAN NOT NULL DEFAULT false,
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 2. Create bank_charges table
CREATE TABLE IF NOT EXISTS bank_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id TEXT NOT NULL UNIQUE,
    amount DECIMAL(10, 2) NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('sms_alert', 'card_maintenance', 'cot', 'atm_fee', 'transfer_fee', 'other')),
    description TEXT NOT NULL,
    is_deductible BOOLEAN NOT NULL DEFAULT true,
    vat_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    base_amount DECIMAL(10, 2) NOT NULL,
    confidence DECIMAL(3, 2) NOT NULL DEFAULT 0.5,
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 3. Create analytics_events table (for weekly-savings-alert.worker.ts)
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Add missing columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS business_sector VARCHAR(100);

-- 5. Add missing columns to review_queue table
ALTER TABLE review_queue ADD COLUMN IF NOT EXISTS type VARCHAR(100);
ALTER TABLE review_queue ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 6. Create indexes for emtl_charges
CREATE INDEX IF NOT EXISTS idx_emtl_charges_user_id ON emtl_charges(user_id);
CREATE INDEX IF NOT EXISTS idx_emtl_charges_status ON emtl_charges(status);
CREATE INDEX IF NOT EXISTS idx_emtl_charges_detected_at ON emtl_charges(detected_at);

-- 7. Create indexes for bank_charges
CREATE INDEX IF NOT EXISTS idx_bank_charges_user_id ON bank_charges(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_charges_category ON bank_charges(category);
CREATE INDEX IF NOT EXISTS idx_bank_charges_detected_at ON bank_charges(detected_at);

-- 8. Create indexes for analytics_events
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);

-- 9. Enable RLS on new tables
ALTER TABLE emtl_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- 10. RLS policies for emtl_charges
CREATE POLICY "Users can view their own EMTL charges" ON emtl_charges
  FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own EMTL charges" ON emtl_charges
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all EMTL charges" ON emtl_charges
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- 11. RLS policies for bank_charges
CREATE POLICY "Users can view their own bank charges" ON bank_charges
  FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own bank charges" ON bank_charges
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all bank charges" ON bank_charges
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- 12. RLS policies for analytics_events
CREATE POLICY "Users can view their own events" ON analytics_events
  FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own events" ON analytics_events
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all events" ON analytics_events
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- 13. Updated_at trigger for emtl_charges
CREATE OR REPLACE FUNCTION update_emtl_charges_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS emtl_charges_updated_at ON emtl_charges;
CREATE TRIGGER emtl_charges_updated_at
    BEFORE UPDATE ON emtl_charges
    FOR EACH ROW
    EXECUTE FUNCTION update_emtl_charges_updated_at();

-- 14. Updated_at trigger for bank_charges
CREATE OR REPLACE FUNCTION update_bank_charges_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS bank_charges_updated_at ON bank_charges;
CREATE TRIGGER bank_charges_updated_at
    BEFORE UPDATE ON bank_charges
    FOR EACH ROW
    EXECUTE FUNCTION update_bank_charges_updated_at();

-- 15. Comments for documentation
COMMENT ON TABLE emtl_charges IS 'Electronic Money Transfer Levy charges (₦50) detected from bank statements';
COMMENT ON COLUMN emtl_charges.status IS 'legitimate: Valid charge, exempt_illegal: Should not have been charged, suspicious: Needs review';
COMMENT ON TABLE bank_charges IS 'Bank service charges with VAT extraction';
COMMENT ON TABLE analytics_events IS 'User analytics events for tracking and insights';
-- Enable required extensions for scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
-- Create chatbot_sessions table for Gateway
-- Uses TEXT for user_id because it stores platform-specific IDs (phone numbers, telegram IDs)
CREATE TABLE IF NOT EXISTS public.chatbot_sessions (
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, platform)
);

-- Index for faster lookups by updated_at
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_updated 
  ON public.chatbot_sessions(updated_at DESC);

-- Auto-update updated_at timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_chatbot_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the trigger
DROP TRIGGER IF EXISTS chatbot_sessions_updated_at ON public.chatbot_sessions;
CREATE TRIGGER chatbot_sessions_updated_at
  BEFORE UPDATE ON public.chatbot_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chatbot_sessions_updated_at();

-- Enable RLS (Gateway uses service role key to bypass, but still good practice)
ALTER TABLE public.chatbot_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can manage chatbot sessions via dashboard
-- (Gateway bypasses RLS with service role key)
CREATE POLICY "Admins can manage chatbot sessions" ON public.chatbot_sessions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));
-- Add trigger for auto-updating updated_at on chatbot_sessions
CREATE OR REPLACE FUNCTION public.update_chatbot_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

DROP TRIGGER IF EXISTS chatbot_sessions_updated_at ON public.chatbot_sessions;

CREATE TRIGGER chatbot_sessions_updated_at
  BEFORE UPDATE ON public.chatbot_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chatbot_sessions_updated_at();
-- Drop existing constraint and add 'simulator' as valid platform
ALTER TABLE chatbot_sessions 
DROP CONSTRAINT IF EXISTS chatbot_sessions_platform_check;

ALTER TABLE chatbot_sessions 
ADD CONSTRAINT chatbot_sessions_platform_check 
CHECK (platform IN ('whatsapp', 'telegram', 'simulator'));
-- ============================================
-- Document Processing Tables (from gateway/migrations/002_bank_statements.sql)
-- ============================================

-- Bank statements table
CREATE TABLE IF NOT EXISTS public.bank_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    business_id UUID REFERENCES public.businesses(id),
    file_url TEXT NOT NULL,
    file_name TEXT,
    file_hash TEXT,
    bank_name VARCHAR(100),
    account_number VARCHAR(50),
    statement_start_date DATE,
    statement_end_date DATE,
    currency VARCHAR(10) DEFAULT 'NGN',
    opening_balance NUMERIC(15,2),
    closing_balance NUMERIC(15,2),
    total_credits NUMERIC(15,2) DEFAULT 0,
    total_debits NUMERIC(15,2) DEFAULT 0,
    transaction_count INTEGER DEFAULT 0,
    classified_count INTEGER DEFAULT 0,
    classification_accuracy NUMERIC(5,4),
    processing_status VARCHAR(50) DEFAULT 'pending',
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bank transactions table
CREATE TABLE IF NOT EXISTS public.bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    statement_id UUID REFERENCES public.bank_statements(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    transaction_date DATE NOT NULL,
    value_date DATE,
    description TEXT NOT NULL,
    reference VARCHAR(100),
    debit NUMERIC(15,2),
    credit NUMERIC(15,2),
    balance NUMERIC(15,2),
    classification VARCHAR(100),
    category VARCHAR(100),
    confidence NUMERIC(5,4),
    classification_source VARCHAR(50),
    is_revenue BOOLEAN DEFAULT FALSE,
    is_expense BOOLEAN DEFAULT FALSE,
    is_transfer BOOLEAN DEFAULT FALSE,
    is_bank_charge BOOLEAN DEFAULT FALSE,
    is_tax_relevant BOOLEAN DEFAULT TRUE,
    vat_applicable BOOLEAN DEFAULT FALSE,
    vat_amount NUMERIC(15,2),
    is_nigerian_bank_charge BOOLEAN DEFAULT FALSE,
    is_emtl BOOLEAN DEFAULT FALSE,
    is_stamp_duty BOOLEAN DEFAULT FALSE,
    linked_invoice_id UUID REFERENCES public.invoices(id),
    linked_expense_id UUID REFERENCES public.expenses(id),
    user_reviewed BOOLEAN DEFAULT FALSE,
    user_correction JSONB,
    compliance_flags JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document processing jobs table
CREATE TABLE IF NOT EXISTS public.document_processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    document_url TEXT,
    statement_id UUID REFERENCES public.bank_statements(id),
    processing_status VARCHAR(50) DEFAULT 'queued',
    priority INTEGER DEFAULT 5,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    queued_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    error_message TEXT,
    result JSONB,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes for Performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_bank_statements_user_id ON bank_statements(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_business_id ON bank_statements(business_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_status ON bank_statements(processing_status);
CREATE INDEX IF NOT EXISTS idx_bank_statements_dates ON bank_statements(statement_start_date, statement_end_date);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_statement_id ON bank_transactions(statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_user_id ON bank_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_classification ON bank_transactions(classification);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_category ON bank_transactions(category);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_review ON bank_transactions(user_reviewed) WHERE user_reviewed = FALSE;

CREATE INDEX IF NOT EXISTS idx_processing_jobs_user_id ON document_processing_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON document_processing_jobs(processing_status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_queue ON document_processing_jobs(processing_status, priority, queued_at) WHERE processing_status = 'queued';

-- ============================================
-- Triggers for updated_at
-- ============================================

CREATE TRIGGER update_bank_statements_updated_at
    BEFORE UPDATE ON bank_statements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bank_transactions_updated_at
    BEFORE UPDATE ON bank_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_processing_jobs_updated_at
    BEFORE UPDATE ON document_processing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Statement Stats Update Trigger
-- ============================================

CREATE OR REPLACE FUNCTION update_statement_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE bank_statements
    SET 
        transaction_count = (SELECT COUNT(*) FROM bank_transactions WHERE statement_id = COALESCE(NEW.statement_id, OLD.statement_id)),
        classified_count = (SELECT COUNT(*) FROM bank_transactions WHERE statement_id = COALESCE(NEW.statement_id, OLD.statement_id) AND classification IS NOT NULL),
        classification_accuracy = (
            SELECT CASE 
                WHEN COUNT(*) > 0 THEN AVG(CASE WHEN user_reviewed AND user_correction IS NULL THEN 1.0 ELSE confidence END)
                ELSE NULL 
            END
            FROM bank_transactions 
            WHERE statement_id = COALESCE(NEW.statement_id, OLD.statement_id)
        ),
        updated_at = NOW()
    WHERE id = COALESCE(NEW.statement_id, OLD.statement_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER update_statement_stats_trigger
    AFTER INSERT OR UPDATE OR DELETE ON bank_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_statement_stats();

-- ============================================
-- Add Missing Columns to Businesses
-- ============================================

ALTER TABLE public.businesses 
ADD COLUMN IF NOT EXISTS business_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS industry VARCHAR(100);

-- ============================================
-- Increment Pattern Usage RPC Function
-- ============================================

CREATE OR REPLACE FUNCTION increment_pattern_usage(pattern_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE business_classification_patterns
    SET occurrence_count = occurrence_count + 1,
        last_used_at = NOW()
    WHERE id = pattern_id;
END;
$$;

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_processing_jobs ENABLE ROW LEVEL SECURITY;

-- Bank Statements Policies
CREATE POLICY "Users can view their own statements"
ON public.bank_statements FOR SELECT
USING (user_id::text = auth.uid()::text OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own statements"
ON public.bank_statements FOR INSERT
WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY "Users can update their own statements"
ON public.bank_statements FOR UPDATE
USING (user_id::text = auth.uid()::text OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can delete their own statements"
ON public.bank_statements FOR DELETE
USING (user_id::text = auth.uid()::text);

CREATE POLICY "Admins can manage all statements"
ON public.bank_statements FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Bank Transactions Policies
CREATE POLICY "Users can view their own transactions"
ON public.bank_transactions FOR SELECT
USING (user_id::text = auth.uid()::text OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own transactions"
ON public.bank_transactions FOR INSERT
WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY "Users can update their own transactions"
ON public.bank_transactions FOR UPDATE
USING (user_id::text = auth.uid()::text OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all transactions"
ON public.bank_transactions FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Document Processing Jobs Policies
CREATE POLICY "Users can view their own jobs"
ON public.document_processing_jobs FOR SELECT
USING (user_id::text = auth.uid()::text OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own jobs"
ON public.document_processing_jobs FOR INSERT
WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY "Users can update their own jobs"
ON public.document_processing_jobs FOR UPDATE
USING (user_id::text = auth.uid()::text OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all jobs"
ON public.document_processing_jobs FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- ============================================
-- Enable Realtime for Processing Status
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE bank_statements;
ALTER PUBLICATION supabase_realtime ADD TABLE document_processing_jobs;
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
-- Add Nigerian transaction detection columns to bank_transactions
ALTER TABLE bank_transactions 
ADD COLUMN IF NOT EXISTS is_ussd_transaction boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_mobile_money boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS mobile_money_provider varchar,
ADD COLUMN IF NOT EXISTS is_pos_transaction boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_foreign_currency boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS foreign_currency varchar;

-- Add indexes for common queries on Nigerian transaction types
CREATE INDEX IF NOT EXISTS idx_bank_transactions_mobile_money 
ON bank_transactions(is_mobile_money) WHERE is_mobile_money = true;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_pos 
ON bank_transactions(is_pos_transaction) WHERE is_pos_transaction = true;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_ussd 
ON bank_transactions(is_ussd_transaction) WHERE is_ussd_transaction = true;

-- Add comment for documentation
COMMENT ON COLUMN bank_transactions.is_ussd_transaction IS 'Transaction initiated via USSD banking';
COMMENT ON COLUMN bank_transactions.is_mobile_money IS 'Transaction involves mobile money (OPay, PalmPay, etc.)';
COMMENT ON COLUMN bank_transactions.mobile_money_provider IS 'Name of mobile money provider if detected';
COMMENT ON COLUMN bank_transactions.is_pos_transaction IS 'Point of Sale terminal transaction';
COMMENT ON COLUMN bank_transactions.is_foreign_currency IS 'Transaction involves foreign currency';
COMMENT ON COLUMN bank_transactions.foreign_currency IS 'ISO currency code if foreign currency detected';
-- Create trigram similarity function for fuzzy pattern matching
CREATE OR REPLACE FUNCTION find_similar_pattern(
    p_business_id UUID,
    p_description TEXT,
    p_threshold DECIMAL DEFAULT 0.3
)
RETURNS TABLE (
    id UUID,
    item_pattern TEXT,
    category VARCHAR(100),
    confidence DECIMAL(5,4),
    similarity DECIMAL(5,4)
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        bcp.id,
        bcp.item_pattern,
        bcp.category,
        bcp.confidence,
        similarity(bcp.item_pattern, LOWER(TRIM(p_description))) as sim
    FROM business_classification_patterns bcp
    WHERE bcp.business_id = p_business_id
        AND similarity(bcp.item_pattern, LOWER(TRIM(p_description))) > p_threshold
    ORDER BY sim DESC, bcp.confidence DESC
    LIMIT 1;
END;
$$;

-- Add trigram index for performance (if not exists)
CREATE INDEX IF NOT EXISTS idx_business_patterns_trgm 
ON business_classification_patterns 
USING gin(item_pattern gin_trgm_ops);

-- Add comment for documentation
COMMENT ON FUNCTION find_similar_pattern IS 'Finds the most similar business pattern using trigram similarity (fuzzy matching)';
-- Phase 3: Nigerian Enhancements - CBN Exchange Rates Table
CREATE TABLE IF NOT EXISTS public.cbn_exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency VARCHAR(3) NOT NULL,
    rate NUMERIC(10,4) NOT NULL,
    rate_date DATE NOT NULL,
    source VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(currency, rate_date)
);

CREATE INDEX IF NOT EXISTS idx_cbn_rates_currency_date 
ON cbn_exchange_rates(currency, rate_date DESC);

CREATE TRIGGER update_cbn_rates_updated_at
    BEFORE UPDATE ON cbn_exchange_rates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.cbn_exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view exchange rates"
ON public.cbn_exchange_rates FOR SELECT
USING (true);

CREATE POLICY "Admins can manage rates"
ON public.cbn_exchange_rates FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Extend businesses table for informal sector tracking
ALTER TABLE public.businesses 
ADD COLUMN IF NOT EXISTS informal_business BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cac_registration_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS business_stage VARCHAR(20) DEFAULT 'early';

-- Extend bank_transactions for business linkage, accuracy, and capital tracking
ALTER TABLE public.bank_transactions
ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS user_classification VARCHAR(100),
ADD COLUMN IF NOT EXISTS is_capital_injection BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS capital_type VARCHAR(50);

-- Index for business_id on transactions
CREATE INDEX IF NOT EXISTS idx_bank_transactions_business_id 
ON public.bank_transactions(business_id);

-- Comments
COMMENT ON TABLE cbn_exchange_rates IS 'Cached Central Bank of Nigeria exchange rates for foreign currency compliance';
COMMENT ON COLUMN cbn_exchange_rates.rate IS 'How many Naira for 1 unit of foreign currency';
COMMENT ON COLUMN businesses.informal_business IS 'Whether business is informal/unregistered';
COMMENT ON COLUMN businesses.cac_registration_number IS 'CAC registration number (RC/BN number)';
COMMENT ON COLUMN businesses.business_stage IS 'Business lifecycle: pre_revenue, early, growth, mature';
COMMENT ON COLUMN bank_transactions.user_classification IS 'User-confirmed classification for accuracy tracking';
COMMENT ON COLUMN bank_transactions.is_capital_injection IS 'Whether transaction is capital injection vs revenue';
COMMENT ON COLUMN bank_transactions.capital_type IS 'Type of capital: shareholder, family_support, loan, grant, investment';
-- Table for logging CBN rate fetch attempts
CREATE TABLE IF NOT EXISTS public.cbn_rate_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fetch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  currencies_updated INTEGER DEFAULT 0,
  source VARCHAR(50) NOT NULL DEFAULT 'cbn_scrape',
  success BOOLEAN NOT NULL,
  error_message TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_cbn_rate_logs_date ON cbn_rate_logs(fetch_date DESC);

-- Enable RLS
ALTER TABLE public.cbn_rate_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage rate logs
CREATE POLICY "Admins can manage rate logs"
ON public.cbn_rate_logs FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Create materialized view for transaction analytics
CREATE MATERIALIZED VIEW IF NOT EXISTS transaction_analytics AS
SELECT 
  DATE_TRUNC('day', transaction_date)::date as period,
  business_id,
  user_id,
  COUNT(*) as total_count,
  SUM(CASE WHEN is_ussd_transaction THEN 1 ELSE 0 END) as ussd_count,
  SUM(CASE WHEN is_pos_transaction THEN 1 ELSE 0 END) as pos_count,
  SUM(CASE WHEN is_mobile_money THEN 1 ELSE 0 END) as mobile_money_count,
  SUM(CASE WHEN is_foreign_currency THEN 1 ELSE 0 END) as foreign_currency_count,
  SUM(CASE WHEN is_bank_charge THEN 1 ELSE 0 END) as bank_charge_count,
  SUM(CASE WHEN is_emtl THEN 1 ELSE 0 END) as emtl_count,
  SUM(CASE WHEN vat_applicable THEN COALESCE(vat_amount, 0) ELSE 0 END) as total_vat,
  SUM(CASE WHEN vat_applicable THEN 1 ELSE 0 END) as vat_applicable_count,
  SUM(COALESCE(credit, 0)) as total_credits,
  SUM(COALESCE(debit, 0)) as total_debits,
  COUNT(CASE WHEN classification_source = 'ai' THEN 1 END) as ai_classified_count,
  COUNT(CASE WHEN classification_source = 'rule_based' THEN 1 END) as rule_classified_count,
  COUNT(CASE WHEN classification_source = 'pattern' THEN 1 END) as pattern_classified_count,
  AVG(confidence) as avg_confidence
FROM bank_transactions
GROUP BY DATE_TRUNC('day', transaction_date), business_id, user_id;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_analytics_unique 
ON transaction_analytics(period, COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid), user_id);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_transaction_analytics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY transaction_analytics;
END;
$$;

-- Comments
COMMENT ON TABLE cbn_rate_logs IS 'Logs of CBN exchange rate fetch attempts for monitoring and debugging';
COMMENT ON MATERIALIZED VIEW transaction_analytics IS 'Pre-aggregated Nigerian transaction metrics for dashboard analytics';
-- Revoke direct access to materialized view from anon/authenticated roles
-- Only allow access through admin role check
REVOKE ALL ON transaction_analytics FROM anon, authenticated;

-- Grant access only to authenticated users (RLS will still apply on underlying data)
GRANT SELECT ON transaction_analytics TO authenticated;
-- Phase 4: Enhanced Onboarding (from 005_enhanced_onboarding.sql)
-- Add business context fields for better ML and tax assistance

-- Add business stage tracking to businesses table
ALTER TABLE public.businesses 
ADD COLUMN IF NOT EXISTS account_setup VARCHAR(20) CHECK (account_setup IN ('mixed', 'separate', 'multiple')),
ADD COLUMN IF NOT EXISTS receives_capital_support BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS capital_source VARCHAR(50) CHECK (capital_source IN ('family', 'investors', 'loan', 'bootstrapped', 'grant')),
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Add user preferences to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS insight_frequency VARCHAR(20) DEFAULT 'weekly' CHECK (insight_frequency IN ('daily', 'weekly', 'monthly', 'never')),
ADD COLUMN IF NOT EXISTS auto_categorize BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"email": true, "whatsapp": true, "telegram": false}'::jsonb;

-- Create onboarding_progress table for tracking incomplete onboardings
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    business_id UUID,
    current_step INTEGER DEFAULT 1,
    total_steps INTEGER DEFAULT 8,
    completed_steps JSONB DEFAULT '[]'::jsonb,
    data JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed BOOLEAN DEFAULT FALSE,
    
    UNIQUE(user_id, business_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_businesses_account_setup ON businesses(account_setup);
CREATE INDEX IF NOT EXISTS idx_businesses_capital ON businesses(receives_capital_support, capital_source);
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_user ON onboarding_progress(user_id) WHERE completed = FALSE;

-- Trigger for updated_at
CREATE OR REPLACE TRIGGER update_onboarding_progress_updated_at
    BEFORE UPDATE ON onboarding_progress
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own onboarding progress"
ON public.onboarding_progress FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can manage their own onboarding progress"
ON public.onboarding_progress FOR ALL
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all onboarding progress"
ON public.onboarding_progress FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Comments
COMMENT ON COLUMN businesses.account_setup IS 'How user manages accounts: mixed (personal+business), separate, multiple';
COMMENT ON COLUMN businesses.receives_capital_support IS 'Whether business receives external capital (family, investors, loans)';
COMMENT ON COLUMN businesses.capital_source IS 'Primary source of capital: family, investors, loan, bootstrapped, grant';
COMMENT ON COLUMN users.insight_frequency IS 'How often user wants tax/business insights: daily, weekly, monthly, never';
COMMENT ON COLUMN users.auto_categorize IS 'Whether to auto-categorize transactions using ML (default: true)';
COMMENT ON TABLE onboarding_progress IS 'Tracks incomplete onboarding sessions for resumption';
-- Add onboarding_mode column to system_settings
ALTER TABLE system_settings 
ADD COLUMN IF NOT EXISTS onboarding_mode VARCHAR(20) DEFAULT 'strict';

-- Comment explaining the column
COMMENT ON COLUMN system_settings.onboarding_mode IS 'Onboarding mode: strict (numbers only) or ai (natural language)';

-- Update existing row to have a default value
UPDATE system_settings SET onboarding_mode = 'strict' WHERE onboarding_mode IS NULL;
-- Phase 1: Adaptive Onboarding Profile Columns
ALTER TABLE onboarding_progress 
ADD COLUMN IF NOT EXISTS occupation TEXT,
ADD COLUMN IF NOT EXISTS income_source TEXT,
ADD COLUMN IF NOT EXISTS age_group TEXT,
ADD COLUMN IF NOT EXISTS employment_status TEXT,
ADD COLUMN IF NOT EXISTS tax_category TEXT,
ADD COLUMN IF NOT EXISTS tax_category_reason TEXT,
ADD COLUMN IF NOT EXISTS extracted_profile JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_onboarding_tax_category ON onboarding_progress(tax_category);

-- Phase 2: Profile Learning System
CREATE TABLE IF NOT EXISTS profile_learning_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    field_name TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    reason TEXT,
    confidence NUMERIC(3,2),
    source TEXT NOT NULL DEFAULT 'transaction_pattern',
    transaction_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_history_user ON profile_learning_history(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_history_created ON profile_learning_history(created_at DESC);

ALTER TABLE onboarding_progress
ADD COLUMN IF NOT EXISTS pattern_metrics JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS profile_confidence NUMERIC(3,2) DEFAULT 0.50,
ADD COLUMN IF NOT EXISTS last_learning_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS income_sources_detected TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_onboarding_confidence ON onboarding_progress(profile_confidence);

-- Phase 3: User Tax Profile Summary Columns
ALTER TABLE users
ADD COLUMN IF NOT EXISTS tax_profile_summary JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS primary_tax_category TEXT;

CREATE INDEX IF NOT EXISTS idx_users_tax_category ON users(primary_tax_category);

-- Phase 4: Profile Confidence Trend Function
CREATE OR REPLACE FUNCTION public.get_profile_confidence_trend(p_user_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
    date DATE,
    avg_confidence NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        DATE(plh.created_at) as date,
        AVG(plh.confidence)::NUMERIC as avg_confidence
    FROM profile_learning_history plh
    WHERE plh.user_id = p_user_id
      AND plh.created_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY DATE(plh.created_at)
    ORDER BY date;
END;
$$;

-- Phase 5: RLS for Profile Learning History
ALTER TABLE profile_learning_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile history"
ON profile_learning_history FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "System can insert profile history"
ON profile_learning_history FOR INSERT
WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE profile_learning_history IS 'Tracks changes to user profiles learned from transaction patterns';
COMMENT ON COLUMN onboarding_progress.profile_confidence IS 'Confidence score (0-1) of the learned profile';
COMMENT ON COLUMN onboarding_progress.income_sources_detected IS 'Array of income sources detected from transactions';
COMMENT ON COLUMN users.tax_profile_summary IS 'Summary of user tax profile for quick lookups';
COMMENT ON COLUMN users.primary_tax_category IS 'Primary tax category (employed, self_employed, pensioner, etc)';
-- Add missing updated_at column to ai_feedback
ALTER TABLE ai_feedback 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add trigger for updated_at on ai_feedback
CREATE OR REPLACE FUNCTION update_ai_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER ai_feedback_updated_at
    BEFORE UPDATE ON ai_feedback
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_feedback_updated_at();

-- Add missing needs_review column to invoice_validations
ALTER TABLE invoice_validations 
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE;
-- Add new columns to users table for web onboarding FIRST
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS work_status TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS income_type TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bank_setup TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS consent_given BOOLEAN DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;

-- Index for auth_user_id lookup
CREATE INDEX IF NOT EXISTS idx_users_auth_user ON public.users(auth_user_id);

-- Create telegram_auth_tokens table for secure token linking
CREATE TABLE IF NOT EXISTS public.telegram_auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  telegram_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_telegram_auth_token ON public.telegram_auth_tokens(token) WHERE used = false;
CREATE INDEX IF NOT EXISTS idx_telegram_auth_user ON public.telegram_auth_tokens(user_id);

-- Enable RLS
ALTER TABLE public.telegram_auth_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role can access (tokens are verified server-side)
DROP POLICY IF EXISTS "Service role only for telegram_auth_tokens" ON public.telegram_auth_tokens;
CREATE POLICY "Service role only for telegram_auth_tokens" 
  ON public.telegram_auth_tokens 
  FOR ALL 
  USING (false);

-- Create connected_accounts table for Mono bank accounts
CREATE TABLE IF NOT EXISTS public.connected_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mono_account_id TEXT UNIQUE NOT NULL,
  mono_code TEXT,
  account_name TEXT,
  account_number TEXT,
  bank_name TEXT,
  account_type TEXT,
  status TEXT DEFAULT 'active',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for connected_accounts
CREATE INDEX IF NOT EXISTS idx_connected_accounts_user ON public.connected_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_mono ON public.connected_accounts(mono_account_id);

-- Enable RLS
ALTER TABLE public.connected_accounts ENABLE ROW LEVEL SECURITY;

-- Users can view their own connected accounts
DROP POLICY IF EXISTS "Users can view own connected accounts" ON public.connected_accounts;
CREATE POLICY "Users can view own connected accounts" 
  ON public.connected_accounts 
  FOR SELECT 
  USING (user_id IN (
    SELECT id FROM public.users WHERE auth_user_id = auth.uid()
  ));

-- Users can insert their own connected accounts
DROP POLICY IF EXISTS "Users can insert own connected accounts" ON public.connected_accounts;
CREATE POLICY "Users can insert own connected accounts" 
  ON public.connected_accounts 
  FOR INSERT 
  WITH CHECK (user_id IN (
    SELECT id FROM public.users WHERE auth_user_id = auth.uid()
  ));

-- Update trigger for connected_accounts
DROP TRIGGER IF EXISTS update_connected_accounts_updated_at ON public.connected_accounts;
CREATE TRIGGER update_connected_accounts_updated_at
  BEFORE UPDATE ON public.connected_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
-- Migration: Add adaptive profile columns to onboarding_progress
-- Supports new user types and rich profile extraction

-- Add extended entity types and profile columns
ALTER TABLE onboarding_progress 
ADD COLUMN IF NOT EXISTS occupation TEXT,
ADD COLUMN IF NOT EXISTS income_source TEXT,
ADD COLUMN IF NOT EXISTS age_group TEXT,
ADD COLUMN IF NOT EXISTS employment_status TEXT,
ADD COLUMN IF NOT EXISTS tax_category TEXT,
ADD COLUMN IF NOT EXISTS tax_category_reason TEXT,
ADD COLUMN IF NOT EXISTS extracted_profile JSONB DEFAULT '{}'::jsonb;

-- Add index for querying by tax category
CREATE INDEX IF NOT EXISTS idx_onboarding_tax_category ON onboarding_progress(tax_category);

-- Add index for querying by entity type with new types
CREATE INDEX IF NOT EXISTS idx_onboarding_entity_type ON onboarding_progress(((data->>'entityType')::text));

-- Comment on new columns
COMMENT ON COLUMN onboarding_progress.occupation IS 'User occupation extracted from onboarding (e.g., student, banker, trader)';
COMMENT ON COLUMN onboarding_progress.income_source IS 'Primary income source: salary, business, freelance, pension, allowance, none';
COMMENT ON COLUMN onboarding_progress.age_group IS 'Age group: youth, adult, senior';
COMMENT ON COLUMN onboarding_progress.employment_status IS 'Employment status: employed, self_employed, unemployed, retired, student, corper';
COMMENT ON COLUMN onboarding_progress.tax_category IS 'Nigerian tax category: paye, self_assessment, company_tax, exempt, withholding';
COMMENT ON COLUMN onboarding_progress.tax_category_reason IS 'AI reasoning for tax category determination';
COMMENT ON COLUMN onboarding_progress.extracted_profile IS 'Full extracted profile JSON from AI analysis';

-- Update the users table to store tax profile summary
ALTER TABLE users
ADD COLUMN IF NOT EXISTS tax_profile_summary JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS primary_tax_category TEXT;

COMMENT ON COLUMN users.tax_profile_summary IS 'Summary of user tax profile from onboarding';
COMMENT ON COLUMN users.primary_tax_category IS 'Primary tax category for quick filtering';

-- Create an index for tax category queries on users
CREATE INDEX IF NOT EXISTS idx_users_tax_category ON users(primary_tax_category);
-- Migration: Add profile learning tables and columns
-- Tracks profile changes, pattern metrics, and learning history

-- Add profile history tracking table
CREATE TABLE IF NOT EXISTS profile_learning_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    reason TEXT,
    confidence NUMERIC(3,2),
    source TEXT NOT NULL DEFAULT 'transaction_pattern', -- 'transaction_pattern', 'user_correction', 'manual_update'
    transaction_id UUID, -- Optional reference to triggering transaction
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying user's profile history
CREATE INDEX IF NOT EXISTS idx_profile_history_user ON profile_learning_history(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_history_created ON profile_learning_history(created_at DESC);

-- Add pattern tracking columns to onboarding_progress if not exists
ALTER TABLE onboarding_progress
ADD COLUMN IF NOT EXISTS pattern_metrics JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS profile_confidence NUMERIC(3,2) DEFAULT 0.50,
ADD COLUMN IF NOT EXISTS last_learning_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS income_sources_detected TEXT[] DEFAULT '{}';

-- Create index for confidence queries
CREATE INDEX IF NOT EXISTS idx_onboarding_confidence ON onboarding_progress(profile_confidence);

-- Add correction tracking to transactions table (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'transactions') THEN
        ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS original_classification TEXT,
        ADD COLUMN IF NOT EXISTS was_corrected BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS corrected_by_user BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS correction_reason TEXT;
    END IF;
END $$;

-- Comments
COMMENT ON TABLE profile_learning_history IS 'Tracks all changes to user profiles from learning system';
COMMENT ON COLUMN onboarding_progress.pattern_metrics IS 'Accumulated pattern metrics from transaction analysis';
COMMENT ON COLUMN onboarding_progress.profile_confidence IS 'Current confidence score in user profile accuracy (0.50-0.99)';
COMMENT ON COLUMN onboarding_progress.income_sources_detected IS 'Array of income sources detected from transactions';

-- Function to get user profile confidence trend
CREATE OR REPLACE FUNCTION get_profile_confidence_trend(p_user_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
    date DATE,
    avg_confidence NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        DATE(created_at) as date,
        AVG(confidence)::NUMERIC as avg_confidence
    FROM profile_learning_history
    WHERE user_id = p_user_id
      AND created_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY DATE(created_at)
    ORDER BY date;
END;
$$ LANGUAGE plpgsql;
-- Signup Flow V2: AI-Extracted Profile Fields (Fixed)
-- Add columns to users and businesses tables for enhanced profile data

-- ============================================
-- USERS TABLE - Add Missing Columns
-- ============================================

-- Account type (personal or business)
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) DEFAULT 'personal';

-- Classification fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_category VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT;

-- Freeform profile
ALTER TABLE users ADD COLUMN IF NOT EXISTS tell_us_about_yourself TEXT;

-- Income source flags (from AI extraction)
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_business_income BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_salary_income BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_freelance_income BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_pension_income BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_rental_income BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_investment_income BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS informal_business BOOLEAN DEFAULT false;

-- AI extraction confidence (0.0 - 1.0)
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_confidence DECIMAL(3,2);

-- KYC verification fields (nin already exists)
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin_verified_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bvn VARCHAR(11);
ALTER TABLE users ADD COLUMN IF NOT EXISTS bvn_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bvn_verified_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_level INTEGER DEFAULT 0;

-- ============================================
-- BUSINESSES TABLE - Add New Columns
-- ============================================

-- Owner reference (new, alongside existing user_id) - NO FK constraint to avoid orphan issues
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS owner_user_id UUID;

-- Populate owner_user_id ONLY for user_ids that exist in users table
UPDATE businesses b 
SET owner_user_id = b.user_id 
WHERE b.owner_user_id IS NULL 
  AND b.user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = b.user_id);

-- CAC number (new, alongside existing cac_registration_number)
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS cac_number VARCHAR(20);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS cac_verified BOOLEAN DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS cac_data JSONB;

-- Sync cac_number from cac_registration_number if exists
UPDATE businesses SET cac_number = cac_registration_number WHERE cac_number IS NULL AND cac_registration_number IS NOT NULL;

-- TIN verification fields (tin already exists)
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tin_verified BOOLEAN DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tin_data JSONB;

-- Business classification
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS industry_code VARCHAR(50);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS company_size VARCHAR(20);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS revenue_range VARCHAR(20);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tax_category VARCHAR(50);

-- Operations
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS handles_project_funds BOOLEAN DEFAULT false;

-- Freeform profile
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tell_us_about_business TEXT;

-- ============================================
-- INDEXES
-- ============================================

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_account_type ON users(account_type);
CREATE INDEX IF NOT EXISTS idx_users_tax_category ON users(tax_category);
CREATE INDEX IF NOT EXISTS idx_users_nin ON users(nin) WHERE nin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_bvn ON users(bvn) WHERE bvn IS NOT NULL;

-- Businesses indexes
CREATE INDEX IF NOT EXISTS idx_businesses_owner ON businesses(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_businesses_cac ON businesses(cac_number) WHERE cac_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_businesses_tin ON businesses(tin) WHERE tin IS NOT NULL;

-- ============================================
-- TRIGGER FOR UPDATED_AT
-- ============================================

DROP TRIGGER IF EXISTS update_businesses_updated_at ON businesses;
CREATE TRIGGER update_businesses_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
-- Insert missing user profile for legacy auth users
INSERT INTO users (auth_user_id, email, full_name, onboarding_completed)
SELECT 
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
  true
FROM auth.users
WHERE id = 'ab628b75-3165-4ead-9dbe-28b20dc2d3f2'
  AND NOT EXISTS (
    SELECT 1 FROM users WHERE auth_user_id = 'ab628b75-3165-4ead-9dbe-28b20dc2d3f2'
  );
-- Make user_id and registration_number nullable since the edge function uses owner_user_id and cac_number
ALTER TABLE public.businesses ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.businesses ALTER COLUMN registration_number DROP NOT NULL;

-- Drop existing RLS policies that reference user_id
DROP POLICY IF EXISTS "Users can create their own businesses" ON public.businesses;
DROP POLICY IF EXISTS "Users can delete their own businesses" ON public.businesses;
DROP POLICY IF EXISTS "Users can update their own businesses" ON public.businesses;
DROP POLICY IF EXISTS "Users can view their own businesses" ON public.businesses;

-- Recreate RLS policies using owner_user_id instead of user_id
CREATE POLICY "Users can create their own businesses" 
ON public.businesses 
FOR INSERT 
WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Users can delete their own businesses" 
ON public.businesses 
FOR DELETE 
USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can update their own businesses" 
ON public.businesses 
FOR UPDATE 
USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can view their own businesses" 
ON public.businesses 
FOR SELECT 
USING (auth.uid() = owner_user_id OR has_role(auth.uid(), 'admin'::app_role));
-- Create user_activity_log table for tracking login, profile changes, and transaction activity
CREATE TABLE IF NOT EXISTS user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type varchar(50) NOT NULL, -- 'login', 'logout', 'profile_update', 'receipt_upload', 'transaction_classified', etc.
  event_data jsonb DEFAULT '{}',
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Index for efficient user lookups with date ordering
CREATE INDEX idx_user_activity_user_created ON user_activity_log(user_id, created_at DESC);

-- Index for event type filtering
CREATE INDEX idx_user_activity_event_type ON user_activity_log(event_type);

-- Enable RLS
ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;

-- Admins can manage all activity logs
CREATE POLICY "Admins can manage activity logs"
  ON user_activity_log FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Users can view their own activity
CREATE POLICY "Users can view their own activity"
  ON user_activity_log FOR SELECT
  USING (user_id = auth.uid());

-- System can insert activity logs (for edge functions)
CREATE POLICY "System can insert activity logs"
  ON user_activity_log FOR INSERT
  WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE user_activity_log IS 'Tracks user activity events including login/logout, profile changes, and transaction activity';
-- Add auth_user_id to user_insights for frontend compatibility
ALTER TABLE user_insights ADD COLUMN IF NOT EXISTS auth_user_id uuid;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_insights_auth_user_id ON user_insights(auth_user_id);

-- Add RLS policy for auth_user_id access
CREATE POLICY "Users can view own insights by auth_user_id" 
ON user_insights FOR SELECT 
USING (auth_user_id = auth.uid() OR user_id = auth.uid());

CREATE POLICY "Users can update own insights by auth_user_id" 
ON user_insights FOR UPDATE 
USING (auth_user_id = auth.uid() OR user_id = auth.uid());
-- Phase 5: Automated Learning Pipeline - Feedback System
-- Capture user corrections and learn business-specific patterns

-- User corrections on AI classifications
CREATE TABLE IF NOT EXISTS ai_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- What was classified
    entity_type VARCHAR(50) NOT NULL, -- 'invoice_item', 'expense_category', 'supplier'
    entity_id UUID, -- Reference to invoice, expense, etc.
    
    -- Original AI prediction
    ai_prediction JSONB NOT NULL, -- { category: 'office_supplies', confidence: 0.75 }
    ai_model_version VARCHAR(20) DEFAULT 'v1.0',
    
    -- User correction
    user_correction JSONB NOT NULL, -- { category: 'marketing_expense' }
    correction_type VARCHAR(20) DEFAULT 'full_override', -- 'full_override', 'partial_edit', 'confirmation'
    
    -- Context for learning
    item_description TEXT NOT NULL,
    amount DECIMAL(15,2),
    metadata JSONB DEFAULT '{}', -- Additional context
    
    -- Training status
    used_in_training BOOLEAN DEFAULT FALSE,
    training_batch_id UUID,
    trained_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User validation of auto-processed invoices
CREATE TABLE IF NOT EXISTS invoice_validations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- What changed during validation
    original_data JSONB, -- OCR/AI output
    validated_data JSONB, -- User-corrected data
    fields_changed TEXT[], -- ['customer_name', 'vat_amount', 'items[0].description']
    
    -- Quality metrics
    ocr_confidence_score DECIMAL(5,4),
    validation_time_seconds INT, -- Time user spent reviewing
    needs_review BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Business-specific classification patterns (learned from user)
CREATE TABLE IF NOT EXISTS business_classification_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Pattern learned
    item_pattern TEXT NOT NULL, -- Normalized description (e.g., "facebook ads")
    category VARCHAR(100) NOT NULL, -- Learned category (e.g., "marketing_expense")
    confidence DECIMAL(5,4) NOT NULL DEFAULT 0.50, -- How often this pattern → category
    
    -- Usage statistics
    occurrences INT DEFAULT 1,
    correct_predictions INT DEFAULT 0,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Pattern metadata
    average_amount DECIMAL(15,2), -- Average transaction amount for this pattern
    amount_variance DECIMAL(15,2), -- Standard deviation
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(business_id, item_pattern, category)
);

-- ML model versions and performance tracking
CREATE TABLE IF NOT EXISTS ml_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version VARCHAR(20) UNIQUE NOT NULL,
    model_type VARCHAR(50) NOT NULL, -- 'classification', 'category', 'supplier'
    
    -- Model metadata
    training_data_count INT,
    training_started_at TIMESTAMPTZ,
    training_completed_at TIMESTAMPTZ,
    
    -- Performance metrics
    accuracy DECIMAL(5,4),
    precision_score DECIMAL(5,4),
    recall_score DECIMAL(5,4),
    f1_score DECIMAL(5,4),
    
    -- Deployment status
    status VARCHAR(20) DEFAULT 'training', -- training, validation, deployed, deprecated
    deployed_at TIMESTAMPTZ,
    deprecated_at TIMESTAMPTZ,
    
    -- Model artifacts
    model_config JSONB, -- Hyperparameters, architecture
    training_metrics JSONB, -- Detailed training logs
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_feedback_user_created 
ON ai_feedback(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_business 
ON ai_feedback(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_training 
ON ai_feedback(used_in_training, created_at) 
WHERE NOT used_in_training;

CREATE INDEX IF NOT EXISTS idx_ai_feedback_entity 
ON ai_feedback(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_invoice_validations_invoice 
ON invoice_validations(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_validations_user 
ON invoice_validations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_patterns_business 
ON business_classification_patterns(business_id, confidence DESC);

CREATE INDEX IF NOT EXISTS idx_business_patterns_pattern 
ON business_classification_patterns USING gin(item_pattern gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ml_models_status 
ON ml_models(status, version);

-- Enable trigram extension for fuzzy pattern matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Function to update business pattern confidence
CREATE OR REPLACE FUNCTION update_business_pattern_confidence()
RETURNS TRIGGER AS $$
BEGIN
    -- Recalculate confidence based on success rate
    NEW.confidence = CASE 
        WHEN NEW.occurrences > 0 
        THEN LEAST(CAST(NEW.correct_predictions AS DECIMAL) / CAST(NEW.occurrences AS DECIMAL), 0.99)
        ELSE 0.50
    END;
    
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_pattern_confidence
    BEFORE UPDATE OF correct_predictions, occurrences
    ON business_classification_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_business_pattern_confidence();

-- Function to upsert business pattern
DROP FUNCTION IF EXISTS upsert_business_pattern(uuid, text, varchar, decimal);
CREATE OR REPLACE FUNCTION upsert_business_pattern(
    p_business_id UUID,
    p_pattern TEXT,
    p_category VARCHAR(100),
    p_amount DECIMAL DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    INSERT INTO business_classification_patterns (
        business_id,
        item_pattern,
        category,
        occurrences,
        average_amount,
        last_seen_at
    )
    VALUES (
        p_business_id,
        LOWER(TRIM(p_pattern)),
        p_category,
        1,
        p_amount,
        NOW()
    )
    ON CONFLICT (business_id, item_pattern, category) 
    DO UPDATE SET
        occurrences = business_classification_patterns.occurrences + 1,
        average_amount = CASE 
            WHEN p_amount IS NOT NULL 
            THEN (business_classification_patterns.average_amount * business_classification_patterns.occurrences + p_amount) / (business_classification_patterns.occurrences + 1)
            ELSE business_classification_patterns.average_amount
        END,
        last_seen_at = NOW(),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON TABLE ai_feedback IS 'Tracks user corrections on AI predictions for model retraining';
COMMENT ON TABLE invoice_validations IS 'Captures user validation/correction of auto-processed invoices';
COMMENT ON TABLE business_classification_patterns IS 'Business-specific patterns learned from user corrections';
COMMENT ON TABLE ml_models IS 'ML model versions and performance tracking';

COMMENT ON COLUMN ai_feedback.entity_type IS 'Type of entity classified: invoice_item, expense_category, supplier, etc.';
COMMENT ON COLUMN ai_feedback.correction_type IS 'full_override (AI wrong), partial_edit (AI partially correct), confirmation (AI correct)';
COMMENT ON COLUMN business_classification_patterns.confidence IS 'Success rate: correct_predictions / occurrences';
-- Phase 5 Week 3: Insights System
-- Store generated insights for users

CREATE TABLE IF NOT EXISTS user_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    month VARCHAR(7) NOT NULL, -- YYYY-MM format
    
    -- Insight details
    type VARCHAR(50) NOT NULL, -- 'tax_saving', 'threshold_warning', 'vat_refund', 'cash_flow', 'compliance'
    priority VARCHAR(10) NOT NULL, -- 'high', 'medium', 'low'
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    action TEXT NOT NULL,
    
    -- Financial impact
    potential_saving DECIMAL(15,2),
    potential_cost DECIMAL(15,2),
    
    -- Metadata
    deadline DATE,
    metadata JSONB DEFAULT '{}',
    
    -- User interaction
    is_read BOOLEAN DEFAULT FALSE,
    is_acted_on BOOLEAN DEFAULT FALSE,
    acted_on_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_insights_user_month 
ON user_insights(user_id, month DESC);

CREATE INDEX IF NOT EXISTS idx_user_insights_priority 
ON user_insights(priority, potential_saving DESC NULLS LAST)
WHERE NOT is_read;

CREATE INDEX IF NOT EXISTS idx_user_insights_type 
ON user_insights(type, created_at DESC);

-- Add comments
COMMENT ON TABLE user_insights IS 'Proactive tax optimization insights generated for users';
COMMENT ON COLUMN user_insights.type IS 'Type of insight: tax_saving, threshold_warning, vat_refund, cash_flow, compliance';
COMMENT ON COLUMN user_insights.priority IS 'Priority level: high (urgent), medium (important), low (nice to have)';
COMMENT ON COLUMN user_insights.potential_saving IS 'Estimated tax savings if user acts on this insight';
COMMENT ON COLUMN user_insights.potential_cost IS 'Estimated cost/penalty if user ignores this insight';
COMMENT ON COLUMN user_insights.is_acted_on IS 'Whether user has taken action on this insight';
-- Migration: Signup Flow V2 - User Profile and Business Tables
-- Created: 2026-01-05
-- Description: Adds AI-extracted profile fields to users, creates businesses table

-- ============================================
-- USERS TABLE ADDITIONS
-- ============================================

-- Account type (personal or business)
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) DEFAULT 'personal';

-- Entity classification
ALTER TABLE users ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_category VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT;

-- Freeform profile
ALTER TABLE users ADD COLUMN IF NOT EXISTS tell_us_about_yourself TEXT;

-- Income source flags (from AI extraction)
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_business_income BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_salary_income BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_freelance_income BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_pension_income BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_rental_income BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_investment_income BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS informal_business BOOLEAN DEFAULT false;

-- AI extraction confidence (0.0 - 1.0)
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_confidence DECIMAL(3,2);

-- KYC fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin VARCHAR(11);
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin_verified_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bvn VARCHAR(11);
ALTER TABLE users ADD COLUMN IF NOT EXISTS bvn_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bvn_verified_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_level INTEGER DEFAULT 0;

-- ============================================
-- BUSINESSES TABLE (NEW)
-- ============================================

CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Owner reference
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Business identity
  name TEXT NOT NULL,
  cac_number VARCHAR(20),
  cac_verified BOOLEAN DEFAULT false,
  cac_data JSONB,
  
  -- Tax identity
  tin VARCHAR(20),
  tin_verified BOOLEAN DEFAULT false,
  tin_data JSONB,
  vat_registered BOOLEAN DEFAULT false,
  
  -- Business classification
  industry_code VARCHAR(50),
  company_size VARCHAR(20), -- small, medium, large
  revenue_range VARCHAR(20), -- under_25m, 25m_100m, over_100m
  tax_category VARCHAR(50),
  
  -- Operations
  handles_project_funds BOOLEAN DEFAULT false,
  
  -- Freeform profile
  tell_us_about_business TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_users_account_type ON users(account_type);
CREATE INDEX IF NOT EXISTS idx_users_tax_category ON users(tax_category);
CREATE INDEX IF NOT EXISTS idx_users_nin ON users(nin) WHERE nin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_bvn ON users(bvn) WHERE bvn IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_businesses_owner ON businesses(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_businesses_cac ON businesses(cac_number) WHERE cac_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_businesses_tin ON businesses(tin) WHERE tin IS NOT NULL;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- Users can view their own businesses
CREATE POLICY "Users can view own businesses" ON businesses
  FOR SELECT 
  USING (owner_user_id IN (
    SELECT id FROM users WHERE auth_user_id = auth.uid()
  ));

-- Users can insert their own businesses
CREATE POLICY "Users can insert own businesses" ON businesses
  FOR INSERT 
  WITH CHECK (owner_user_id IN (
    SELECT id FROM users WHERE auth_user_id = auth.uid()
  ));

-- Users can update their own businesses
CREATE POLICY "Users can update own businesses" ON businesses
  FOR UPDATE 
  USING (owner_user_id IN (
    SELECT id FROM users WHERE auth_user_id = auth.uid()
  ));

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role full access" ON businesses
  FOR ALL 
  USING (auth.role() = 'service_role');

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_businesses_updated_at ON businesses;
CREATE TRIGGER update_businesses_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VERIFICATION
-- ============================================

-- Run these to verify migration succeeded:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'tax_category';
-- SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'businesses');
-- Phase 5 Week 4: User Tax Profiles
-- AI-assisted classification for edge cases (pensioners, diplomats, etc.)

CREATE TABLE IF NOT EXISTS user_tax_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    
    -- Basic classification
    user_type VARCHAR(50) DEFAULT 'individual', -- 'individual', 'business', 'partnership'
    employment_status VARCHAR(50), -- 'salaried', 'self_employed', 'retired', 'unemployed'
    
    -- Income types (multi-select array)
    income_types TEXT[] DEFAULT ARRAY[]::TEXT[], -- ['salary', 'pension', 'business', 'rental', 'investment', 'gratuity']
    
    -- Special statuses (AI-detected, user-confirmed)
    is_pensioner BOOLEAN DEFAULT FALSE,
    is_senior_citizen BOOLEAN DEFAULT FALSE,
    is_disabled BOOLEAN DEFAULT FALSE,
    has_diplomatic_immunity BOOLEAN DEFAULT FALSE,
    
    -- Business-specific
    industry_type VARCHAR(100),
    is_professional_services BOOLEAN DEFAULT FALSE,
    
    -- AI confidence & user confirmation
    ai_confidence DECIMAL(5,4),
    user_confirmed BOOLEAN DEFAULT FALSE,
    last_updated_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Profile corrections (training data for ML)
CREATE TABLE IF NOT EXISTS profile_corrections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- What AI predicted
    ai_prediction JSONB NOT NULL,
    
    -- What user actually is
    user_correction JSONB NOT NULL,
    
    -- Context
    signals JSONB, -- Age, keywords, patterns that led to prediction
    correction_reason TEXT,
    
    -- Training status
    used_in_training BOOLEAN DEFAULT FALSE,
    training_batch_id UUID,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_tax_profiles_user 
ON user_tax_profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_user_tax_profiles_pensioner 
ON user_tax_profiles(is_pensioner) 
WHERE is_pensioner = TRUE;

CREATE INDEX IF NOT EXISTS idx_user_tax_profiles_employment 
ON user_tax_profiles(employment_status);

CREATE INDEX IF NOT EXISTS idx_profile_corrections_training 
ON profile_corrections(used_in_training, created_at) 
WHERE NOT used_in_training;

CREATE INDEX IF NOT EXISTS idx_profile_corrections_user 
ON profile_corrections(user_id, created_at DESC);

-- Comments
COMMENT ON TABLE user_tax_profiles IS 'User tax classification profiles for applying special rules (pensioners, diplomats, etc.)';
COMMENT ON COLUMN user_tax_profiles.income_types IS 'Array of income types: salary, pension, business, rental, investment, gratuity';
COMMENT ON COLUMN user_tax_profiles.is_pensioner IS 'Receives pension income - eligible for pension exemptions per Section 31';
COMMENT ON COLUMN user_tax_profiles.has_diplomatic_immunity IS 'Diplomatic immunity - fully tax exempt per Vienna Convention';
COMMENT ON COLUMN user_tax_profiles.ai_confidence IS 'ML model confidence in profile classification (0-1)';
COMMENT ON COLUMN user_tax_profiles.user_confirmed IS 'Whether user has confirmed the AI-detected profile';

COMMENT ON TABLE profile_corrections IS 'Training data: User corrections on AI profile predictions';
-- =====================================================
-- PRISM Compliance Knowledge System - Database Schema
-- Version: 1.0.0
-- =====================================================

-- Table: regulatory_bodies
CREATE TABLE IF NOT EXISTS public.regulatory_bodies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT,
    full_name TEXT NOT NULL,
    abbreviation TEXT,
    previous_names TEXT[],
    jurisdiction TEXT DEFAULT 'Federal',
    authority_scope TEXT[],
    website_url TEXT,
    contact_info JSONB,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.regulatory_bodies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regulatory_bodies_read_policy" ON public.regulatory_bodies
    FOR SELECT USING (true);

CREATE POLICY "regulatory_bodies_insert_policy" ON public.regulatory_bodies
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "regulatory_bodies_update_policy" ON public.regulatory_bodies
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "regulatory_bodies_delete_policy" ON public.regulatory_bodies
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Table: legal_documents
CREATE TABLE IF NOT EXISTS public.legal_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN (
        'act', 'regulation', 'circular', 'notice', 'guideline', 
        'ruling', 'amendment', 'gazette', 'order', 'directive'
    )),
    regulatory_body_id UUID REFERENCES public.regulatory_bodies(id),
    document_number TEXT,
    effective_date DATE,
    publication_date DATE,
    expiry_date DATE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'repealed', 'pending')),
    summary TEXT,
    key_provisions TEXT[],
    affected_taxpayers TEXT[],
    tax_types TEXT[],
    file_url TEXT,
    source_url TEXT,
    raw_text TEXT,
    ai_summary TEXT,
    needs_human_review BOOLEAN DEFAULT false,
    review_notes TEXT,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_documents_read_policy" ON public.legal_documents
    FOR SELECT USING (true);

CREATE POLICY "legal_documents_insert_policy" ON public.legal_documents
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "legal_documents_update_policy" ON public.legal_documents
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "legal_documents_delete_policy" ON public.legal_documents
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_legal_documents_type ON public.legal_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_legal_documents_status ON public.legal_documents(status);
CREATE INDEX IF NOT EXISTS idx_legal_documents_effective_date ON public.legal_documents(effective_date);
CREATE INDEX IF NOT EXISTS idx_legal_documents_regulatory_body ON public.legal_documents(regulatory_body_id);

-- Table: legal_provisions
CREATE TABLE IF NOT EXISTS public.legal_provisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
    section_number TEXT,
    title TEXT,
    content TEXT NOT NULL,
    provision_type TEXT CHECK (provision_type IN (
        'definition', 'obligation', 'exemption', 'rate', 
        'penalty', 'procedure', 'deadline', 'relief', 'power', 'general'
    )),
    tax_implications TEXT,
    affected_entities TEXT[],
    compliance_actions TEXT[],
    related_provisions UUID[],
    keywords TEXT[],
    ai_interpretation TEXT,
    confidence_score NUMERIC(3,2),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.legal_provisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_provisions_read_policy" ON public.legal_provisions
    FOR SELECT USING (true);

CREATE POLICY "legal_provisions_insert_policy" ON public.legal_provisions
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "legal_provisions_update_policy" ON public.legal_provisions
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "legal_provisions_delete_policy" ON public.legal_provisions
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_legal_provisions_document ON public.legal_provisions(document_id);
CREATE INDEX IF NOT EXISTS idx_legal_provisions_type ON public.legal_provisions(provision_type);
CREATE INDEX IF NOT EXISTS idx_legal_provisions_keywords ON public.legal_provisions USING gin(keywords);

-- Table: compliance_rules
CREATE TABLE IF NOT EXISTS public.compliance_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provision_id UUID REFERENCES public.legal_provisions(id) ON DELETE SET NULL,
    document_id UUID REFERENCES public.legal_documents(id) ON DELETE CASCADE,
    rule_code TEXT UNIQUE,
    rule_name TEXT NOT NULL,
    description TEXT,
    rule_type TEXT NOT NULL CHECK (rule_type IN (
        'filing_deadline', 'payment_deadline', 'rate_application',
        'threshold_check', 'exemption_eligibility', 'penalty_calculation',
        'documentation_requirement', 'registration_requirement', 'reporting_requirement'
    )),
    conditions JSONB,
    actions JSONB,
    parameters JSONB,
    applies_to TEXT[],
    tax_types TEXT[],
    effective_from DATE,
    effective_to DATE,
    priority INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    previous_version_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.compliance_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compliance_rules_read_policy" ON public.compliance_rules
    FOR SELECT USING (true);

CREATE POLICY "compliance_rules_insert_policy" ON public.compliance_rules
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "compliance_rules_update_policy" ON public.compliance_rules
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "compliance_rules_delete_policy" ON public.compliance_rules
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_compliance_rules_type ON public.compliance_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_active ON public.compliance_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_tax_types ON public.compliance_rules USING gin(tax_types);

-- Table: compliance_change_log
CREATE TABLE IF NOT EXISTS public.compliance_change_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    change_type TEXT NOT NULL CHECK (change_type IN ('created', 'updated', 'deactivated', 'superseded')),
    changed_by UUID,
    change_reason TEXT,
    old_values JSONB,
    new_values JSONB,
    source_document_id UUID REFERENCES public.legal_documents(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.compliance_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compliance_change_log_read_policy" ON public.compliance_change_log
    FOR SELECT USING (true);

CREATE POLICY "compliance_change_log_insert_policy" ON public.compliance_change_log
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_compliance_change_log_entity ON public.compliance_change_log(entity_type, entity_id);

-- Table: regulation_relationships
CREATE TABLE IF NOT EXISTS public.regulation_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_document_id UUID NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
    target_document_id UUID NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL CHECK (relationship_type IN (
        'amends', 'supersedes', 'references', 'implements', 
        'conflicts_with', 'clarifies', 'extends'
    )),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_document_id, target_document_id, relationship_type)
);

ALTER TABLE public.regulation_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regulation_relationships_read_policy" ON public.regulation_relationships
    FOR SELECT USING (true);

CREATE POLICY "regulation_relationships_insert_policy" ON public.regulation_relationships
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "regulation_relationships_update_policy" ON public.regulation_relationships
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "regulation_relationships_delete_policy" ON public.regulation_relationships
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Seed data: Nigerian regulatory bodies
INSERT INTO public.regulatory_bodies (name, abbreviation, jurisdiction, website_url)
VALUES 
    ('Federal Inland Revenue Service', 'FIRS', 'Federal', 'https://firs.gov.ng'),
    ('Nigeria Customs Service', 'NCS', 'Federal', 'https://customs.gov.ng'),
    ('Joint Tax Board', 'JTB', 'Federal', 'https://jtb.gov.ng'),
    ('National Assembly', 'NASS', 'Federal', 'https://nass.gov.ng'),
    ('Ministry of Finance', 'FMoF', 'Federal', 'https://finance.gov.ng'),
    ('Central Bank of Nigeria', 'CBN', 'Federal', 'https://cbn.gov.ng')
ON CONFLICT (name) DO NOTHING;

-- Update trigger function
CREATE OR REPLACE FUNCTION update_compliance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS update_regulatory_bodies_updated_at ON public.regulatory_bodies;
CREATE TRIGGER update_regulatory_bodies_updated_at
    BEFORE UPDATE ON public.regulatory_bodies
    FOR EACH ROW EXECUTE FUNCTION update_compliance_updated_at();

DROP TRIGGER IF EXISTS update_legal_documents_updated_at ON public.legal_documents;
CREATE TRIGGER update_legal_documents_updated_at
    BEFORE UPDATE ON public.legal_documents
    FOR EACH ROW EXECUTE FUNCTION update_compliance_updated_at();

DROP TRIGGER IF EXISTS update_legal_provisions_updated_at ON public.legal_provisions;
CREATE TRIGGER update_legal_provisions_updated_at
    BEFORE UPDATE ON public.legal_provisions
    FOR EACH ROW EXECUTE FUNCTION update_compliance_updated_at();

DROP TRIGGER IF EXISTS update_compliance_rules_updated_at ON public.compliance_rules;
CREATE TRIGGER update_compliance_rules_updated_at
    BEFORE UPDATE ON public.compliance_rules
    FOR EACH ROW EXECUTE FUNCTION update_compliance_updated_at();
-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Add embedding columns for semantic search
ALTER TABLE public.legal_documents 
ADD COLUMN IF NOT EXISTS embedding vector(1536);

ALTER TABLE public.legal_provisions 
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create indexes for vector similarity search
CREATE INDEX IF NOT EXISTS idx_legal_documents_embedding 
ON public.legal_documents 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_legal_provisions_embedding 
ON public.legal_provisions 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Table: compliance_notifications
-- Purpose: Store regulatory change notifications for users
CREATE TABLE IF NOT EXISTS public.compliance_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    document_id UUID REFERENCES public.legal_documents(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES public.compliance_rules(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL CHECK (notification_type IN (
        'new_regulation', 'amendment', 'deadline_reminder', 
        'rate_change', 'threshold_update', 'expiring_exemption'
    )),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    action_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.compliance_notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "compliance_notifications_user_read" ON public.compliance_notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "compliance_notifications_user_update" ON public.compliance_notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- System/admins can insert notifications
CREATE POLICY "compliance_notifications_admin_insert" ON public.compliance_notifications
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_compliance_notifications_user ON public.compliance_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_notifications_unread ON public.compliance_notifications(user_id, is_read) WHERE is_read = false;

-- Table: user_compliance_preferences
-- Purpose: Track which regulations users want to be notified about
CREATE TABLE IF NOT EXISTS public.user_compliance_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    tax_types TEXT[] DEFAULT '{}',
    notify_new_regulations BOOLEAN DEFAULT true,
    notify_amendments BOOLEAN DEFAULT true,
    notify_deadlines BOOLEAN DEFAULT true,
    notify_rate_changes BOOLEAN DEFAULT true,
    email_notifications BOOLEAN DEFAULT true,
    in_app_notifications BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_compliance_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_compliance_preferences_user_access" ON public.user_compliance_preferences
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Function to search documents by semantic similarity
CREATE OR REPLACE FUNCTION search_compliance_documents(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    title text,
    document_type text,
    summary text,
    similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ld.id,
        ld.title,
        ld.document_type,
        ld.summary,
        1 - (ld.embedding <=> query_embedding) as similarity
    FROM legal_documents ld
    WHERE ld.embedding IS NOT NULL
      AND 1 - (ld.embedding <=> query_embedding) > match_threshold
    ORDER BY ld.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Function to search provisions by semantic similarity
CREATE OR REPLACE FUNCTION search_compliance_provisions(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 20
)
RETURNS TABLE (
    id uuid,
    document_id uuid,
    section_number text,
    title text,
    content text,
    provision_type text,
    similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        lp.id,
        lp.document_id,
        lp.section_number,
        lp.title,
        lp.content,
        lp.provision_type,
        1 - (lp.embedding <=> query_embedding) as similarity
    FROM legal_provisions lp
    WHERE lp.embedding IS NOT NULL
      AND 1 - (lp.embedding <=> query_embedding) > match_threshold
    ORDER BY lp.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
-- Fix RLS for users, businesses, and bank_transactions tables
-- These tables have proper policies defined but may have public access issues

-- 1. Drop any overly permissive policies that might exist on users table
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;
DROP POLICY IF EXISTS "Allow public read access" ON public.users;
DROP POLICY IF EXISTS "Public read access" ON public.users;
DROP POLICY IF EXISTS "public_read" ON public.users;

-- 2. Drop any overly permissive policies on businesses table  
DROP POLICY IF EXISTS "Enable read access for all users" ON public.businesses;
DROP POLICY IF EXISTS "Allow public read access" ON public.businesses;
DROP POLICY IF EXISTS "Public read access" ON public.businesses;
DROP POLICY IF EXISTS "public_read" ON public.businesses;
DROP POLICY IF EXISTS "Anyone can view businesses" ON public.businesses;

-- 3. Drop any overly permissive policies on bank_transactions table
DROP POLICY IF EXISTS "Enable read access for all users" ON public.bank_transactions;
DROP POLICY IF EXISTS "Allow public read access" ON public.bank_transactions;
DROP POLICY IF EXISTS "Public read access" ON public.bank_transactions;
DROP POLICY IF EXISTS "public_read" ON public.bank_transactions;
DROP POLICY IF EXISTS "Anyone can view transactions" ON public.bank_transactions;

-- 4. Add INSERT policy for profiles table (allows users to create their own profile)
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- 5. Ensure businesses table has admin management policy
DROP POLICY IF EXISTS "Admins can manage all businesses" ON public.businesses;
CREATE POLICY "Admins can manage all businesses"
ON public.businesses
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- 6. Verify and recreate the proper SELECT policy for businesses
-- First drop existing to avoid conflicts, then recreate
DROP POLICY IF EXISTS "Users can view their own businesses" ON public.businesses;
CREATE POLICY "Users can view their own businesses"
ON public.businesses
FOR SELECT
USING ((auth.uid() = owner_user_id) OR has_role(auth.uid(), 'admin'::app_role));

-- 7. Ensure bank_transactions has proper SELECT policy (recreate to ensure correctness)
DROP POLICY IF EXISTS "Users can view their own transactions" ON public.bank_transactions;
CREATE POLICY "Users can view their own transactions"
ON public.bank_transactions
FOR SELECT
USING (((user_id)::text = (auth.uid())::text) OR has_role(auth.uid(), 'admin'::app_role));

-- 8. Ensure users table has proper SELECT policy (recreate to ensure correctness)
DROP POLICY IF EXISTS "Users can view their own user record" ON public.users;
CREATE POLICY "Users can view their own user record"
ON public.users
FOR SELECT
USING ((id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
-- ============================================
-- PRISM Compliance Knowledge Management System
-- Migration: 6 tables for legal document management
-- ============================================

-- Enable vector extension for embeddings (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- TABLE 1: regulatory_bodies
-- Stores government bodies that issue tax regulations
-- ============================================
CREATE TABLE IF NOT EXISTS regulatory_bodies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  previous_names TEXT[],
  website_url TEXT,
  jurisdiction TEXT,
  authority_scope TEXT[],
  contact_info JSONB,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data for Nigerian regulatory bodies
INSERT INTO regulatory_bodies (code, full_name, previous_names, jurisdiction, authority_scope) VALUES
('NRS', 'Nigeria Revenue Service', ARRAY['FIRS', 'Federal Inland Revenue Service'], 'federal', ARRAY['income_tax', 'vat', 'cgt', 'ppt', 'emtl']),
('CBN', 'Central Bank of Nigeria', NULL, 'federal', ARRAY['monetary_policy', 'banking', 'forex']),
('JRB', 'Joint Revenue Board', ARRAY['JTB', 'Joint Tax Board'], 'federal', ARRAY['tax_coordination', 'dispute_resolution']),
('SEC', 'Securities and Exchange Commission', NULL, 'federal', ARRAY['capital_markets', 'securities']),
('CAC', 'Corporate Affairs Commission', NULL, 'federal', ARRAY['company_registration', 'corporate_governance']),
('NDPR', 'Nigeria Data Protection Commission', NULL, 'federal', ARRAY['data_protection', 'privacy'])
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- TABLE 2: legal_documents
-- Stores acts, regulations, circulars, etc.
-- ============================================
CREATE TABLE IF NOT EXISTS legal_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  regulatory_body_id UUID REFERENCES regulatory_bodies(id),
  
  -- Document Metadata
  document_type TEXT NOT NULL,
  title TEXT NOT NULL,
  official_reference TEXT,
  
  -- Version Control
  version TEXT NOT NULL DEFAULT '1.0',
  supersedes_id UUID REFERENCES legal_documents(id),
  superseded_by_id UUID REFERENCES legal_documents(id),
  
  -- Status & Lifecycle
  status TEXT NOT NULL DEFAULT 'draft',
  effective_date DATE,
  publication_date DATE,
  repeal_date DATE,
  
  -- Content Storage
  original_file_url TEXT,
  extracted_text TEXT,
  structured_content JSONB,
  
  -- AI Processing
  embedding VECTOR(1536),
  summary TEXT,
  key_provisions TEXT[],
  affected_taxpayers TEXT[],
  tax_types TEXT[],
  
  -- Relationships
  amends_documents UUID[],
  related_documents UUID[],
  
  -- Metadata
  source_url TEXT,
  language TEXT DEFAULT 'en',
  tags TEXT[],
  notes TEXT,
  
  -- Audit
  uploaded_by UUID REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  review_status TEXT DEFAULT 'pending',
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legal_docs_status ON legal_documents(status, effective_date);
CREATE INDEX IF NOT EXISTS idx_legal_docs_body ON legal_documents(regulatory_body_id);
CREATE INDEX IF NOT EXISTS idx_legal_docs_type ON legal_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_legal_docs_tax_types ON legal_documents USING GIN(tax_types);

-- ============================================
-- TABLE 3: legal_provisions
-- Extracted provisions from legal documents
-- ============================================
CREATE TABLE IF NOT EXISTS legal_provisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES legal_documents(id) ON DELETE CASCADE,
  
  -- Provision Identification
  section_number TEXT,
  title TEXT,
  provision_text TEXT NOT NULL,
  
  -- Classification
  provision_type TEXT,
  applies_to TEXT[],
  tax_impact TEXT,
  
  -- AI Understanding
  plain_language_summary TEXT,
  examples JSONB,
  computation_formula TEXT,
  
  -- Effective Dates
  effective_from DATE,
  effective_to DATE,
  
  -- Relationships
  supersedes_provision_id UUID REFERENCES legal_provisions(id),
  related_provisions UUID[],
  
  -- Flags
  frequently_applicable BOOLEAN DEFAULT false,
  requires_expert_review BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provisions_document ON legal_provisions(document_id);
CREATE INDEX IF NOT EXISTS idx_provisions_type ON legal_provisions(provision_type);

-- ============================================
-- TABLE 4: compliance_rules
-- Machine-actionable rules translated from provisions
-- ============================================
CREATE TABLE IF NOT EXISTS compliance_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provision_id UUID REFERENCES legal_provisions(id),
  
  -- Rule Definition
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  
  -- Conditions (JSON logic)
  conditions JSONB,
  outcome JSONB,
  
  -- Application Context
  applies_to_transactions BOOLEAN DEFAULT false,
  applies_to_filing BOOLEAN DEFAULT false,
  applies_to_reporting BOOLEAN DEFAULT false,
  
  -- Priority & Conflict Resolution
  priority INTEGER DEFAULT 100,
  conflicts_with UUID[],
  
  -- Validation
  test_cases JSONB,
  last_validated_at TIMESTAMPTZ,
  validation_status TEXT DEFAULT 'pending',
  
  -- Lifecycle
  active BOOLEAN DEFAULT true,
  effective_from DATE,
  effective_to DATE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_rules_type ON compliance_rules(rule_type, active);

-- ============================================
-- TABLE 5: compliance_change_log
-- Track regulatory changes for notifications
-- ============================================
CREATE TABLE IF NOT EXISTS compliance_change_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- What Changed
  change_type TEXT NOT NULL,
  regulatory_body_id UUID REFERENCES regulatory_bodies(id),
  document_id UUID REFERENCES legal_documents(id),
  
  -- Change Details
  summary TEXT NOT NULL,
  detailed_changes JSONB,
  impact_assessment TEXT,
  
  -- User Communication
  notification_sent BOOLEAN DEFAULT false,
  notification_sent_at TIMESTAMPTZ,
  affected_user_count INTEGER,
  
  -- AI Model Updates
  model_update_required BOOLEAN DEFAULT false,
  model_updated_at TIMESTAMPTZ,
  
  -- Metadata
  detected_by TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_change_log_date ON compliance_change_log(created_at DESC);

-- ============================================
-- TABLE 6: regulation_relationships
-- Track complex relationships between regulations
-- ============================================
CREATE TABLE IF NOT EXISTS regulation_relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  source_document_id UUID REFERENCES legal_documents(id),
  target_document_id UUID REFERENCES legal_documents(id),
  
  relationship_type TEXT NOT NULL,
  description TEXT,
  effective_date DATE,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relationships_source ON regulation_relationships(source_document_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON regulation_relationships(relationship_type);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE regulatory_bodies ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_provisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulation_relationships ENABLE ROW LEVEL SECURITY;

-- Regulatory bodies: Public read, admin write
CREATE POLICY "Anyone can read regulatory bodies" ON regulatory_bodies FOR SELECT USING (true);
CREATE POLICY "Admins can manage regulatory bodies" ON regulatory_bodies FOR ALL USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
);

-- Legal documents: Public read active, admin manages all
CREATE POLICY "Anyone can read active legal documents" ON legal_documents FOR SELECT USING (status = 'active');
CREATE POLICY "Admins can manage legal documents" ON legal_documents FOR ALL USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
);

-- Legal provisions: Public read, admin write
CREATE POLICY "Anyone can read legal provisions" ON legal_provisions FOR SELECT USING (true);
CREATE POLICY "Admins can manage legal provisions" ON legal_provisions FOR ALL USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
);

-- Compliance rules: Public read active, admin manages all
CREATE POLICY "Anyone can read active compliance rules" ON compliance_rules FOR SELECT USING (active = true);
CREATE POLICY "Admins can manage compliance rules" ON compliance_rules FOR ALL USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
);

-- Change log: Admin only
CREATE POLICY "Admins can manage change log" ON compliance_change_log FOR ALL USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
);

-- Regulation relationships: Public read, admin write
CREATE POLICY "Anyone can read regulation relationships" ON regulation_relationships FOR SELECT USING (true);
CREATE POLICY "Admins can manage regulation relationships" ON regulation_relationships FOR ALL USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
);
-- Migration: Add team collaboration tables
-- Run this in Supabase SQL Editor

-- Team members table
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_email TEXT NOT NULL,
  member_user_id UUID REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'accountant')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revoked')),
  invite_token TEXT UNIQUE,
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, member_email)
);

-- Transaction notes (for accountant comments)
CREATE TABLE IF NOT EXISTS transaction_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  note_type TEXT DEFAULT 'comment' CHECK (note_type IN ('comment', 'flag', 'suggestion')),
  is_ai_reviewed BOOLEAN DEFAULT FALSE,
  ai_insights JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team activity log (for notifications)
CREATE TABLE IF NOT EXISTS team_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  metadata JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_member ON team_members(member_user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_token ON team_members(invite_token);
CREATE INDEX IF NOT EXISTS idx_transaction_notes_txn ON transaction_notes(transaction_id);
CREATE INDEX IF NOT EXISTS idx_team_activity_user ON team_activity(user_id, is_read);

-- RLS Policies
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_activity ENABLE ROW LEVEL SECURITY;

-- Team members: Owner can manage, members can view
CREATE POLICY "Users can view their team" ON team_members
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()) OR
    member_user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Users can manage their team" ON team_members
  FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- Transaction notes: Team members with access can view/create
CREATE POLICY "Team can view transaction notes" ON transaction_notes
  FOR SELECT USING (
    transaction_id IN (
      SELECT bt.id FROM bank_transactions bt
      WHERE bt.user_id IN (
        SELECT user_id FROM team_members 
        WHERE member_user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
        AND status = 'active'
      ) OR bt.user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

CREATE POLICY "Team can create notes" ON transaction_notes
  FOR INSERT WITH CHECK (
    author_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- Team activity: User can view their activity
CREATE POLICY "Users can view their activity" ON team_activity
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "System can create activity" ON team_activity
  FOR INSERT WITH CHECK (true);
-- =====================================================
-- PHASE 1: CENTRAL RULES ENGINE (Fixed)
-- Update constraint and create materialized view
-- =====================================================

-- First, drop the existing materialized view if it was created
DROP MATERIALIZED VIEW IF EXISTS active_tax_rules;

-- Drop and recreate the rule_type check constraint to include our new types
ALTER TABLE compliance_rules DROP CONSTRAINT IF EXISTS compliance_rules_rule_type_check;

ALTER TABLE compliance_rules ADD CONSTRAINT compliance_rules_rule_type_check 
CHECK (rule_type = ANY (ARRAY[
    -- Original types
    'filing_deadline'::text, 
    'payment_deadline'::text, 
    'rate_application'::text, 
    'threshold_check'::text, 
    'exemption_eligibility'::text, 
    'penalty_calculation'::text, 
    'documentation_requirement'::text, 
    'registration_requirement'::text, 
    'reporting_requirement'::text,
    -- New types for comprehensive sync
    'tax_rate'::text,
    'levy'::text,
    'threshold'::text,
    'relief'::text,
    'deadline'::text,
    'exemption'::text
]));

-- Create unique index if not exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_rules_rule_code ON compliance_rules(rule_code);

-- Create the materialized view for active tax rules
CREATE MATERIALIZED VIEW active_tax_rules AS
SELECT 
    id,
    rule_code,
    rule_name,
    rule_type,
    parameters,
    description,
    effective_from,
    effective_to,
    priority,
    document_id,
    provision_id
FROM compliance_rules
WHERE is_active = true
  AND (effective_from IS NULL OR effective_from <= CURRENT_DATE)
  AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
ORDER BY priority, rule_type, rule_code;

-- Create unique index on the materialized view for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_active_tax_rules_id ON active_tax_rules(id);
CREATE INDEX idx_active_tax_rules_type ON active_tax_rules(rule_type);
CREATE INDEX idx_active_tax_rules_code ON active_tax_rules(rule_code);

-- Create function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_active_tax_rules()
RETURNS TRIGGER AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY active_tax_rules;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-refresh when compliance_rules changes
DROP TRIGGER IF EXISTS trg_refresh_active_tax_rules ON compliance_rules;
CREATE TRIGGER trg_refresh_active_tax_rules
AFTER INSERT OR UPDATE OR DELETE ON compliance_rules
FOR EACH STATEMENT EXECUTE FUNCTION refresh_active_tax_rules();

-- =====================================================
-- SEED INITIAL TAX RULES FROM HARD-CODED VALUES
-- =====================================================

-- PIT Tax Bands (from gateway/src/skills/tax-calculation/index.ts)
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, description, priority, is_active, effective_from)
VALUES 
    ('PIT_BAND_1', 'PIT Band 1 - Tax Free', 'tax_rate', 
     '{"min": 0, "max": 800000, "rate": 0, "label": "First ₦800,000"}',
     'First ₦800,000 of annual income is tax-free under the consolidated relief allowance',
     1, true, '2025-01-01'),
    
    ('PIT_BAND_2', 'PIT Band 2 - 15%', 'tax_rate',
     '{"min": 800000, "max": 3000000, "rate": 0.15, "label": "₦800,001 - ₦3,000,000"}',
     '15% tax rate on income between ₦800,001 and ₦3,000,000',
     2, true, '2025-01-01'),
    
    ('PIT_BAND_3', 'PIT Band 3 - 18%', 'tax_rate',
     '{"min": 3000000, "max": 12000000, "rate": 0.18, "label": "₦3,000,001 - ₦12,000,000"}',
     '18% tax rate on income between ₦3,000,001 and ₦12,000,000',
     3, true, '2025-01-01'),
    
    ('PIT_BAND_4', 'PIT Band 4 - 21%', 'tax_rate',
     '{"min": 12000000, "max": 25000000, "rate": 0.21, "label": "₦12,000,001 - ₦25,000,000"}',
     '21% tax rate on income between ₦12,000,001 and ₦25,000,000',
     4, true, '2025-01-01'),
    
    ('PIT_BAND_5', 'PIT Band 5 - 23%', 'tax_rate',
     '{"min": 25000000, "max": 50000000, "rate": 0.23, "label": "₦25,000,001 - ₦50,000,000"}',
     '23% tax rate on income between ₦25,000,001 and ₦50,000,000',
     5, true, '2025-01-01'),
    
    ('PIT_BAND_6', 'PIT Band 6 - 25%', 'tax_rate',
     '{"min": 50000000, "max": null, "rate": 0.25, "label": "Above ₦50,000,000"}',
     '25% tax rate on income above ₦50,000,000',
     6, true, '2025-01-01')
ON CONFLICT (rule_code) DO UPDATE SET
    parameters = EXCLUDED.parameters,
    description = EXCLUDED.description,
    updated_at = NOW();

-- VAT Rate
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, description, priority, is_active, effective_from)
VALUES 
    ('VAT_STANDARD', 'Standard VAT Rate', 'tax_rate',
     '{"rate": 0.075, "label": "7.5% VAT"}',
     'Standard Value Added Tax rate of 7.5% on taxable goods and services',
     10, true, '2025-01-01')
ON CONFLICT (rule_code) DO UPDATE SET
    parameters = EXCLUDED.parameters,
    updated_at = NOW();

-- EMTL Rate
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, description, priority, is_active, effective_from)
VALUES 
    ('EMTL_RATE', 'Electronic Money Transfer Levy', 'levy',
     '{"amount": 50, "threshold": 10000, "label": "₦50 per transfer ≥₦10,000"}',
     'Electronic Money Transfer Levy of ₦50 on transfers of ₦10,000 and above',
     20, true, '2025-01-01')
ON CONFLICT (rule_code) DO UPDATE SET
    parameters = EXCLUDED.parameters,
    updated_at = NOW();

-- Thresholds
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, description, priority, is_active, effective_from)
VALUES 
    ('MINIMUM_WAGE', 'National Minimum Wage', 'threshold',
     '{"annual": 840000, "monthly": 70000, "label": "₦70,000/month"}',
     'National minimum wage threshold for tax calculations',
     30, true, '2025-01-01'),
    
    ('SMALL_COMPANY_TURNOVER', 'Small Company Turnover Threshold', 'threshold',
     '{"limit": 50000000, "label": "₦50M annual turnover"}',
     'Maximum annual turnover for small company classification',
     31, true, '2025-01-01'),
    
    ('SMALL_COMPANY_ASSETS', 'Small Company Assets Threshold', 'threshold',
     '{"limit": 250000000, "label": "₦250M total assets"}',
     'Maximum total assets for small company classification',
     32, true, '2025-01-01'),
    
    ('VAT_REGISTRATION', 'VAT Registration Threshold', 'threshold',
     '{"turnover": 25000000, "label": "₦25M annual turnover"}',
     'Annual turnover threshold requiring VAT registration',
     33, true, '2025-01-01')
ON CONFLICT (rule_code) DO UPDATE SET
    parameters = EXCLUDED.parameters,
    updated_at = NOW();

-- Reliefs
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, description, priority, is_active, effective_from)
VALUES 
    ('RELIEF_CRA', 'Consolidated Relief Allowance', 'relief',
     '{"percentage": 20, "minimum": 200000, "of": "gross_income", "label": "20% of gross or ₦200K min"}',
     'Consolidated Relief Allowance: higher of 20% of gross income or ₦200,000 plus 1% of gross',
     40, true, '2025-01-01'),
    
    ('RELIEF_PENSION', 'Pension Contribution Relief', 'relief',
     '{"percentage": 8, "of": "basic_salary", "label": "8% of basic salary"}',
     'Tax relief on pension contributions up to 8% of basic salary',
     41, true, '2025-01-01'),
    
    ('RELIEF_NHF', 'National Housing Fund Relief', 'relief',
     '{"percentage": 2.5, "of": "basic_salary", "label": "2.5% of basic salary"}',
     'Tax relief on NHF contributions of 2.5% of basic salary',
     42, true, '2025-01-01'),
    
    ('RELIEF_NHIS', 'National Health Insurance Relief', 'relief',
     '{"percentage": 3.25, "of": "basic_salary", "label": "3.25% of basic salary"}',
     'Tax relief on NHIS contributions of 3.25% of basic salary',
     43, true, '2025-01-01'),
    
    ('RELIEF_LIFE_INSURANCE', 'Life Insurance Relief', 'relief',
     '{"of": "premium_paid", "label": "Actual premium paid"}',
     'Tax relief on life insurance premiums paid',
     44, true, '2025-01-01'),
    
    ('RELIEF_GRATUITY', 'Gratuity Exemption', 'relief',
     '{"exempt_amount": 10000000, "label": "First ₦10M exempt"}',
     'Gratuity payments: First ₦10,000,000 exempt from tax (Section 31(3))',
     45, true, '2025-01-01'),
    
    ('RELIEF_PENSION_INCOME', 'Pension Income Exemption', 'relief',
     '{"exempt_amount": 1000000, "excess_rate": 0.50, "label": "First ₦1M exempt, rest at 50%"}',
     'Pension income: First ₦1M annual exempt, remainder taxed at 50% of normal rates (Section 31(2))',
     46, true, '2025-01-01'),
    
    ('RELIEF_DISABILITY', 'Disability Allowance', 'relief',
     '{"allowance": 500000, "label": "Additional ₦500K allowance"}',
     'Additional ₦500,000 tax-free allowance for persons with disabilities',
     47, true, '2025-01-01'),
    
    ('RELIEF_SENIOR_CITIZEN', 'Senior Citizen Allowance', 'relief',
     '{"allowance": 300000, "age_threshold": 65, "label": "Additional ₦300K for 65+"}',
     'Additional ₦300,000 tax-free allowance for persons aged 65 and above',
     48, true, '2025-01-01')
ON CONFLICT (rule_code) DO UPDATE SET
    parameters = EXCLUDED.parameters,
    updated_at = NOW();

-- Filing Deadlines
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, description, priority, is_active, effective_from)
VALUES 
    ('DEADLINE_VAT', 'VAT Filing Deadline', 'deadline',
     '{"day": 21, "recurrence": "monthly", "label": "21st of each month"}',
     'VAT returns must be filed by the 21st of the following month',
     50, true, '2025-01-01'),
    
    ('DEADLINE_PAYE', 'PAYE Remittance Deadline', 'deadline',
     '{"day": 10, "recurrence": "monthly", "label": "10th of each month"}',
     'PAYE deductions must be remitted by the 10th of the following month',
     51, true, '2025-01-01'),
    
    ('DEADLINE_WHT', 'WHT Remittance Deadline', 'deadline',
     '{"day": 21, "recurrence": "monthly", "label": "21st of each month"}',
     'Withholding tax must be remitted by the 21st of the following month',
     52, true, '2025-01-01'),
    
    ('DEADLINE_ANNUAL_RETURN', 'Annual Tax Return Deadline', 'deadline',
     '{"month": 3, "day": 31, "recurrence": "annual", "label": "March 31st"}',
     'Annual tax returns must be filed by March 31st of the following year',
     53, true, '2025-01-01'),
    
    ('DEADLINE_CIT', 'Company Income Tax Deadline', 'deadline',
     '{"months_after_year_end": 6, "recurrence": "annual", "label": "6 months after year end"}',
     'Company income tax returns due within 6 months of financial year end',
     54, true, '2025-01-01')
ON CONFLICT (rule_code) DO UPDATE SET
    parameters = EXCLUDED.parameters,
    updated_at = NOW();

-- Refresh the materialized view with initial data
REFRESH MATERIALIZED VIEW active_tax_rules;
-- Phase 7: Create tax_deadlines table
CREATE TABLE public.tax_deadlines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deadline_type VARCHAR(50) NOT NULL, -- 'vat', 'paye', 'annual', 'emtl', 'other'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    recurrence VARCHAR(20), -- 'monthly', 'quarterly', 'annual', 'one_time'
    day_of_month INTEGER,
    month_of_year INTEGER,
    specific_date DATE,
    source_rule_id UUID REFERENCES compliance_rules(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phase 8: Create education_articles table
CREATE TABLE public.education_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL, -- 'basics', 'vat', 'paye', 'business', 'deductions', 'compliance'
    content TEXT NOT NULL,
    read_time VARCHAR(20),
    source_provisions UUID[], -- Links to legal_provisions
    is_published BOOLEAN DEFAULT false,
    needs_review BOOLEAN DEFAULT false,
    review_notes TEXT,
    suggested_by_ai BOOLEAN DEFAULT false,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phase 9: Create faq_items table
CREATE TABLE public.faq_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL, -- 'general', 'security', 'tax', 'ai', 'support'
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    source_rules UUID[], -- Links to compliance_rules
    is_published BOOLEAN DEFAULT true,
    needs_review BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.tax_deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faq_items ENABLE ROW LEVEL SECURITY;

-- Public read policies (anyone can view published content)
CREATE POLICY "Anyone can view active deadlines" ON public.tax_deadlines FOR SELECT USING (is_active = true);
CREATE POLICY "Anyone can view published articles" ON public.education_articles FOR SELECT USING (is_published = true);
CREATE POLICY "Anyone can view published FAQs" ON public.faq_items FOR SELECT USING (is_published = true);

-- Admin write policies
CREATE POLICY "Admins can manage deadlines" ON public.tax_deadlines FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage articles" ON public.education_articles FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage FAQs" ON public.faq_items FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Updated_at triggers
CREATE TRIGGER update_tax_deadlines_updated_at BEFORE UPDATE ON public.tax_deadlines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_education_articles_updated_at BEFORE UPDATE ON public.education_articles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_faq_items_updated_at BEFORE UPDATE ON public.faq_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial tax deadlines from compliance rules
INSERT INTO public.tax_deadlines (deadline_type, title, description, recurrence, day_of_month, month_of_year, source_rule_id)
SELECT 
    CASE 
        WHEN rule_code = 'DEADLINE_VAT' THEN 'vat'
        WHEN rule_code = 'DEADLINE_PAYE' THEN 'paye'
        WHEN rule_code = 'DEADLINE_ANNUAL' THEN 'annual'
    END,
    CASE 
        WHEN rule_code = 'DEADLINE_VAT' THEN 'VAT Return'
        WHEN rule_code = 'DEADLINE_PAYE' THEN 'PAYE Remittance'
        WHEN rule_code = 'DEADLINE_ANNUAL' THEN 'Annual Tax Return'
    END,
    CASE 
        WHEN rule_code = 'DEADLINE_VAT' THEN 'Monthly VAT filing due to FIRS'
        WHEN rule_code = 'DEADLINE_PAYE' THEN 'Monthly PAYE tax remittance'
        WHEN rule_code = 'DEADLINE_ANNUAL' THEN 'Personal/Corporate income tax filing'
    END,
    CASE 
        WHEN rule_code IN ('DEADLINE_VAT', 'DEADLINE_PAYE') THEN 'monthly'
        ELSE 'annual'
    END,
    (parameters->>'day')::INTEGER,
    (parameters->>'month')::INTEGER,
    id
FROM compliance_rules 
WHERE rule_code IN ('DEADLINE_VAT', 'DEADLINE_PAYE', 'DEADLINE_ANNUAL') AND is_active = true;

-- Seed initial education articles
INSERT INTO public.education_articles (slug, title, description, category, content, read_time, is_published) VALUES
('what-is-vat', 'Understanding VAT in Nigeria', 'Learn how Value Added Tax works under the Nigeria Tax Act 2025', 'vat', 
'## What is VAT?

Value Added Tax (VAT) is a consumption tax levied at 7.5% on goods and services in Nigeria.

### Key Points:
- Standard rate: **7.5%**
- Administered by FIRS (Federal Inland Revenue Service)
- Monthly returns due by the **21st** of each month

### Exempt Items:
- Basic food items (unprocessed grains, tubers, fruits)
- Medical and pharmaceutical products
- Educational materials

### Zero-Rated Items:
- Exports of goods
- Goods and services purchased by diplomats

### How to Calculate:
VAT = Sale Amount × 7.5%

For example, if you sell goods for ₦100,000:
VAT = ₦100,000 × 7.5% = **₦7,500**', '5 min', true),

('what-is-emtl', 'Electronic Money Transfer Levy (EMTL)', 'Understanding the ₦50 charge on bank transfers', 'basics',
'## What is EMTL?

Electronic Money Transfer Levy is a ₦50 flat charge on electronic fund transfers of ₦10,000 or more.

### Key Facts:
- Amount: **₦50 flat fee**
- Applies to transfers: **₦10,000 and above**
- Collected by: Banks and financial institutions
- Goes to: State governments

### Tips to Minimize EMTL:
1. Consolidate smaller transfers into one larger transfer
2. Use cash for small transactions where practical
3. Plan your transfers to reduce frequency

### Exceptions:
- Transfers below ₦10,000
- Intra-bank transfers (same account)
- Salary payments (employer to employee)', '3 min', true),

('paye-explained', 'PAYE Tax System Explained', 'How Pay As You Earn tax works for employees', 'paye',
'## What is PAYE?

Pay As You Earn (PAYE) is a method of paying income tax where your employer deducts tax from your salary before paying you.

### Tax Bands (Nigeria Tax Act 2025):
| Taxable Income | Rate |
|----------------|------|
| First ₦800,000 | 0% |
| ₦800,001 - ₦3,000,000 | 15% |
| ₦3,000,001 - ₦12,000,000 | 18% |
| ₦12,000,001 - ₦25,000,000 | 21% |
| ₦25,000,001 - ₦50,000,000 | 23% |
| Above ₦50,000,000 | 25% |

### Allowable Deductions:
- Pension: 8% of gross income
- National Housing Fund (NHF): 2.5%
- Life Insurance Premium
- National Health Insurance (NHIS)', '6 min', true),

('business-taxes', 'Taxes for Small Businesses', 'A guide to business taxation in Nigeria', 'business',
'## Business Taxes in Nigeria

### Types of Business Taxes:

1. **Company Income Tax (CIT)**
   - Standard rate: 30%
   - Medium companies: 20%
   - Small companies (turnover < ₦50M): 0%

2. **VAT (if registered)**
   - Rate: 7.5%
   - Registration threshold: ₦25M turnover

3. **Withholding Tax (WHT)**
   - Construction: 5%
   - Professional services: 10%
   - Rent: 10%

### Important Deadlines:
- VAT Returns: 21st of each month
- Annual Returns: March 31st
- CIT Payment: Based on accounting period

### Record Keeping:
Keep all invoices, receipts, and bank statements for at least 6 years.', '7 min', true),

('tax-deductions', 'Maximizing Your Tax Deductions', 'Legal ways to reduce your tax burden', 'deductions',
'## Tax Deductions and Allowances

### Automatic Deductions:
1. **Pension Contribution**: 8% of basic salary
2. **NHF**: 2.5% of basic salary

### Additional Allowances:
1. **Consolidated Relief Allowance (CRA)**
   - Higher of: ₦200,000 OR 1% of gross income
   - PLUS 20% of gross income

2. **Life Insurance Premium**
   - Fully deductible

3. **Housing Loan Interest**
   - Interest on mortgage is deductible', '5 min', true),

('filing-returns', 'How to File Your Tax Returns', 'Step-by-step guide to filing with FIRS', 'compliance',
'## Filing Tax Returns in Nigeria

### For Employees (PAYE):
Your employer handles monthly PAYE remittance. You may need to file annual returns if you have additional income.

### For Self-Employed/Businesses:

**Step 1: Register with FIRS**
- Get your Tax Identification Number (TIN)
- Register on the FIRS TaxPro Max portal

**Step 2: Prepare Documents**
- Financial statements
- Payment receipts
- Bank statements
- Invoices

**Step 3: File Online**
- Log in to taxpromax.firs.gov.ng
- Select return type
- Fill in the forms
- Submit and pay

### Key Deadlines:
- VAT: 21st of following month
- PAYE: 10th of following month
- Annual Returns: March 31st

### Penalties for Late Filing:
- ₦25,000 first month
- ₦5,000 each subsequent month', '4 min', true);

-- Seed initial FAQ items
INSERT INTO public.faq_items (category, question, answer, display_order) VALUES
('general', 'What is PRISM?', 'PRISM is an AI-powered tax automation platform for Nigerian individuals and businesses. It connects to your bank accounts, automatically categorizes transactions, calculates VAT/EMTL, and helps you stay compliant with the Nigeria Tax Act 2025.', 1),
('general', 'Who is PRISM for?', 'PRISM is designed for freelancers, small business owners, employed professionals, and anyone who wants to simplify their Nigerian tax obligations. Whether you need to track VAT, monitor EMTL charges, or prepare for tax filing, PRISM can help.', 2),
('general', 'Is PRISM free?', 'PRISM offers a free tier with basic features including bank connection, transaction categorization, and tax insights. Premium features like advanced reports and priority support are available on paid plans.', 3),
('general', 'How do I get started?', 'Sign up with your email, verify your identity, connect your bank account via Mono, and PRISM starts analyzing your transactions automatically. The whole process takes less than 5 minutes.', 4),
('security', 'How often should I sync my account?', 'PRISM syncs automatically every few hours. You can manually sync anytime from your dashboard. We recommend syncing at least once daily for the most accurate insights and tax calculations.', 1),
('security', 'Is my banking data secure?', 'Yes. PRISM uses Mono (a CBN-licensed provider) for bank connections. We never store your bank login credentials. All data is encrypted in transit using TLS 1.3 and at rest using AES-256 encryption.', 2),
('security', 'Can PRISM access my bank password?', 'No. We use secure OAuth connections through Mono. Your bank credentials are never shared with us or stored on our servers. You authenticate directly with your bank.', 3),
('security', 'What banks are supported?', 'We support all major Nigerian banks that integrate with Mono, including GTBank, Access Bank, Zenith Bank, UBA, First Bank, Kuda, OPay, Wema Bank, Stanbic IBTC, and many more.', 4),
('tax', 'What transactions are tax-deductible?', 'Business expenses like office supplies, professional services, utilities, rent, and transportation are typically deductible. PRISM automatically flags potential deductions based on your transaction categories and Nigerian tax law.', 1),
('tax', 'When do I need to file taxes?', 'VAT returns are due by the 21st of each month. PAYE is due by the 10th. Annual income tax returns are due by March 31st. PRISM sends you reminders before each deadline so you never miss a filing.', 2),
('tax', 'Does PRISM file taxes for me?', 'PRISM prepares all the data and generates reports you can use for filing. The actual submission to FIRS TaxPro Max is done by you or your tax advisor. We provide export functionality to make this process seamless.', 3),
('tax', 'What is EMTL?', 'Electronic Money Transfer Levy (EMTL) is a ₦50 charge on bank transfers of ₦10,000 or more in Nigeria. PRISM automatically tracks your EMTL payments and includes them in your tax reports.', 4),
('ai', 'How accurate are the AI predictions?', 'Our AI classification achieves 85-95% accuracy depending on transaction clarity. Transactions with low confidence scores are automatically flagged for your review. The system learns from your corrections over time.', 1),
('ai', 'Can I correct the AI''s categorization?', 'Yes! Simply click any transaction to see suggested categories and select the correct one. Your corrections help train the system for better future predictions on similar transactions.', 2),
('ai', 'What AI does PRISM use?', 'PRISM uses Claude by Anthropic for intelligent tax assistance and transaction analysis. Our document OCR uses advanced computer vision. All AI processing follows Nigerian tax law guidelines from the Nigeria Tax Act 2025.', 3),
('support', 'How do I get help?', 'Use the AI chat widget in your dashboard to ask PRISM questions about your taxes. For account issues or technical support, email support@prism.ng or connect with us on WhatsApp.', 1),
('support', 'Is there a mobile app?', 'PRISM is a mobile-first web app that works great on any smartphone browser. No app download is required - just visit prism.ng on your phone and you''re ready to go.', 2);
-- Phase 10 & 11: Profile sync trigger and code change proposals

-- Create code_change_proposals table for AI-suggested code changes
CREATE TABLE public.code_change_proposals (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    rule_id UUID REFERENCES public.compliance_rules(id) ON DELETE SET NULL,
    change_log_id UUID REFERENCES public.compliance_change_log(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    affected_files TEXT[] NOT NULL DEFAULT '{}',
    code_diff JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'implemented')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    generated_by TEXT DEFAULT 'ai',
    reviewed_by UUID,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    implemented_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.code_change_proposals ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can manage code proposals" ON public.code_change_proposals
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Create index for efficient queries
CREATE INDEX idx_code_proposals_status ON public.code_change_proposals(status);
CREATE INDEX idx_code_proposals_rule_id ON public.code_change_proposals(rule_id);
CREATE INDEX idx_code_proposals_created_at ON public.code_change_proposals(created_at DESC);

-- Add trigger for updated_at
CREATE TRIGGER update_code_proposals_updated_at
    BEFORE UPDATE ON public.code_change_proposals
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Phase 10: Create function to sync profiles when rules change
CREATE OR REPLACE FUNCTION public.notify_profile_rule_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    affected_rule RECORD;
BEGIN
    -- When a compliance rule changes, log which profiles might need updates
    IF TG_OP = 'UPDATE' OR TG_OP = 'INSERT' THEN
        -- Check if this affects tax calculations (rate changes, threshold changes)
        IF NEW.rule_type IN ('tax_band', 'vat_rate', 'threshold', 'relief', 'emtl') THEN
            -- Insert notification for admins about potential profile recalculations
            INSERT INTO public.compliance_notifications (
                user_id,
                notification_type,
                title,
                message,
                severity,
                metadata
            )
            SELECT DISTINCT
                ur.user_id,
                'rule_change',
                'Tax Rule Updated: ' || NEW.rule_name,
                'A tax rule affecting your calculations has been updated. Your tax estimates may change.',
                CASE 
                    WHEN NEW.rule_type IN ('tax_band', 'vat_rate') THEN 'high'
                    ELSE 'medium'
                END,
                jsonb_build_object(
                    'rule_id', NEW.id,
                    'rule_type', NEW.rule_type,
                    'rule_name', NEW.rule_name
                )
            FROM public.user_roles ur
            WHERE ur.role = 'admin'
            LIMIT 5; -- Only notify first 5 admins
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger for rule changes
DROP TRIGGER IF EXISTS trigger_notify_profile_rule_changes ON public.compliance_rules;
CREATE TRIGGER trigger_notify_profile_rule_changes
    AFTER INSERT OR UPDATE ON public.compliance_rules
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_profile_rule_changes();

-- Phase 13: Add rule version tracking for ML models
ALTER TABLE public.ml_models 
    ADD COLUMN IF NOT EXISTS rule_version_hash TEXT,
    ADD COLUMN IF NOT EXISTS rules_snapshot JSONB;

-- Create function to capture rules snapshot when training
CREATE OR REPLACE FUNCTION public.capture_rules_for_ml_training()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    rules_snapshot JSONB;
BEGIN
    SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'rule_code', rule_code,
        'rule_name', rule_name,
        'rule_type', rule_type,
        'parameters', parameters,
        'version', version,
        'effective_from', effective_from
    ))
    INTO rules_snapshot
    FROM public.compliance_rules
    WHERE is_active = true;
    
    RETURN COALESCE(rules_snapshot, '[]'::jsonb);
END;
$$;

-- Refresh the materialized view
REFRESH MATERIALIZED VIEW active_tax_rules;
-- =============================================
-- Application Version Changelog System
-- =============================================

-- Table: app_releases
-- Stores version releases with metadata
CREATE TABLE public.app_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(20) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    release_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'deprecated')),
    is_major BOOLEAN DEFAULT false,
    is_breaking BOOLEAN DEFAULT false,
    summary TEXT,
    github_release_url TEXT,
    github_release_id BIGINT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

-- Table: app_changelog_entries
-- Individual changelog entries linked to releases
CREATE TABLE public.app_changelog_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_id UUID REFERENCES public.app_releases(id) ON DELETE CASCADE,
    entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('added', 'changed', 'fixed', 'removed', 'security', 'deprecated')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    component VARCHAR(100),
    pull_request_url TEXT,
    commit_hash VARCHAR(40),
    contributor VARCHAR(100),
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_changelog_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for app_releases
-- Public read access for published releases
CREATE POLICY "Published releases are viewable by everyone"
ON public.app_releases
FOR SELECT
USING (status = 'published');

-- Admin full access (using account_type = 'admin')
CREATE POLICY "Admins have full access to releases"
ON public.app_releases
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.auth_user_id = auth.uid() AND users.account_type = 'admin'
    )
);

-- RLS Policies for app_changelog_entries
-- Public read access for entries of published releases
CREATE POLICY "Entries of published releases are viewable by everyone"
ON public.app_changelog_entries
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.app_releases
        WHERE app_releases.id = app_changelog_entries.release_id
        AND app_releases.status = 'published'
    )
);

-- Admin full access to entries
CREATE POLICY "Admins have full access to changelog entries"
ON public.app_changelog_entries
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.auth_user_id = auth.uid() AND users.account_type = 'admin'
    )
);

-- Indexes
CREATE INDEX idx_app_releases_status ON public.app_releases(status);
CREATE INDEX idx_app_releases_version ON public.app_releases(version);
CREATE INDEX idx_app_releases_release_date ON public.app_releases(release_date DESC);
CREATE INDEX idx_changelog_entries_release ON public.app_changelog_entries(release_id);
CREATE INDEX idx_changelog_entries_type ON public.app_changelog_entries(entry_type);

-- Trigger for updated_at
CREATE TRIGGER update_app_releases_updated_at
BEFORE UPDATE ON public.app_releases
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- =============================================================
-- COMPLIANCE LIFECYCLE ENHANCEMENTS MIGRATION
-- Part 1: Auto-sync Tax Deadlines
-- Part 2: Scheduled Notifications
-- Part 4: Webhooks System
-- Part 3: Effective Date Filtering (updated views)
-- =============================================================

-- =====================
-- PART 1: TAX DEADLINES AUTO-SYNC
-- =====================

-- Add source_rule_id column to tax_deadlines for linking
ALTER TABLE tax_deadlines 
ADD COLUMN IF NOT EXISTS source_rule_id UUID REFERENCES compliance_rules(id) ON DELETE SET NULL;

-- Add unique constraint for source_rule_id (only one deadline per rule)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_deadlines_source_rule 
ON tax_deadlines(source_rule_id) WHERE source_rule_id IS NOT NULL;

-- Create function to sync deadline rules to tax_deadlines
CREATE OR REPLACE FUNCTION sync_deadline_rules_to_tax_calendar()
RETURNS trigger AS $$
BEGIN
    -- Only process deadline rules when active
    IF NEW.rule_type IN ('deadline', 'filing_deadline') AND NEW.is_active = true THEN
        INSERT INTO tax_deadlines (
            deadline_type,
            title,
            description,
            recurrence,
            day_of_month,
            month_of_year,
            specific_date,
            source_rule_id,
            is_active
        )
        VALUES (
            COALESCE((NEW.parameters->>'deadline_type')::varchar, NEW.rule_code),
            NEW.rule_name,
            NEW.description,
            COALESCE((NEW.parameters->>'recurrence')::varchar, 'annual'),
            (NEW.parameters->>'day')::integer,
            (NEW.parameters->>'month')::integer,
            NEW.effective_from::date,
            NEW.id,
            true
        )
        ON CONFLICT (source_rule_id) WHERE source_rule_id IS NOT NULL
        DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            recurrence = EXCLUDED.recurrence,
            day_of_month = EXCLUDED.day_of_month,
            month_of_year = EXCLUDED.month_of_year,
            specific_date = EXCLUDED.specific_date,
            is_active = EXCLUDED.is_active,
            updated_at = NOW();
    END IF;
    
    -- Handle deactivation
    IF TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false THEN
        UPDATE tax_deadlines SET is_active = false, updated_at = NOW()
        WHERE source_rule_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-sync deadline rules
DROP TRIGGER IF EXISTS trigger_sync_deadline_rules ON compliance_rules;
CREATE TRIGGER trigger_sync_deadline_rules
    AFTER INSERT OR UPDATE ON compliance_rules
    FOR EACH ROW EXECUTE FUNCTION sync_deadline_rules_to_tax_calendar();

-- =====================
-- PART 2: NOTIFICATION HISTORY TABLE
-- =====================

-- Create notification_history table to prevent duplicate notifications
CREATE TABLE IF NOT EXISTS notification_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_key VARCHAR(255) UNIQUE NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    reference_id UUID,
    reference_date DATE,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    recipients_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE notification_history ENABLE ROW LEVEL SECURITY;

-- Admins can read notification history
CREATE POLICY "Admins can read notification history"
    ON notification_history
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND account_type = 'admin'
    ));

-- System can insert notification history (via service role)
CREATE POLICY "Service role manages notification history"
    ON notification_history
    FOR ALL
    USING (auth.uid() IS NULL);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_notification_history_type ON notification_history(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_history_sent_at ON notification_history(sent_at);

-- =====================
-- PART 4: WEBHOOK SUBSCRIPTIONS
-- =====================

-- Create webhook_subscriptions table
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    endpoint_url TEXT NOT NULL,
    secret_key TEXT NOT NULL,
    events TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    failure_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;

-- Business owners can manage their webhooks
CREATE POLICY "Business owners manage webhooks"
    ON webhook_subscriptions
    FOR ALL
    USING (business_id IN (
        SELECT id FROM businesses WHERE owner_user_id = auth.uid()
    ));

-- Admins can view all webhooks
CREATE POLICY "Admins can view all webhooks"
    ON webhook_subscriptions
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND account_type = 'admin'
    ));

-- Create webhook_delivery_log table
CREATE TABLE IF NOT EXISTS webhook_delivery_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    response_status INTEGER,
    response_body TEXT,
    success BOOLEAN DEFAULT false,
    attempt_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE webhook_delivery_log ENABLE ROW LEVEL SECURITY;

-- Business owners can view their delivery logs
CREATE POLICY "Business owners view delivery logs"
    ON webhook_delivery_log
    FOR SELECT
    USING (subscription_id IN (
        SELECT id FROM webhook_subscriptions WHERE business_id IN (
            SELECT id FROM businesses WHERE owner_user_id = auth.uid()
        )
    ));

-- Admins can view all logs
CREATE POLICY "Admins view all delivery logs"
    ON webhook_delivery_log
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND account_type = 'admin'
    ));

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_business ON webhook_subscriptions(business_id);
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_active ON webhook_subscriptions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_log_subscription ON webhook_delivery_log(subscription_id);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_log_created ON webhook_delivery_log(created_at);

-- Add trigger for updated_at
CREATE TRIGGER update_webhook_subscriptions_updated_at
    BEFORE UPDATE ON webhook_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================
-- PART 3: UPDATED MATERIALIZED VIEWS
-- =====================

-- Drop and recreate active_tax_rules with proper date filtering
DROP MATERIALIZED VIEW IF EXISTS active_tax_rules CASCADE;

CREATE MATERIALIZED VIEW active_tax_rules AS
SELECT 
    id,
    rule_code,
    rule_name,
    rule_type,
    parameters,
    description,
    effective_from,
    effective_to,
    priority,
    is_active
FROM compliance_rules
WHERE is_active = true
  AND (effective_from IS NULL OR effective_from <= CURRENT_DATE)
  AND (effective_to IS NULL OR effective_to >= CURRENT_DATE);

CREATE UNIQUE INDEX idx_active_tax_rules_id ON active_tax_rules(id);
CREATE INDEX idx_active_tax_rules_code ON active_tax_rules(rule_code);
CREATE INDEX idx_active_tax_rules_type ON active_tax_rules(rule_type);

-- Create upcoming_tax_rules view for regulations not yet effective
CREATE MATERIALIZED VIEW IF NOT EXISTS upcoming_tax_rules AS
SELECT 
    id,
    rule_code,
    rule_name,
    rule_type,
    parameters,
    description,
    effective_from,
    effective_to,
    priority
FROM compliance_rules
WHERE is_active = true
  AND effective_from > CURRENT_DATE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_upcoming_rules_id ON upcoming_tax_rules(id);
CREATE INDEX IF NOT EXISTS idx_upcoming_rules_date ON upcoming_tax_rules(effective_from);

-- Update the refresh trigger to also refresh upcoming_tax_rules
CREATE OR REPLACE FUNCTION refresh_all_tax_rule_views()
RETURNS trigger AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY active_tax_rules;
    REFRESH MATERIALIZED VIEW CONCURRENTLY upcoming_tax_rules;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Replace the existing trigger
DROP TRIGGER IF EXISTS refresh_active_tax_rules ON compliance_rules;
CREATE TRIGGER refresh_all_tax_rules_trigger
    AFTER INSERT OR UPDATE OR DELETE ON compliance_rules
    FOR EACH STATEMENT EXECUTE FUNCTION refresh_all_tax_rule_views();

-- =====================
-- BACKFILL EXISTING DEADLINE RULES
-- =====================

-- Sync existing deadline rules to tax_deadlines
INSERT INTO tax_deadlines (deadline_type, title, description, recurrence, day_of_month, month_of_year, specific_date, source_rule_id, is_active)
SELECT 
    COALESCE((parameters->>'deadline_type')::varchar, rule_code),
    rule_name,
    description,
    COALESCE((parameters->>'recurrence')::varchar, 'annual'),
    (parameters->>'day')::integer,
    (parameters->>'month')::integer,
    effective_from::date,
    id,
    true
FROM compliance_rules
WHERE rule_type IN ('deadline', 'filing_deadline')
  AND is_active = true
  AND id NOT IN (SELECT source_rule_id FROM tax_deadlines WHERE source_rule_id IS NOT NULL)
ON CONFLICT (source_rule_id) WHERE source_rule_id IS NOT NULL DO NOTHING;
-- Create the documents bucket for compliance documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documents',
    'documents',
    false,
    52428800,
    ARRAY['application/pdf', 'application/msword', 
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain', 'text/markdown']
);

-- RLS Policy: Admins can upload compliance documents
CREATE POLICY "Admins can upload compliance documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'documents' AND
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
    )
);

-- RLS Policy: Admins can read/manage compliance documents
CREATE POLICY "Admins can manage compliance documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'documents' AND
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
    )
);

-- RLS Policy: Admins can update compliance documents
CREATE POLICY "Admins can update compliance documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'documents' AND
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
    )
);

-- RLS Policy: Admins can delete compliance documents
CREATE POLICY "Admins can delete compliance documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'documents' AND
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
    )
);
-- Update documents bucket to allow application/octet-stream as fallback
UPDATE storage.buckets 
SET allowed_mime_types = ARRAY[
    'application/pdf', 
    'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 
    'text/markdown',
    'application/octet-stream'
]
WHERE id = 'documents';
-- Add is_active column to regulatory_bodies for soft-delete support
ALTER TABLE regulatory_bodies 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add realtime support for legal_documents to enable live counter updates
ALTER PUBLICATION supabase_realtime ADD TABLE legal_documents;
-- Drop the existing incomplete policy
DROP POLICY IF EXISTS compliance_rules_update_policy ON compliance_rules;

-- Recreate with both USING and WITH CHECK clauses
CREATE POLICY compliance_rules_update_policy ON compliance_rules
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
-- Fix: Update sync_deadline_rules_to_tax_calendar to check actions before parameters
CREATE OR REPLACE FUNCTION public.sync_deadline_rules_to_tax_calendar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Only process deadline rules when active
    IF NEW.rule_type IN ('deadline', 'filing_deadline') AND NEW.is_active = true THEN
        INSERT INTO tax_deadlines (
            deadline_type,
            title,
            description,
            recurrence,
            day_of_month,
            month_of_year,
            specific_date,
            source_rule_id,
            is_active
        )
        VALUES (
            -- Check actions first, then parameters, then fall back to rule_code, then rule_name
            COALESCE(
                (NEW.actions->>'deadline_type')::varchar,
                (NEW.parameters->>'deadline_type')::varchar,
                NEW.rule_code,
                NEW.rule_name
            ),
            NEW.rule_name,
            NEW.description,
            COALESCE((NEW.parameters->>'recurrence')::varchar, (NEW.actions->>'recurrence')::varchar, 'annual'),
            COALESCE((NEW.parameters->>'day')::integer, (NEW.actions->>'day')::integer),
            COALESCE((NEW.parameters->>'month')::integer, (NEW.actions->>'month')::integer),
            COALESCE(
                (NEW.actions->>'effective_date')::date,
                (NEW.parameters->>'effective_date')::date,
                NEW.effective_from::date
            ),
            NEW.id,
            true
        )
        ON CONFLICT (source_rule_id) WHERE source_rule_id IS NOT NULL
        DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            recurrence = EXCLUDED.recurrence,
            day_of_month = EXCLUDED.day_of_month,
            month_of_year = EXCLUDED.month_of_year,
            specific_date = EXCLUDED.specific_date,
            is_active = EXCLUDED.is_active,
            updated_at = NOW();
    END IF;
    
    -- Handle deactivation
    IF TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false THEN
        UPDATE tax_deadlines SET is_active = false, updated_at = NOW()
        WHERE source_rule_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$function$;
-- Part 1: Fix ATM rule dates (nested jsonb_set for multiple fields)
UPDATE compliance_rules 
SET actions = jsonb_set(
    jsonb_set(actions, '{effective_date}', '"2026-03-01"'),
    '{message}', '"New ATM fee structure must be implemented by March 1, 2026"'
)
WHERE rule_name = 'ATM_FEE_IMPLEMENTATION_DEADLINE';

-- Fix effective_from date as well if it's wrong
UPDATE compliance_rules 
SET effective_from = '2026-03-01'
WHERE rule_name LIKE 'ATM_FEE_%' AND effective_from = '2025-03-01';

-- Part 2: Update the tax_deadlines entry with correct date and better display
UPDATE tax_deadlines 
SET 
    specific_date = '2026-03-01',
    title = 'New CBN ATM Fee Structure Takes Effect',
    description = 'New ATM fee regulations from CBN take effect. On-site fees: ₦100 per ₦20,000. Off-site fees: ₦150 base + ₦50 per ₦20,000. International: 5% of withdrawal amount.',
    deadline_type = 'regulatory_change',
    updated_at = NOW()
WHERE title = 'ATM_FEE_IMPLEMENTATION_DEADLINE' 
   OR source_rule_id = 'fe694b4f-8247-4a2f-87ab-35aa3011d9f8';

-- Part 3: Drop and recreate active_tax_rules view with actions column
DROP MATERIALIZED VIEW IF EXISTS active_tax_rules CASCADE;
CREATE MATERIALIZED VIEW active_tax_rules AS
SELECT 
    id, 
    rule_code, 
    rule_name, 
    rule_type, 
    parameters, 
    actions,
    description,
    effective_from, 
    effective_to, 
    priority, 
    is_active
FROM compliance_rules
WHERE is_active = true 
  AND (effective_from IS NULL OR effective_from <= CURRENT_DATE) 
  AND (effective_to IS NULL OR effective_to >= CURRENT_DATE);

-- Recreate index for concurrent refresh
CREATE UNIQUE INDEX idx_active_tax_rules_id ON active_tax_rules (id);

-- Part 4: Drop and recreate upcoming_tax_rules view with actions column
DROP MATERIALIZED VIEW IF EXISTS upcoming_tax_rules CASCADE;
CREATE MATERIALIZED VIEW upcoming_tax_rules AS
SELECT 
    id, 
    rule_code, 
    rule_name, 
    rule_type, 
    parameters, 
    actions,
    description,
    effective_from, 
    effective_to, 
    priority
FROM compliance_rules
WHERE is_active = true 
  AND effective_from IS NOT NULL 
  AND effective_from > CURRENT_DATE;

-- Recreate index for concurrent refresh
CREATE UNIQUE INDEX idx_upcoming_tax_rules_id ON upcoming_tax_rules (id);

-- Refresh both views
REFRESH MATERIALIZED VIEW active_tax_rules;
REFRESH MATERIALIZED VIEW upcoming_tax_rules;
-- =====================================================
-- Trigger function to log all compliance-related changes
-- =====================================================
CREATE OR REPLACE FUNCTION public.log_compliance_change()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_entity_type TEXT;
    v_source_doc_id UUID;
BEGIN
    -- Determine entity type based on table name
    v_entity_type := CASE TG_TABLE_NAME
        WHEN 'compliance_rules' THEN 'rule'
        WHEN 'legal_documents' THEN 'document'
        WHEN 'legal_provisions' THEN 'provision'
        ELSE TG_TABLE_NAME
    END;
    
    -- Get source document ID if available
    v_source_doc_id := CASE 
        WHEN TG_TABLE_NAME = 'compliance_rules' AND TG_OP != 'DELETE' THEN NEW.document_id
        WHEN TG_TABLE_NAME = 'legal_provisions' AND TG_OP != 'DELETE' THEN NEW.document_id
        WHEN TG_TABLE_NAME = 'compliance_rules' AND TG_OP = 'DELETE' THEN OLD.document_id
        WHEN TG_TABLE_NAME = 'legal_provisions' AND TG_OP = 'DELETE' THEN OLD.document_id
        ELSE NULL
    END;

    INSERT INTO public.compliance_change_log (
        entity_type,
        entity_id,
        change_type,
        old_values,
        new_values,
        change_reason,
        changed_by,
        source_document_id
    ) VALUES (
        v_entity_type,
        COALESCE(NEW.id, OLD.id),
        LOWER(TG_OP),
        CASE WHEN TG_OP IN ('DELETE', 'UPDATE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        CASE TG_OP
            WHEN 'INSERT' THEN v_entity_type || ' created'
            WHEN 'UPDATE' THEN v_entity_type || ' updated'
            WHEN 'DELETE' THEN v_entity_type || ' deleted'
        END,
        auth.uid(),
        v_source_doc_id
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- =====================================================
-- Attach triggers to compliance tables
-- =====================================================

-- Trigger for compliance_rules
DROP TRIGGER IF EXISTS trg_log_compliance_rules_changes ON public.compliance_rules;
CREATE TRIGGER trg_log_compliance_rules_changes
    AFTER INSERT OR UPDATE OR DELETE ON public.compliance_rules
    FOR EACH ROW EXECUTE FUNCTION public.log_compliance_change();

-- Trigger for legal_documents
DROP TRIGGER IF EXISTS trg_log_legal_documents_changes ON public.legal_documents;
CREATE TRIGGER trg_log_legal_documents_changes
    AFTER INSERT OR UPDATE OR DELETE ON public.legal_documents
    FOR EACH ROW EXECUTE FUNCTION public.log_compliance_change();

-- Trigger for legal_provisions
DROP TRIGGER IF EXISTS trg_log_legal_provisions_changes ON public.legal_provisions;
CREATE TRIGGER trg_log_legal_provisions_changes
    AFTER INSERT OR UPDATE OR DELETE ON public.legal_provisions
    FOR EACH ROW EXECUTE FUNCTION public.log_compliance_change();

-- =====================================================
-- Code proposal queue table for async processing
-- =====================================================
CREATE TABLE IF NOT EXISTS public.code_proposal_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES public.compliance_rules(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    triggered_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.code_proposal_queue ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can manage code proposal queue"
    ON public.code_proposal_queue
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'));

-- Index for processing
CREATE INDEX IF NOT EXISTS idx_code_proposal_queue_status 
    ON public.code_proposal_queue(status) WHERE status = 'pending';

-- =====================================================
-- Trigger to queue code proposals when tax rules activate
-- =====================================================
CREATE OR REPLACE FUNCTION public.queue_code_proposal_on_rule_activation()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Only trigger when a relevant rule type is activated
    IF NEW.is_active = true 
       AND (OLD.is_active = false OR OLD.is_active IS NULL)
       AND NEW.rule_type IN ('tax_rate', 'threshold', 'tax_band', 'relief', 'vat_rate', 'emtl') THEN
        
        INSERT INTO public.code_proposal_queue (rule_id, status)
        VALUES (NEW.id, 'pending');
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_code_proposal ON public.compliance_rules;
CREATE TRIGGER trg_queue_code_proposal
    AFTER UPDATE ON public.compliance_rules
    FOR EACH ROW EXECUTE FUNCTION public.queue_code_proposal_on_rule_activation();
-- Fix legal_documents status constraint to include processing states
-- Drop the old constraint
ALTER TABLE legal_documents 
DROP CONSTRAINT IF EXISTS legal_documents_status_check;

-- Add the updated constraint with all required statuses
ALTER TABLE legal_documents 
ADD CONSTRAINT legal_documents_status_check 
CHECK (status = ANY (ARRAY[
  'pending'::text,
  'processing'::text,
  'processing_failed'::text,
  'active'::text,
  'superseded'::text,
  'repealed'::text,
  'archived'::text
]));
-- Fix: Split the generic log_compliance_change trigger into table-specific functions
-- This avoids the "record has no field document_id" error for legal_documents table

-- Drop existing triggers that use the problematic function
DROP TRIGGER IF EXISTS trg_log_legal_documents_changes ON legal_documents;
DROP TRIGGER IF EXISTS trg_log_compliance_rules_changes ON compliance_rules;
DROP TRIGGER IF EXISTS trg_log_legal_provisions_changes ON legal_provisions;

-- Create specific trigger function for legal_documents (no document_id reference)
CREATE OR REPLACE FUNCTION public.log_legal_document_change() 
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.compliance_change_log (
        entity_type, entity_id, change_type, 
        old_values, new_values, change_reason, 
        changed_by, source_document_id
    ) VALUES (
        'document',
        COALESCE(NEW.id, OLD.id),
        LOWER(TG_OP),
        CASE WHEN TG_OP IN ('DELETE','UPDATE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        'document ' || LOWER(TG_OP) || 'd',
        auth.uid(),
        COALESCE(NEW.id, OLD.id)  -- For documents, the source IS itself
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create specific trigger function for compliance_rules and legal_provisions (HAS document_id)
CREATE OR REPLACE FUNCTION public.log_compliance_entity_change() 
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_entity_type TEXT;
BEGIN
    v_entity_type := CASE TG_TABLE_NAME
        WHEN 'compliance_rules' THEN 'rule'
        WHEN 'legal_provisions' THEN 'provision'
        ELSE TG_TABLE_NAME
    END;
    
    INSERT INTO public.compliance_change_log (
        entity_type, entity_id, change_type, 
        old_values, new_values, change_reason, 
        changed_by, source_document_id
    ) VALUES (
        v_entity_type,
        COALESCE(NEW.id, OLD.id),
        LOWER(TG_OP),
        CASE WHEN TG_OP IN ('DELETE','UPDATE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        v_entity_type || ' ' || LOWER(TG_OP) || 'd',
        auth.uid(),
        CASE WHEN TG_OP = 'DELETE' THEN OLD.document_id ELSE NEW.document_id END
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach the correct trigger to legal_documents
CREATE TRIGGER trg_log_legal_documents_changes
    AFTER INSERT OR UPDATE OR DELETE ON legal_documents
    FOR EACH ROW EXECUTE FUNCTION log_legal_document_change();

-- Attach the correct trigger to compliance_rules
CREATE TRIGGER trg_log_compliance_rules_changes  
    AFTER INSERT OR UPDATE OR DELETE ON compliance_rules
    FOR EACH ROW EXECUTE FUNCTION log_compliance_entity_change();

-- Attach the correct trigger to legal_provisions
CREATE TRIGGER trg_log_legal_provisions_changes
    AFTER INSERT OR UPDATE OR DELETE ON legal_provisions
    FOR EACH ROW EXECUTE FUNCTION log_compliance_entity_change();
-- Fix: Update trigger functions to use correct change_type values
-- The constraint allows: 'created', 'updated', 'deactivated', 'superseded'
-- PostgreSQL TG_OP produces: 'INSERT', 'UPDATE', 'DELETE'

-- Update the legal_document trigger function with correct change_type mapping
CREATE OR REPLACE FUNCTION public.log_legal_document_change() 
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_change_type TEXT;
BEGIN
    v_change_type := CASE TG_OP
        WHEN 'INSERT' THEN 'created'
        WHEN 'UPDATE' THEN 'updated'
        WHEN 'DELETE' THEN 'deactivated'
        ELSE LOWER(TG_OP)
    END;
    
    INSERT INTO public.compliance_change_log (
        entity_type, entity_id, change_type, 
        old_values, new_values, change_reason, 
        changed_by, source_document_id
    ) VALUES (
        'document',
        COALESCE(NEW.id, OLD.id),
        v_change_type,
        CASE WHEN TG_OP IN ('DELETE','UPDATE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        'document ' || v_change_type,
        auth.uid(),
        COALESCE(NEW.id, OLD.id)
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Update the compliance entity trigger function with correct change_type mapping
CREATE OR REPLACE FUNCTION public.log_compliance_entity_change() 
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_entity_type TEXT;
    v_change_type TEXT;
BEGIN
    v_entity_type := CASE TG_TABLE_NAME
        WHEN 'compliance_rules' THEN 'rule'
        WHEN 'legal_provisions' THEN 'provision'
        ELSE TG_TABLE_NAME
    END;
    
    v_change_type := CASE TG_OP
        WHEN 'INSERT' THEN 'created'
        WHEN 'UPDATE' THEN 'updated'
        WHEN 'DELETE' THEN 'deactivated'
        ELSE LOWER(TG_OP)
    END;
    
    INSERT INTO public.compliance_change_log (
        entity_type, entity_id, change_type, 
        old_values, new_values, change_reason, 
        changed_by, source_document_id
    ) VALUES (
        v_entity_type,
        COALESCE(NEW.id, OLD.id),
        v_change_type,
        CASE WHEN TG_OP IN ('DELETE','UPDATE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        v_entity_type || ' ' || v_change_type,
        auth.uid(),
        CASE WHEN TG_OP = 'DELETE' THEN OLD.document_id ELSE NEW.document_id END
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;
-- Add PRISM impact analysis columns to legal_documents
ALTER TABLE public.legal_documents 
ADD COLUMN IF NOT EXISTS prism_impact_analysis jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS criticality text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS impact_reviewed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS impact_reviewed_at timestamptz DEFAULT NULL;

-- Add check constraint for criticality values (Tax-Specific categories)
ALTER TABLE public.legal_documents 
ADD CONSTRAINT legal_documents_criticality_check 
CHECK (criticality IS NULL OR criticality IN (
  'breaking_change',
  'rate_update', 
  'new_requirement',
  'procedural_update',
  'advisory'
));

-- Add index for filtering by criticality and review status
CREATE INDEX IF NOT EXISTS idx_legal_documents_criticality ON public.legal_documents(criticality);
CREATE INDEX IF NOT EXISTS idx_legal_documents_impact_reviewed ON public.legal_documents(impact_reviewed);

-- Add comment for documentation
COMMENT ON COLUMN public.legal_documents.prism_impact_analysis IS 'AI-generated analysis of how this document affects PRISM platform';
COMMENT ON COLUMN public.legal_documents.criticality IS 'Tax-specific criticality: breaking_change, rate_update, new_requirement, procedural_update, advisory';
COMMENT ON COLUMN public.legal_documents.impact_reviewed IS 'Whether admin has reviewed the impact analysis';
COMMENT ON COLUMN public.legal_documents.impact_reviewed_at IS 'Timestamp when impact analysis was reviewed';
-- Add tracking columns to education_articles
ALTER TABLE public.education_articles
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS last_edited_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS linked_provision_ids UUID[] DEFAULT '{}';

-- Add columns to tax_deadlines for admin management
ALTER TABLE public.tax_deadlines
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS notification_config JSONB DEFAULT '{"days_before": [7, 3, 1], "message_template": null}'::jsonb,
ADD COLUMN IF NOT EXISTS linked_provision_ids UUID[] DEFAULT '{}';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_education_articles_category ON public.education_articles(category);
CREATE INDEX IF NOT EXISTS idx_education_articles_published ON public.education_articles(is_published);
CREATE INDEX IF NOT EXISTS idx_tax_deadlines_active ON public.tax_deadlines(is_active);
CREATE INDEX IF NOT EXISTS idx_tax_deadlines_type ON public.tax_deadlines(deadline_type);

-- Full-text search function for education articles (for bot integration)
CREATE OR REPLACE FUNCTION public.search_education_articles(search_query TEXT, result_limit INT DEFAULT 5)
RETURNS TABLE (
    id UUID,
    title TEXT,
    description TEXT,
    content TEXT,
    category TEXT,
    slug TEXT,
    read_time TEXT,
    rank REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ea.id,
        ea.title,
        ea.description,
        ea.content,
        ea.category,
        ea.slug,
        ea.read_time,
        ts_rank(
            to_tsvector('english', COALESCE(ea.title, '') || ' ' || COALESCE(ea.description, '') || ' ' || COALESCE(ea.content, '')),
            plainto_tsquery('english', search_query)
        ) as rank
    FROM public.education_articles ea
    WHERE ea.is_published = true
      AND (
        to_tsvector('english', COALESCE(ea.title, '') || ' ' || COALESCE(ea.description, '') || ' ' || COALESCE(ea.content, ''))
        @@ plainto_tsquery('english', search_query)
        OR ea.title ILIKE '%' || search_query || '%'
        OR ea.category ILIKE '%' || search_query || '%'
      )
    ORDER BY rank DESC
    LIMIT result_limit;
END;
$$;

-- Function to get upcoming deadlines (for bot integration)
CREATE OR REPLACE FUNCTION public.get_upcoming_deadlines(days_ahead INT DEFAULT 30, deadline_limit INT DEFAULT 10)
RETURNS TABLE (
    id UUID,
    title TEXT,
    description TEXT,
    deadline_type TEXT,
    deadline_date DATE,
    recurrence TEXT,
    notification_config JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_date_val DATE := CURRENT_DATE;
    target_date DATE := CURRENT_DATE + (days_ahead || ' days')::INTERVAL;
BEGIN
    RETURN QUERY
    SELECT 
        td.id,
        td.title,
        td.description,
        td.deadline_type,
        CASE 
            WHEN td.recurrence = 'monthly' THEN
                CASE 
                    WHEN td.day_of_month >= EXTRACT(DAY FROM current_date_val)::INT THEN
                        (DATE_TRUNC('month', current_date_val) + ((td.day_of_month - 1) || ' days')::INTERVAL)::DATE
                    ELSE
                        (DATE_TRUNC('month', current_date_val) + '1 month'::INTERVAL + ((td.day_of_month - 1) || ' days')::INTERVAL)::DATE
                END
            WHEN td.recurrence = 'annual' THEN
                MAKE_DATE(
                    CASE 
                        WHEN MAKE_DATE(EXTRACT(YEAR FROM current_date_val)::INT, td.month_of_year, td.day_of_month) >= current_date_val
                        THEN EXTRACT(YEAR FROM current_date_val)::INT
                        ELSE EXTRACT(YEAR FROM current_date_val)::INT + 1
                    END,
                    td.month_of_year,
                    td.day_of_month
                )
            ELSE td.specific_date
        END as deadline_date,
        td.recurrence,
        td.notification_config
    FROM public.tax_deadlines td
    WHERE td.is_active = true
    ORDER BY deadline_date ASC
    LIMIT deadline_limit;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.search_education_articles TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_upcoming_deadlines TO authenticated, anon;
-- Fix tax_deadlines foreign key to allow rule deletion during reprocess
ALTER TABLE tax_deadlines 
DROP CONSTRAINT IF EXISTS tax_deadlines_source_rule_id_fkey;

ALTER TABLE tax_deadlines 
ADD CONSTRAINT tax_deadlines_source_rule_id_fkey 
FOREIGN KEY (source_rule_id) 
REFERENCES compliance_rules(id) 
ON DELETE SET NULL;

-- Fix compliance_change_log foreign key to allow document deletion
ALTER TABLE compliance_change_log 
DROP CONSTRAINT IF EXISTS compliance_change_log_source_document_id_fkey;

ALTER TABLE compliance_change_log 
ADD CONSTRAINT compliance_change_log_source_document_id_fkey 
FOREIGN KEY (source_document_id) 
REFERENCES legal_documents(id) 
ON DELETE SET NULL;
-- Fix the notify_profile_rule_changes function to use valid notification_type
CREATE OR REPLACE FUNCTION public.notify_profile_rule_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    affected_rule RECORD;
BEGIN
    -- When a compliance rule changes, log which profiles might need updates
    IF TG_OP = 'UPDATE' OR TG_OP = 'INSERT' THEN
        -- Check if this affects tax calculations (rate changes, threshold changes)
        IF NEW.rule_type IN ('tax_band', 'vat_rate', 'threshold', 'relief', 'emtl') THEN
            -- Insert notification for admins about potential profile recalculations
            -- Using 'rate_change' instead of 'rule_change' to match the check constraint
            INSERT INTO public.compliance_notifications (
                user_id,
                notification_type,
                title,
                message,
                severity,
                metadata
            )
            SELECT DISTINCT
                ur.user_id,
                'rate_change',
                'Tax Rule Updated: ' || NEW.rule_name,
                'A tax rule affecting your calculations has been updated. Your tax estimates may change.',
                CASE 
                    WHEN NEW.rule_type IN ('tax_band', 'vat_rate') THEN 'high'
                    ELSE 'medium'
                END,
                jsonb_build_object(
                    'rule_id', NEW.id,
                    'rule_type', NEW.rule_type,
                    'rule_name', NEW.rule_name
                )
            FROM public.user_roles ur
            WHERE ur.role = 'admin'
            LIMIT 5; -- Only notify first 5 admins
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;
-- Part 1: Soft Delete with 5-minute Undo grace period
-- Create deleted_items table for tracking soft-deleted critical items
CREATE TABLE public.deleted_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT NOT NULL CHECK (item_type IN ('user', 'legal_document', 'compliance_rule', 'tax_deadline', 'education_article')),
  item_id UUID NOT NULL,
  item_data JSONB NOT NULL,
  deleted_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  restored BOOLEAN DEFAULT false,
  restored_at TIMESTAMPTZ,
  restored_by UUID REFERENCES auth.users(id)
);

-- Index for cleanup queries (find expired items)
CREATE INDEX idx_deleted_items_expires ON public.deleted_items(expires_at) WHERE restored = false;

-- Index for user lookups
CREATE INDEX idx_deleted_items_type ON public.deleted_items(item_type, deleted_at DESC);

-- Index for item lookups
CREATE INDEX idx_deleted_items_item ON public.deleted_items(item_type, item_id);

-- Enable RLS
ALTER TABLE public.deleted_items ENABLE ROW LEVEL SECURITY;

-- Only admins can view and manage deleted items
CREATE POLICY "Admins can view deleted items"
  ON public.deleted_items FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert deleted items"
  ON public.deleted_items FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update deleted items"
  ON public.deleted_items FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete expired items"
  ON public.deleted_items FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Part 2: Test Mode - Extend system_settings
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS test_mode_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_mode_enabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS test_mode_enabled_by UUID REFERENCES auth.users(id);

-- Part 3: User Approval Status for Test Mode - Extend profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
-- Add gateway_enabled setting to system_settings
ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS gateway_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS gateway_enabled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS gateway_enabled_by UUID REFERENCES auth.users(id);

-- Update existing row to have gateway enabled by default
UPDATE public.system_settings SET gateway_enabled = true WHERE id IS NOT NULL;
-- Add processing_mode column to system_settings
ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS processing_mode text NOT NULL DEFAULT 'gateway'
CHECK (processing_mode IN ('gateway', 'edge_functions'));

-- Add comment for documentation
COMMENT ON COLUMN public.system_settings.processing_mode IS 'Controls bot message processing: gateway = Railway Gateway, edge_functions = Supabase Edge Functions';
-- Add missing columns to ml_models table for training configuration
ALTER TABLE public.ml_models 
ADD COLUMN IF NOT EXISTS model_config JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS training_metadata JSONB DEFAULT '{}'::jsonb;
-- Normalize existing ai_feedback categories to simplified taxonomy
-- This removes VAT suffixes from categories to align with the new two-layer approach

-- Update user_correction categories
UPDATE ai_feedback
SET user_correction = jsonb_set(
    user_correction,
    '{category}',
    to_jsonb(
        CASE 
            -- Remove VAT suffixes
            WHEN user_correction->>'category' LIKE '%_zero_rated' 
            THEN replace(user_correction->>'category', '_zero_rated', '')
            WHEN user_correction->>'category' LIKE '%_exempt' 
            THEN replace(user_correction->>'category', '_exempt', '')
            WHEN user_correction->>'category' LIKE '%_standard' 
            THEN replace(user_correction->>'category', '_standard', '')
            -- Normalize common variations
            WHEN user_correction->>'category' = 'professional_services' THEN 'services'
            WHEN user_correction->>'category' = 'labor_services' THEN 'labor'
            WHEN user_correction->>'category' = 'maintenance_services' THEN 'services'
            WHEN user_correction->>'category' = 'education_services' THEN 'education'
            WHEN user_correction->>'category' = 'security_services' THEN 'services'
            WHEN user_correction->>'category' = 'transport_fuel' THEN 'fuel'
            WHEN user_correction->>'category' = 'vehicle_maintenance' THEN 'transport'
            WHEN user_correction->>'category' = 'capital_equipment' THEN 'equipment'
            WHEN user_correction->>'category' = 'capital_improvement' THEN 'capital'
            WHEN user_correction->>'category' = 'baby_products_zero_rated' THEN 'food'
            WHEN user_correction->>'category' = 'agricultural_zero_rated' THEN 'agriculture'
            WHEN user_correction->>'category' = 'telecommunications' THEN 'utilities'
            WHEN user_correction->>'category' = 'office_supplies' THEN 'supplies'
            ELSE user_correction->>'category'
        END
    )
)
WHERE user_correction->>'category' IS NOT NULL
  AND (
    user_correction->>'category' LIKE '%_zero_rated'
    OR user_correction->>'category' LIKE '%_exempt'
    OR user_correction->>'category' LIKE '%_standard'
    OR user_correction->>'category' IN (
        'professional_services', 'labor_services', 'maintenance_services',
        'education_services', 'security_services', 'transport_fuel',
        'vehicle_maintenance', 'capital_equipment', 'capital_improvement',
        'baby_products_zero_rated', 'agricultural_zero_rated',
        'telecommunications', 'office_supplies'
    )
  );

-- Also update business_classification_patterns
UPDATE business_classification_patterns
SET category = 
    CASE 
        WHEN category LIKE '%_zero_rated' THEN replace(category, '_zero_rated', '')
        WHEN category LIKE '%_exempt' THEN replace(category, '_exempt', '')
        WHEN category LIKE '%_standard' THEN replace(category, '_standard', '')
        WHEN category = 'professional_services' THEN 'services'
        WHEN category = 'labor_services' THEN 'labor'
        WHEN category = 'maintenance_services' THEN 'services'
        WHEN category = 'education_services' THEN 'education'
        WHEN category = 'security_services' THEN 'services'
        WHEN category = 'transport_fuel' THEN 'fuel'
        WHEN category = 'vehicle_maintenance' THEN 'transport'
        WHEN category = 'capital_equipment' THEN 'equipment'
        WHEN category = 'capital_improvement' THEN 'capital'
        WHEN category = 'baby_products_zero_rated' THEN 'food'
        WHEN category = 'agricultural_zero_rated' THEN 'agriculture'
        WHEN category = 'telecommunications' THEN 'utilities'
        WHEN category = 'office_supplies' THEN 'supplies'
        ELSE category
    END
WHERE category LIKE '%_zero_rated'
   OR category LIKE '%_exempt'
   OR category LIKE '%_standard'
   OR category IN (
       'professional_services', 'labor_services', 'maintenance_services',
       'education_services', 'security_services', 'transport_fuel',
       'vehicle_maintenance', 'capital_equipment', 'capital_improvement',
       'baby_products_zero_rated', 'agricultural_zero_rated',
       'telecommunications', 'office_supplies'
   );
-- Chat messages table for conversation history
-- Used by Telegram/WhatsApp gateways to maintain context

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL DEFAULT 'telegram' CHECK (platform IN ('web', 'telegram', 'whatsapp')),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching recent messages per user
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_time 
ON chat_messages(user_id, created_at DESC);

-- Index for platform-specific queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_platform 
ON chat_messages(platform, created_at DESC);

-- Auto-cleanup old messages (keep last 30 days)
-- This can be run periodically via cron
COMMENT ON TABLE chat_messages IS 'Stores chat history for Telegram/WhatsApp conversation context. Auto-cleanup recommended after 30 days.';
-- Create chat_messages table for conversation history
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('web', 'telegram', 'whatsapp')),
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Users can view their own messages
CREATE POLICY "Users can view own messages" ON public.chat_messages
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own messages
CREATE POLICY "Users can insert own messages" ON public.chat_messages
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create indexes for efficient querying
CREATE INDEX idx_chat_messages_user_time ON public.chat_messages(user_id, created_at DESC);
CREATE INDEX idx_chat_messages_platform ON public.chat_messages(platform);
-- User preferences for AI memory (Clawd-inspired approach)
-- Stores durable facts about users, not full conversations

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    preferred_name TEXT,
    communication_style TEXT DEFAULT 'friendly' CHECK (communication_style IN ('formal', 'friendly', 'casual')),
    remembered_facts JSONB DEFAULT '[]'::jsonb,
    income_estimate NUMERIC,
    last_chat_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);

-- Trigger to update timestamp on changes
CREATE OR REPLACE FUNCTION update_user_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_preferences_updated
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_user_preferences_timestamp();

-- Comment for documentation
COMMENT ON TABLE user_preferences IS 'Stores durable user facts for AI personalization (Clawd-style memory)';
COMMENT ON COLUMN user_preferences.remembered_facts IS 'JSON array of extracted facts, e.g. ["has freelance income", "files quarterly"]';
-- Phase 4: Rules Engine Enhancements
-- Adds sector-specific rules, versioning for rollback, and conflict detection

-- 1. Add sector column for industry-specific rules
ALTER TABLE compliance_rules 
ADD COLUMN IF NOT EXISTS sector TEXT DEFAULT 'all';

-- Add check constraint for valid sectors (only if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'compliance_rules_sector_check'
    ) THEN
        ALTER TABLE compliance_rules 
        ADD CONSTRAINT compliance_rules_sector_check 
        CHECK (sector IN ('all', 'agriculture', 'petroleum', 'manufacturing', 'banking', 'telecom', 'technology', 'healthcare', 'education', 'construction', 'retail'));
    END IF;
END $$;

-- Index for sector queries
CREATE INDEX IF NOT EXISTS idx_compliance_rules_sector ON compliance_rules(sector);

-- 2. Rule versions table for rollback capability
CREATE TABLE IF NOT EXISTS rule_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1,
    parameters JSONB NOT NULL,
    actions JSONB,
    changed_by UUID REFERENCES users(id),
    change_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_current BOOLEAN DEFAULT TRUE,
    snapshot JSONB -- Full rule state at this version
);

-- Ensure only one current version per rule
CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_versions_current 
ON rule_versions(rule_id) WHERE is_current = TRUE;

-- Index for fast version lookups
CREATE INDEX IF NOT EXISTS idx_rule_versions_rule ON rule_versions(rule_id, version_number DESC);

-- 3. Function to detect conflicting rules
CREATE OR REPLACE FUNCTION check_rule_conflicts(
    p_rule_code TEXT,
    p_rule_type TEXT,
    p_effective_from DATE,
    p_effective_to DATE,
    p_sector TEXT DEFAULT 'all',
    p_exclude_id UUID DEFAULT NULL
) RETURNS TABLE(
    conflict_id UUID,
    conflict_code TEXT,
    conflict_type TEXT,
    overlap_start DATE,
    overlap_end DATE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cr.id,
        cr.rule_code,
        'date_overlap'::TEXT,
        GREATEST(p_effective_from, cr.effective_from::DATE) as overlap_start,
        LEAST(COALESCE(p_effective_to, '9999-12-31'::DATE), COALESCE(cr.effective_to::DATE, '9999-12-31'::DATE)) as overlap_end
    FROM compliance_rules cr
    WHERE cr.rule_type = p_rule_type
      AND cr.is_active = TRUE
      AND (cr.sector = p_sector OR cr.sector = 'all' OR p_sector = 'all')
      AND (p_exclude_id IS NULL OR cr.id != p_exclude_id)
      AND (
          -- Check date overlap
          (p_effective_from IS NULL OR cr.effective_to IS NULL OR p_effective_from <= cr.effective_to::DATE)
          AND (p_effective_to IS NULL OR cr.effective_from IS NULL OR p_effective_to >= cr.effective_from::DATE)
      )
      -- Exclude same rule code (updating existing rule)
      AND cr.rule_code != p_rule_code;
END;
$$ LANGUAGE plpgsql;

-- 4. Function to create a new version before updating
CREATE OR REPLACE FUNCTION create_rule_version() RETURNS TRIGGER AS $$
DECLARE
    v_version_number INTEGER;
BEGIN
    -- Only version on significant changes
    IF OLD.parameters IS DISTINCT FROM NEW.parameters 
       OR OLD.actions IS DISTINCT FROM NEW.actions 
       OR OLD.effective_from IS DISTINCT FROM NEW.effective_from
       OR OLD.effective_to IS DISTINCT FROM NEW.effective_to THEN
        
        -- Get next version number
        SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_number
        FROM rule_versions 
        WHERE rule_id = OLD.id;
        
        -- Mark old versions as not current
        UPDATE rule_versions SET is_current = FALSE WHERE rule_id = OLD.id;
        
        -- Insert new version with snapshot
        INSERT INTO rule_versions (
            rule_id, 
            version_number, 
            parameters, 
            actions,
            changed_by,
            change_reason,
            is_current,
            snapshot
        ) VALUES (
            OLD.id,
            v_version_number,
            NEW.parameters,
            NEW.actions,
            auth.uid(),
            'Rule updated',
            TRUE,
            jsonb_build_object(
                'rule_code', NEW.rule_code,
                'rule_name', NEW.rule_name,
                'rule_type', NEW.rule_type,
                'parameters', NEW.parameters,
                'actions', NEW.actions,
                'effective_from', NEW.effective_from,
                'effective_to', NEW.effective_to,
                'sector', NEW.sector,
                'priority', NEW.priority
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for versioning
DROP TRIGGER IF EXISTS trg_version_rule ON compliance_rules;
CREATE TRIGGER trg_version_rule
    BEFORE UPDATE ON compliance_rules
    FOR EACH ROW
    EXECUTE FUNCTION create_rule_version();

-- 5. Function to rollback to a previous version
CREATE OR REPLACE FUNCTION rollback_rule_to_version(
    p_rule_id UUID,
    p_version_number INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_snapshot JSONB;
BEGIN
    -- Get the snapshot from the target version
    SELECT snapshot INTO v_snapshot
    FROM rule_versions
    WHERE rule_id = p_rule_id AND version_number = p_version_number;
    
    IF v_snapshot IS NULL THEN
        RAISE EXCEPTION 'Version % not found for rule %', p_version_number, p_rule_id;
    END IF;
    
    -- Update the rule with the snapshot data
    UPDATE compliance_rules SET
        parameters = v_snapshot->'parameters',
        actions = v_snapshot->'actions',
        effective_from = (v_snapshot->>'effective_from')::TIMESTAMPTZ,
        effective_to = (v_snapshot->>'effective_to')::TIMESTAMPTZ,
        sector = v_snapshot->>'sector',
        priority = (v_snapshot->>'priority')::INTEGER
    WHERE id = p_rule_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RLS policies for rule_versions (using account_type instead of role)
ALTER TABLE rule_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rule_versions_select_policy ON rule_versions;
CREATE POLICY rule_versions_select_policy ON rule_versions
    FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS rule_versions_insert_policy ON rule_versions;
CREATE POLICY rule_versions_insert_policy ON rule_versions
    FOR INSERT WITH CHECK (TRUE);

-- Grant access
GRANT SELECT ON rule_versions TO authenticated;
GRANT INSERT ON rule_versions TO authenticated;

COMMENT ON TABLE rule_versions IS 'Tracks all versions of compliance rules for audit and rollback';
COMMENT ON FUNCTION check_rule_conflicts IS 'Detects conflicting rules based on date overlap and sector';
COMMENT ON FUNCTION rollback_rule_to_version IS 'Rolls back a rule to a specific version number';
-- Phase 4: Rules Engine Enhancements
-- Adds sector-specific rules, versioning for rollback, and conflict detection

-- 1. Add sector column for industry-specific rules
ALTER TABLE compliance_rules 
ADD COLUMN IF NOT EXISTS sector TEXT DEFAULT 'all';

-- Add check constraint for valid sectors
ALTER TABLE compliance_rules 
ADD CONSTRAINT compliance_rules_sector_check 
CHECK (sector IN ('all', 'agriculture', 'petroleum', 'manufacturing', 'banking', 'telecom', 'technology', 'healthcare', 'education', 'construction', 'retail'));

-- Index for sector queries
CREATE INDEX IF NOT EXISTS idx_compliance_rules_sector ON compliance_rules(sector);

-- 2. Rule versions table for rollback capability
CREATE TABLE IF NOT EXISTS rule_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1,
    parameters JSONB NOT NULL,
    actions JSONB,
    changed_by UUID REFERENCES users(id),
    change_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_current BOOLEAN DEFAULT TRUE,
    snapshot JSONB -- Full rule state at this version
);

-- Ensure only one current version per rule
CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_versions_current 
ON rule_versions(rule_id) WHERE is_current = TRUE;

-- Index for fast version lookups
CREATE INDEX IF NOT EXISTS idx_rule_versions_rule ON rule_versions(rule_id, version_number DESC);

-- 3. Function to detect conflicting rules
CREATE OR REPLACE FUNCTION check_rule_conflicts(
    p_rule_code TEXT,
    p_rule_type TEXT,
    p_effective_from DATE,
    p_effective_to DATE,
    p_sector TEXT DEFAULT 'all',
    p_exclude_id UUID DEFAULT NULL
) RETURNS TABLE(
    conflict_id UUID,
    conflict_code TEXT,
    conflict_type TEXT,
    overlap_start DATE,
    overlap_end DATE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cr.id,
        cr.rule_code,
        'date_overlap'::TEXT,
        GREATEST(p_effective_from, cr.effective_from::DATE) as overlap_start,
        LEAST(COALESCE(p_effective_to, '9999-12-31'::DATE), COALESCE(cr.effective_to::DATE, '9999-12-31'::DATE)) as overlap_end
    FROM compliance_rules cr
    WHERE cr.rule_type = p_rule_type
      AND cr.is_active = TRUE
      AND (cr.sector = p_sector OR cr.sector = 'all' OR p_sector = 'all')
      AND (p_exclude_id IS NULL OR cr.id != p_exclude_id)
      AND (
          -- Check date overlap
          (p_effective_from IS NULL OR cr.effective_to IS NULL OR p_effective_from <= cr.effective_to::DATE)
          AND (p_effective_to IS NULL OR cr.effective_from IS NULL OR p_effective_to >= cr.effective_from::DATE)
      )
      -- Exclude same rule code (updating existing rule)
      AND cr.rule_code != p_rule_code;
END;
$$ LANGUAGE plpgsql;

-- 4. Function to create a new version before updating
CREATE OR REPLACE FUNCTION create_rule_version() RETURNS TRIGGER AS $$
DECLARE
    v_version_number INTEGER;
BEGIN
    -- Only version on significant changes
    IF OLD.parameters IS DISTINCT FROM NEW.parameters 
       OR OLD.actions IS DISTINCT FROM NEW.actions 
       OR OLD.effective_from IS DISTINCT FROM NEW.effective_from
       OR OLD.effective_to IS DISTINCT FROM NEW.effective_to THEN
        
        -- Get next version number
        SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_number
        FROM rule_versions 
        WHERE rule_id = OLD.id;
        
        -- Mark old versions as not current
        UPDATE rule_versions SET is_current = FALSE WHERE rule_id = OLD.id;
        
        -- Insert new version with snapshot
        INSERT INTO rule_versions (
            rule_id, 
            version_number, 
            parameters, 
            actions,
            changed_by,
            change_reason,
            is_current,
            snapshot
        ) VALUES (
            OLD.id,
            v_version_number,
            NEW.parameters,
            NEW.actions,
            auth.uid(),
            'Rule updated',
            TRUE,
            jsonb_build_object(
                'rule_code', NEW.rule_code,
                'rule_name', NEW.rule_name,
                'rule_type', NEW.rule_type,
                'parameters', NEW.parameters,
                'actions', NEW.actions,
                'effective_from', NEW.effective_from,
                'effective_to', NEW.effective_to,
                'sector', NEW.sector,
                'priority', NEW.priority
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for versioning
DROP TRIGGER IF EXISTS trg_version_rule ON compliance_rules;
CREATE TRIGGER trg_version_rule
    BEFORE UPDATE ON compliance_rules
    FOR EACH ROW
    EXECUTE FUNCTION create_rule_version();

-- 5. Function to rollback to a previous version
CREATE OR REPLACE FUNCTION rollback_rule_to_version(
    p_rule_id UUID,
    p_version_number INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_snapshot JSONB;
BEGIN
    -- Get the snapshot from the target version
    SELECT snapshot INTO v_snapshot
    FROM rule_versions
    WHERE rule_id = p_rule_id AND version_number = p_version_number;
    
    IF v_snapshot IS NULL THEN
        RAISE EXCEPTION 'Version % not found for rule %', p_version_number, p_rule_id;
    END IF;
    
    -- Update the rule with the snapshot data
    UPDATE compliance_rules SET
        parameters = v_snapshot->'parameters',
        actions = v_snapshot->'actions',
        effective_from = (v_snapshot->>'effective_from')::TIMESTAMPTZ,
        effective_to = (v_snapshot->>'effective_to')::TIMESTAMPTZ,
        sector = v_snapshot->>'sector',
        priority = (v_snapshot->>'priority')::INTEGER
    WHERE id = p_rule_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RLS policies for rule_versions
ALTER TABLE rule_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY rule_versions_select_policy ON rule_versions
    FOR SELECT USING (TRUE);

CREATE POLICY rule_versions_insert_policy ON rule_versions
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    );

-- Grant access
GRANT SELECT ON rule_versions TO authenticated;
GRANT INSERT ON rule_versions TO authenticated;

COMMENT ON TABLE rule_versions IS 'Tracks all versions of compliance rules for audit and rollback';
COMMENT ON FUNCTION check_rule_conflicts IS 'Detects conflicting rules based on date overlap and sector';
COMMENT ON FUNCTION rollback_rule_to_version IS 'Rolls back a rule to a specific version number';
-- PRISM API Infrastructure
-- API keys, rate limiting, and usage tracking

-- 1. API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_prefix TEXT NOT NULL, -- First 8 chars for display (pk_live_xxx)
    key_hash TEXT NOT NULL, -- Hashed full key
    name TEXT DEFAULT 'Default Key',
    tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'starter', 'business', 'enterprise')),
    environment TEXT NOT NULL DEFAULT 'test' CHECK (environment IN ('test', 'live')),
    
    -- Rate limits (overrides defaults if set)
    rate_limit_per_min INTEGER,
    rate_limit_per_day INTEGER,
    
    -- Permissions
    can_access_documents BOOLEAN DEFAULT FALSE,
    can_access_ocr BOOLEAN DEFAULT FALSE,
    can_use_webhooks BOOLEAN DEFAULT FALSE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    UNIQUE(key_hash)
);

-- 2. API Usage tracking
CREATE TABLE IF NOT EXISTS api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Rate limit tracking (sliding window)
CREATE TABLE IF NOT EXISTS api_rate_limits (
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    window_start TIMESTAMPTZ NOT NULL,
    window_type TEXT NOT NULL CHECK (window_type IN ('minute', 'day')),
    request_count INTEGER DEFAULT 1,
    PRIMARY KEY (api_key_id, window_start, window_type)
);

-- 4. Webhook registrations
CREATE TABLE IF NOT EXISTS api_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    events TEXT[] NOT NULL DEFAULT '{}',
    secret TEXT NOT NULL, -- For HMAC signing
    is_active BOOLEAN DEFAULT TRUE,
    last_triggered_at TIMESTAMPTZ,
    failure_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_usage_key ON api_usage(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_endpoint ON api_usage(endpoint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window ON api_rate_limits(api_key_id, window_start);

-- 5. Function to check rate limit
CREATE OR REPLACE FUNCTION check_api_rate_limit(
    p_key_id UUID,
    p_tier TEXT
) RETURNS TABLE(
    allowed BOOLEAN,
    minute_remaining INTEGER,
    day_remaining INTEGER,
    retry_after_seconds INTEGER
) AS $$
DECLARE
    v_minute_limit INTEGER;
    v_day_limit INTEGER;
    v_minute_count INTEGER;
    v_day_count INTEGER;
    v_minute_start TIMESTAMPTZ;
    v_day_start TIMESTAMPTZ;
BEGIN
    -- Set limits based on tier
    CASE p_tier
        WHEN 'free' THEN v_minute_limit := 10; v_day_limit := 100;
        WHEN 'starter' THEN v_minute_limit := 60; v_day_limit := 5000;
        WHEN 'business' THEN v_minute_limit := 300; v_day_limit := 50000;
        WHEN 'enterprise' THEN v_minute_limit := 999999; v_day_limit := 999999;
        ELSE v_minute_limit := 10; v_day_limit := 100;
    END CASE;
    
    v_minute_start := date_trunc('minute', NOW());
    v_day_start := date_trunc('day', NOW());
    
    -- Get current counts
    SELECT COALESCE(SUM(request_count), 0) INTO v_minute_count
    FROM api_rate_limits
    WHERE api_key_id = p_key_id 
      AND window_type = 'minute'
      AND window_start >= v_minute_start;
    
    SELECT COALESCE(SUM(request_count), 0) INTO v_day_count
    FROM api_rate_limits
    WHERE api_key_id = p_key_id 
      AND window_type = 'day'
      AND window_start >= v_day_start;
    
    -- Check limits
    IF v_minute_count >= v_minute_limit THEN
        RETURN QUERY SELECT 
            FALSE, 
            0, 
            v_day_limit - v_day_count,
            EXTRACT(EPOCH FROM (v_minute_start + INTERVAL '1 minute' - NOW()))::INTEGER;
        RETURN;
    END IF;
    
    IF v_day_count >= v_day_limit THEN
        RETURN QUERY SELECT 
            FALSE, 
            v_minute_limit - v_minute_count,
            0,
            EXTRACT(EPOCH FROM (v_day_start + INTERVAL '1 day' - NOW()))::INTEGER;
        RETURN;
    END IF;
    
    -- Increment counters
    INSERT INTO api_rate_limits (api_key_id, window_start, window_type, request_count)
    VALUES (p_key_id, v_minute_start, 'minute', 1)
    ON CONFLICT (api_key_id, window_start, window_type)
    DO UPDATE SET request_count = api_rate_limits.request_count + 1;
    
    INSERT INTO api_rate_limits (api_key_id, window_start, window_type, request_count)
    VALUES (p_key_id, v_day_start, 'day', 1)
    ON CONFLICT (api_key_id, window_start, window_type)
    DO UPDATE SET request_count = api_rate_limits.request_count + 1;
    
    RETURN QUERY SELECT 
        TRUE, 
        v_minute_limit - v_minute_count - 1,
        v_day_limit - v_day_count - 1,
        0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Cleanup old rate limit windows (run daily)
CREATE OR REPLACE FUNCTION cleanup_api_rate_limits() RETURNS void AS $$
BEGIN
    DELETE FROM api_rate_limits WHERE window_start < NOW() - INTERVAL '2 days';
    DELETE FROM api_usage WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. Set tier permissions function
CREATE OR REPLACE FUNCTION set_api_key_permissions() RETURNS TRIGGER AS $$
BEGIN
    CASE NEW.tier
        WHEN 'free' THEN
            NEW.can_access_documents := FALSE;
            NEW.can_access_ocr := FALSE;
            NEW.can_use_webhooks := FALSE;
        WHEN 'starter' THEN
            NEW.can_access_documents := FALSE;
            NEW.can_access_ocr := FALSE;
            NEW.can_use_webhooks := TRUE;
        WHEN 'business' THEN
            NEW.can_access_documents := TRUE;
            NEW.can_access_ocr := TRUE;
            NEW.can_use_webhooks := TRUE;
        WHEN 'enterprise' THEN
            NEW.can_access_documents := TRUE;
            NEW.can_access_ocr := TRUE;
            NEW.can_use_webhooks := TRUE;
    END CASE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop trigger if exists then recreate
DROP TRIGGER IF EXISTS trg_set_api_key_permissions ON api_keys;
CREATE TRIGGER trg_set_api_key_permissions
    BEFORE INSERT OR UPDATE OF tier ON api_keys
    FOR EACH ROW
    EXECUTE FUNCTION set_api_key_permissions();

-- RLS policies
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS api_keys_owner ON api_keys;
DROP POLICY IF EXISTS api_usage_owner ON api_usage;
DROP POLICY IF EXISTS api_webhooks_owner ON api_webhooks;
DROP POLICY IF EXISTS api_rate_limits_service ON api_rate_limits;

CREATE POLICY api_keys_owner ON api_keys
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY api_usage_owner ON api_usage
    FOR SELECT USING (
        api_key_id IN (SELECT id FROM api_keys WHERE user_id = auth.uid())
    );

CREATE POLICY api_webhooks_owner ON api_webhooks
    FOR ALL USING (
        api_key_id IN (SELECT id FROM api_keys WHERE user_id = auth.uid())
    );

-- Rate limits need service role access
CREATE POLICY api_rate_limits_service ON api_rate_limits
    FOR ALL USING (true);

-- Grant access
GRANT ALL ON api_keys TO authenticated;
GRANT ALL ON api_usage TO authenticated;
GRANT ALL ON api_webhooks TO authenticated;
GRANT ALL ON api_rate_limits TO authenticated;

COMMENT ON TABLE api_keys IS 'PRISM API access keys with tier-based permissions';
COMMENT ON TABLE api_usage IS 'API request logging for analytics';
COMMENT ON TABLE api_rate_limits IS 'Sliding window rate limit tracking';
-- PRISM API Infrastructure
-- API keys, rate limiting, and usage tracking

-- 1. API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_prefix TEXT NOT NULL, -- First 8 chars for display (pk_live_xxx)
    key_hash TEXT NOT NULL, -- Hashed full key
    name TEXT DEFAULT 'Default Key',
    tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'starter', 'business', 'enterprise')),
    environment TEXT NOT NULL DEFAULT 'test' CHECK (environment IN ('test', 'live')),
    
    -- Rate limits (overrides defaults if set)
    rate_limit_per_min INTEGER,
    rate_limit_per_day INTEGER,
    
    -- Permissions
    can_access_documents BOOLEAN DEFAULT FALSE,
    can_access_ocr BOOLEAN DEFAULT FALSE,
    can_use_webhooks BOOLEAN DEFAULT FALSE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    UNIQUE(key_hash)
);

-- 2. API Usage tracking
CREATE TABLE IF NOT EXISTS api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Rate limit tracking (sliding window)
CREATE TABLE IF NOT EXISTS api_rate_limits (
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    window_start TIMESTAMPTZ NOT NULL,
    window_type TEXT NOT NULL CHECK (window_type IN ('minute', 'day')),
    request_count INTEGER DEFAULT 1,
    PRIMARY KEY (api_key_id, window_start, window_type)
);

-- 4. Webhook registrations
CREATE TABLE IF NOT EXISTS api_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    events TEXT[] NOT NULL DEFAULT '{}',
    secret TEXT NOT NULL, -- For HMAC signing
    is_active BOOLEAN DEFAULT TRUE,
    last_triggered_at TIMESTAMPTZ,
    failure_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_usage_key ON api_usage(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_endpoint ON api_usage(endpoint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window ON api_rate_limits(api_key_id, window_start);

-- 5. Function to check rate limit
CREATE OR REPLACE FUNCTION check_api_rate_limit(
    p_key_id UUID,
    p_tier TEXT
) RETURNS TABLE(
    allowed BOOLEAN,
    minute_remaining INTEGER,
    day_remaining INTEGER,
    retry_after_seconds INTEGER
) AS $$
DECLARE
    v_minute_limit INTEGER;
    v_day_limit INTEGER;
    v_minute_count INTEGER;
    v_day_count INTEGER;
    v_minute_start TIMESTAMPTZ;
    v_day_start TIMESTAMPTZ;
BEGIN
    -- Set limits based on tier
    CASE p_tier
        WHEN 'free' THEN v_minute_limit := 10; v_day_limit := 100;
        WHEN 'starter' THEN v_minute_limit := 60; v_day_limit := 5000;
        WHEN 'business' THEN v_minute_limit := 300; v_day_limit := 50000;
        WHEN 'enterprise' THEN v_minute_limit := 999999; v_day_limit := 999999;
        ELSE v_minute_limit := 10; v_day_limit := 100;
    END CASE;
    
    v_minute_start := date_trunc('minute', NOW());
    v_day_start := date_trunc('day', NOW());
    
    -- Get current counts
    SELECT COALESCE(SUM(request_count), 0) INTO v_minute_count
    FROM api_rate_limits
    WHERE api_key_id = p_key_id 
      AND window_type = 'minute'
      AND window_start >= v_minute_start;
    
    SELECT COALESCE(SUM(request_count), 0) INTO v_day_count
    FROM api_rate_limits
    WHERE api_key_id = p_key_id 
      AND window_type = 'day'
      AND window_start >= v_day_start;
    
    -- Check limits
    IF v_minute_count >= v_minute_limit THEN
        RETURN QUERY SELECT 
            FALSE, 
            0, 
            v_day_limit - v_day_count,
            EXTRACT(EPOCH FROM (v_minute_start + INTERVAL '1 minute' - NOW()))::INTEGER;
        RETURN;
    END IF;
    
    IF v_day_count >= v_day_limit THEN
        RETURN QUERY SELECT 
            FALSE, 
            v_minute_limit - v_minute_count,
            0,
            EXTRACT(EPOCH FROM (v_day_start + INTERVAL '1 day' - NOW()))::INTEGER;
        RETURN;
    END IF;
    
    -- Increment counters
    INSERT INTO api_rate_limits (api_key_id, window_start, window_type, request_count)
    VALUES (p_key_id, v_minute_start, 'minute', 1)
    ON CONFLICT (api_key_id, window_start, window_type)
    DO UPDATE SET request_count = api_rate_limits.request_count + 1;
    
    INSERT INTO api_rate_limits (api_key_id, window_start, window_type, request_count)
    VALUES (p_key_id, v_day_start, 'day', 1)
    ON CONFLICT (api_key_id, window_start, window_type)
    DO UPDATE SET request_count = api_rate_limits.request_count + 1;
    
    RETURN QUERY SELECT 
        TRUE, 
        v_minute_limit - v_minute_count - 1,
        v_day_limit - v_day_count - 1,
        0;
END;
$$ LANGUAGE plpgsql;

-- 6. Cleanup old rate limit windows (run daily)
CREATE OR REPLACE FUNCTION cleanup_api_rate_limits() RETURNS void AS $$
BEGIN
    DELETE FROM api_rate_limits WHERE window_start < NOW() - INTERVAL '2 days';
    DELETE FROM api_usage WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- 7. Set tier permissions function
CREATE OR REPLACE FUNCTION set_api_key_permissions() RETURNS TRIGGER AS $$
BEGIN
    CASE NEW.tier
        WHEN 'free' THEN
            NEW.can_access_documents := FALSE;
            NEW.can_access_ocr := FALSE;
            NEW.can_use_webhooks := FALSE;
        WHEN 'starter' THEN
            NEW.can_access_documents := FALSE;
            NEW.can_access_ocr := FALSE;
            NEW.can_use_webhooks := TRUE;
        WHEN 'business' THEN
            NEW.can_access_documents := TRUE;
            NEW.can_access_ocr := TRUE;
            NEW.can_use_webhooks := TRUE;
        WHEN 'enterprise' THEN
            NEW.can_access_documents := TRUE;
            NEW.can_access_ocr := TRUE;
            NEW.can_use_webhooks := TRUE;
    END CASE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_api_key_permissions
    BEFORE INSERT OR UPDATE OF tier ON api_keys
    FOR EACH ROW
    EXECUTE FUNCTION set_api_key_permissions();

-- RLS policies
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY api_keys_owner ON api_keys
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY api_usage_owner ON api_usage
    FOR SELECT USING (
        api_key_id IN (SELECT id FROM api_keys WHERE user_id = auth.uid())
    );

CREATE POLICY api_webhooks_owner ON api_webhooks
    FOR ALL USING (
        api_key_id IN (SELECT id FROM api_keys WHERE user_id = auth.uid())
    );

-- Grant access
GRANT ALL ON api_keys TO authenticated;
GRANT ALL ON api_usage TO authenticated;
GRANT ALL ON api_webhooks TO authenticated;
GRANT ALL ON api_rate_limits TO authenticated;

COMMENT ON TABLE api_keys IS 'PRISM API access keys with tier-based permissions';
COMMENT ON TABLE api_usage IS 'API request logging for analytics';
COMMENT ON TABLE api_rate_limits IS 'Sliding window rate limit tracking';
-- Document Processing Jobs - Add API-related columns
-- Uses existing processing_status column instead of status

-- Add api_key_id column if needed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'document_processing_jobs' AND column_name = 'api_key_id'
    ) THEN
        ALTER TABLE document_processing_jobs 
        ADD COLUMN api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'document_processing_jobs' AND column_name = 'webhook_url'
    ) THEN
        ALTER TABLE document_processing_jobs 
        ADD COLUMN webhook_url TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'document_processing_jobs' AND column_name = 'webhook_sent'
    ) THEN
        ALTER TABLE document_processing_jobs 
        ADD COLUMN webhook_sent BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Index for API key lookups
CREATE INDEX IF NOT EXISTS idx_doc_jobs_api_key ON document_processing_jobs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_doc_jobs_processing_status ON document_processing_jobs(processing_status) WHERE processing_status = 'pending';

-- Function to get API usage stats
CREATE OR REPLACE FUNCTION get_api_usage_stats(p_key_id UUID)
RETURNS TABLE(
    date DATE,
    request_count BIGINT,
    avg_response_ms NUMERIC,
    error_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        DATE(au.created_at) as date,
        COUNT(*) as request_count,
        AVG(au.response_time_ms)::NUMERIC as avg_response_ms,
        COUNT(*) FILTER (WHERE au.status_code >= 400) as error_count
    FROM api_usage au
    WHERE au.api_key_id = p_key_id
      AND au.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(au.created_at)
    ORDER BY date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing policy if exists then recreate
DROP POLICY IF EXISTS doc_jobs_owner ON document_processing_jobs;

CREATE POLICY doc_jobs_owner ON document_processing_jobs
    FOR ALL USING (
        user_id = auth.uid() OR
        api_key_id IN (SELECT id FROM api_keys WHERE user_id = auth.uid())
    );
-- Document Processing Jobs table for API
-- Tracks document upload and OCR processing status

-- Add api_key_id column to existing table if needed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'document_processing_jobs' AND column_name = 'api_key_id'
    ) THEN
        ALTER TABLE document_processing_jobs 
        ADD COLUMN api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'document_processing_jobs' AND column_name = 'webhook_url'
    ) THEN
        ALTER TABLE document_processing_jobs 
        ADD COLUMN webhook_url TEXT;
    END IF;
END $$;

-- If table doesn't exist, create it
CREATE TABLE IF NOT EXISTS document_processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    file_url TEXT NOT NULL,
    file_type TEXT,
    document_type TEXT DEFAULT 'auto',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    result JSONB,
    error TEXT,
    webhook_url TEXT,
    webhook_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Index for API key lookups
CREATE INDEX IF NOT EXISTS idx_doc_jobs_api_key ON document_processing_jobs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_doc_jobs_status ON document_processing_jobs(status) WHERE status = 'pending';

-- Function to get API usage stats
CREATE OR REPLACE FUNCTION get_api_usage_stats(p_key_id UUID)
RETURNS TABLE(
    date DATE,
    request_count BIGINT,
    avg_response_ms NUMERIC,
    error_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        DATE(created_at) as date,
        COUNT(*) as request_count,
        AVG(response_time_ms)::NUMERIC as avg_response_ms,
        COUNT(*) FILTER (WHERE status_code >= 400) as error_count
    FROM api_usage
    WHERE api_key_id = p_key_id
      AND created_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(created_at)
    ORDER BY date DESC;
END;
$$ LANGUAGE plpgsql;

-- RLS policy for document_processing_jobs
ALTER TABLE document_processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_jobs_owner ON document_processing_jobs
    FOR ALL USING (
        user_id = auth.uid() OR
        api_key_id IN (SELECT id FROM api_keys WHERE user_id = auth.uid())
    );

GRANT ALL ON document_processing_jobs TO authenticated;
-- Phase 1: API Billing Database Schema

-- API Subscriptions table - Track API tier subscriptions separately from user subscriptions
CREATE TABLE public.api_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'starter', 'business', 'enterprise')),
  paystack_subscription_code TEXT,
  paystack_customer_code TEXT,
  paystack_plan_code TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing', 'inactive')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id) -- One active subscription per user
);

-- API Payments table - Payment history for API access
CREATE TABLE public.api_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  api_subscription_id UUID REFERENCES public.api_subscriptions(id) ON DELETE SET NULL,
  paystack_reference TEXT UNIQUE NOT NULL,
  amount_kobo INTEGER NOT NULL,
  currency TEXT DEFAULT 'NGN',
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'pending', 'refunded')),
  tier TEXT NOT NULL,
  payment_method TEXT,
  metadata JSONB DEFAULT '{}',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add Paystack customer code to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT;

-- Create indexes for performance
CREATE INDEX idx_api_subscriptions_user_id ON public.api_subscriptions(user_id);
CREATE INDEX idx_api_subscriptions_status ON public.api_subscriptions(status);
CREATE INDEX idx_api_subscriptions_paystack_code ON public.api_subscriptions(paystack_subscription_code);
CREATE INDEX idx_api_payments_user_id ON public.api_payments(user_id);
CREATE INDEX idx_api_payments_subscription_id ON public.api_payments(api_subscription_id);
CREATE INDEX idx_api_payments_created_at ON public.api_payments(created_at DESC);

-- Trigger to update updated_at on api_subscriptions
CREATE TRIGGER update_api_subscriptions_updated_at
  BEFORE UPDATE ON public.api_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.api_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for api_subscriptions
CREATE POLICY "Users can view their own API subscription"
  ON public.api_subscriptions FOR SELECT
  USING (user_id IN (
    SELECT u.id FROM public.users u WHERE u.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  ));

CREATE POLICY "Users can insert their own API subscription"
  ON public.api_subscriptions FOR INSERT
  WITH CHECK (user_id IN (
    SELECT u.id FROM public.users u WHERE u.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  ));

CREATE POLICY "Users can update their own API subscription"
  ON public.api_subscriptions FOR UPDATE
  USING (user_id IN (
    SELECT u.id FROM public.users u WHERE u.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  ));

-- Service role can manage all subscriptions (for webhooks)
CREATE POLICY "Service role can manage all API subscriptions"
  ON public.api_subscriptions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policies for api_payments
CREATE POLICY "Users can view their own API payments"
  ON public.api_payments FOR SELECT
  USING (user_id IN (
    SELECT u.id FROM public.users u WHERE u.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  ));

-- Service role can manage all payments (for webhooks)
CREATE POLICY "Service role can manage all API payments"
  ON public.api_payments FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to sync API key tier with subscription tier
CREATE OR REPLACE FUNCTION public.sync_api_key_tier_with_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When subscription tier changes, update all active API keys for this user
  IF NEW.tier IS DISTINCT FROM OLD.tier AND NEW.status = 'active' THEN
    UPDATE public.api_keys
    SET tier = NEW.tier
    WHERE user_id = NEW.user_id AND is_active = true;
  END IF;
  
  -- If subscription becomes inactive, downgrade keys to free
  IF NEW.status IN ('cancelled', 'inactive', 'past_due') AND OLD.status = 'active' THEN
    UPDATE public.api_keys
    SET tier = 'free'
    WHERE user_id = NEW.user_id AND is_active = true;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to sync API key tiers
CREATE TRIGGER sync_api_key_tier_on_subscription_change
  AFTER UPDATE ON public.api_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_api_key_tier_with_subscription();
-- Phase 5-6: Tier enforcement and billing automation

-- Trigger to sync API key tier with subscription changes
CREATE OR REPLACE FUNCTION public.sync_api_key_tier_with_subscription()
RETURNS TRIGGER AS $$
BEGIN
  -- When subscription tier changes, update all active API keys for this user
  IF NEW.tier IS DISTINCT FROM OLD.tier AND NEW.status = 'active' THEN
    UPDATE public.api_keys
    SET tier = NEW.tier
    WHERE user_id = NEW.user_id AND is_active = true;
  END IF;
  
  -- If subscription becomes inactive, downgrade keys to free
  IF NEW.status IN ('cancelled', 'inactive', 'past_due') AND OLD.status = 'active' THEN
    UPDATE public.api_keys
    SET tier = 'free'
    WHERE user_id = NEW.user_id AND is_active = true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the trigger
DROP TRIGGER IF EXISTS sync_api_keys_on_subscription_change ON public.api_subscriptions;
CREATE TRIGGER sync_api_keys_on_subscription_change
  AFTER UPDATE ON public.api_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION sync_api_key_tier_with_subscription();

-- Function to check and downgrade expired subscriptions (for scheduled task)
CREATE OR REPLACE FUNCTION public.downgrade_expired_subscriptions()
RETURNS INTEGER AS $$
DECLARE
  downgraded_count INTEGER;
BEGIN
  -- Find subscriptions past grace period (3 days after period end)
  WITH expired AS (
    UPDATE public.api_subscriptions
    SET 
      status = 'inactive',
      tier = 'free',
      updated_at = NOW()
    WHERE status = 'active'
      AND current_period_end IS NOT NULL
      AND current_period_end < NOW() - INTERVAL '3 days'
    RETURNING user_id
  )
  SELECT COUNT(*) INTO downgraded_count FROM expired;
  
  -- Downgrade associated API keys
  UPDATE public.api_keys
  SET tier = 'free'
  WHERE user_id IN (
    SELECT user_id FROM public.api_subscriptions 
    WHERE status = 'inactive'
  ) AND is_active = true AND tier != 'free';
  
  RETURN downgraded_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to get usage stats for a user's API keys
CREATE OR REPLACE FUNCTION public.get_user_api_usage_summary(p_user_id UUID)
RETURNS TABLE(
  total_requests_today BIGINT,
  total_requests_month BIGINT,
  tier TEXT,
  daily_limit INTEGER,
  monthly_limit INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(CASE WHEN au.created_at >= DATE_TRUNC('day', NOW()) THEN 1 ELSE 0 END), 0)::BIGINT as total_requests_today,
    COALESCE(SUM(CASE WHEN au.created_at >= DATE_TRUNC('month', NOW()) THEN 1 ELSE 0 END), 0)::BIGINT as total_requests_month,
    COALESCE(aks.tier, 'free') as tier,
    CASE COALESCE(aks.tier, 'free')
      WHEN 'free' THEN 100
      WHEN 'starter' THEN 5000
      WHEN 'business' THEN 50000
      WHEN 'enterprise' THEN 999999
      ELSE 100
    END as daily_limit,
    CASE COALESCE(aks.tier, 'free')
      WHEN 'free' THEN 3000
      WHEN 'starter' THEN 150000
      WHEN 'business' THEN 1500000
      WHEN 'enterprise' THEN 999999999
      ELSE 3000
    END as monthly_limit
  FROM public.api_keys ak
  LEFT JOIN public.api_usage au ON ak.id = au.api_key_id
  LEFT JOIN public.api_subscriptions aks ON ak.user_id = aks.user_id
  WHERE ak.user_id = p_user_id AND ak.is_active = true
  GROUP BY aks.tier;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- Priority 1: Centralization - Database Tables
-- calculation_logs, api_pricing_tiers, user_subscriptions

-- 1. Calculation Logs - Audit trail for all tax calculations
CREATE TABLE IF NOT EXISTS calculation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    
    -- What was calculated
    tax_type TEXT NOT NULL, -- 'pit', 'cit', 'vat', 'wht', 'cgt', 'stamp', 'levy', 'metr'
    input JSONB NOT NULL,   -- Raw input parameters
    output JSONB NOT NULL,  -- Calculation result
    
    -- Source tracking
    source TEXT NOT NULL,   -- 'web_chat', 'telegram', 'whatsapp', 'api', 'admin'
    session_id TEXT,        -- For grouping related calculations
    
    -- Metadata
    rules_version DATE,     -- Date of rules used
    response_time_ms INTEGER,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for calculation_logs
CREATE INDEX IF NOT EXISTS idx_calc_logs_user ON calculation_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calc_logs_type ON calculation_logs(tax_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calc_logs_source ON calculation_logs(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calc_logs_api_key ON calculation_logs(api_key_id) WHERE api_key_id IS NOT NULL;

-- 2. API Pricing Tiers - Admin-configurable pricing
CREATE TABLE IF NOT EXISTS api_pricing_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,          -- 'free', 'starter', 'business', 'enterprise'
    display_name TEXT NOT NULL,          -- 'Free', 'Starter', etc.
    price_monthly INTEGER NOT NULL,      -- In kobo (₦0 = 0, ₦5000 = 500000)
    price_yearly INTEGER,                -- Annual pricing (optional discount)
    
    -- Rate limits
    requests_per_min INTEGER NOT NULL,
    requests_per_day INTEGER NOT NULL,
    
    -- Feature flags
    can_access_documents BOOLEAN DEFAULT FALSE,
    can_access_ocr BOOLEAN DEFAULT FALSE,
    can_use_webhooks BOOLEAN DEFAULT FALSE,
    can_bulk_process BOOLEAN DEFAULT FALSE,
    priority_support BOOLEAN DEFAULT FALSE,
    
    -- Display
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,   -- Highlight in pricing page
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default pricing tiers
INSERT INTO api_pricing_tiers (name, display_name, price_monthly, requests_per_min, requests_per_day, can_access_documents, can_access_ocr, can_use_webhooks, sort_order, is_featured)
VALUES 
    ('free', 'Free', 0, 10, 100, false, false, false, 1, false),
    ('starter', 'Starter', 500000, 60, 5000, false, false, true, 2, false),
    ('business', 'Business', 5000000, 300, 50000, true, true, true, 3, true),
    ('enterprise', 'Enterprise', 50000000, 999999, 999999, true, true, true, 4, false)
ON CONFLICT (name) DO UPDATE SET
    price_monthly = EXCLUDED.price_monthly,
    requests_per_min = EXCLUDED.requests_per_min,
    requests_per_day = EXCLUDED.requests_per_day;

-- 3. User Subscriptions - Track API tier subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier_id UUID NOT NULL REFERENCES api_pricing_tiers(id),
    
    -- Subscription state
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing', 'paused')),
    
    -- Payment integration
    paystack_customer_id TEXT,
    paystack_subscription_code TEXT,
    paystack_plan_code TEXT,
    
    -- Billing period
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    
    -- Usage tracking
    requests_this_period INTEGER DEFAULT 0,
    last_request_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id) -- One active subscription per user
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_paystack ON user_subscriptions(paystack_subscription_code);

-- 4. RLS Policies
ALTER TABLE calculation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Calculation logs: users see their own, admins see all
CREATE POLICY calc_logs_user ON calculation_logs
    FOR SELECT USING (user_id = auth.uid());

-- Pricing tiers: everyone can read active tiers
CREATE POLICY pricing_tiers_read ON api_pricing_tiers
    FOR SELECT USING (is_active = true);

-- Subscriptions: users see their own
CREATE POLICY subscriptions_user ON user_subscriptions
    FOR ALL USING (user_id = auth.uid());

-- 5. Function to log a calculation
CREATE OR REPLACE FUNCTION log_calculation(
    p_user_id UUID,
    p_api_key_id UUID,
    p_tax_type TEXT,
    p_input JSONB,
    p_output JSONB,
    p_source TEXT,
    p_response_time_ms INTEGER DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO calculation_logs (
        user_id, api_key_id, tax_type, input, output, source, 
        rules_version, response_time_ms
    ) VALUES (
        p_user_id, p_api_key_id, p_tax_type, p_input, p_output, p_source,
        CURRENT_DATE, p_response_time_ms
    ) RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grants
GRANT SELECT ON calculation_logs TO authenticated;
GRANT SELECT ON api_pricing_tiers TO anon, authenticated;
GRANT ALL ON user_subscriptions TO authenticated;
-- Priority 1: Centralization - Database Tables
-- calculation_logs, api_pricing_tiers, user_subscriptions

-- 1. Calculation Logs - Audit trail for all tax calculations
CREATE TABLE IF NOT EXISTS calculation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    
    -- What was calculated
    tax_type TEXT NOT NULL, -- 'pit', 'cit', 'vat', 'wht', 'cgt', 'stamp', 'levy', 'metr'
    input JSONB NOT NULL,   -- Raw input parameters
    output JSONB NOT NULL,  -- Calculation result
    
    -- Source tracking
    source TEXT NOT NULL,   -- 'web_chat', 'telegram', 'whatsapp', 'api', 'admin'
    session_id TEXT,        -- For grouping related calculations
    
    -- Metadata
    rules_version DATE,     -- Date of rules used
    response_time_ms INTEGER,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for calculation_logs
CREATE INDEX IF NOT EXISTS idx_calc_logs_user ON calculation_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calc_logs_type ON calculation_logs(tax_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calc_logs_source ON calculation_logs(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calc_logs_api_key ON calculation_logs(api_key_id) WHERE api_key_id IS NOT NULL;

-- 2. API Pricing Tiers - Admin-configurable pricing
CREATE TABLE IF NOT EXISTS api_pricing_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,          -- 'free', 'starter', 'business', 'enterprise'
    display_name TEXT NOT NULL,          -- 'Free', 'Starter', etc.
    price_monthly INTEGER NOT NULL,      -- In kobo (₦0 = 0, ₦5000 = 500000)
    price_yearly INTEGER,                -- Annual pricing (optional discount)
    
    -- Rate limits
    requests_per_min INTEGER NOT NULL,
    requests_per_day INTEGER NOT NULL,
    
    -- Feature flags
    can_access_documents BOOLEAN DEFAULT FALSE,
    can_access_ocr BOOLEAN DEFAULT FALSE,
    can_use_webhooks BOOLEAN DEFAULT FALSE,
    can_bulk_process BOOLEAN DEFAULT FALSE,
    priority_support BOOLEAN DEFAULT FALSE,
    
    -- Display
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,   -- Highlight in pricing page
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default pricing tiers
INSERT INTO api_pricing_tiers (name, display_name, price_monthly, requests_per_min, requests_per_day, can_access_documents, can_access_ocr, can_use_webhooks, sort_order, is_featured)
VALUES 
    ('free', 'Free', 0, 10, 100, false, false, false, 1, false),
    ('starter', 'Starter', 500000, 60, 5000, false, false, true, 2, false),
    ('business', 'Business', 5000000, 300, 50000, true, true, true, 3, true),
    ('enterprise', 'Enterprise', 50000000, 999999, 999999, true, true, true, 4, false)
ON CONFLICT (name) DO UPDATE SET
    price_monthly = EXCLUDED.price_monthly,
    requests_per_min = EXCLUDED.requests_per_min,
    requests_per_day = EXCLUDED.requests_per_day;

-- 3. User Subscriptions - Track API tier subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier_id UUID NOT NULL REFERENCES api_pricing_tiers(id),
    
    -- Subscription state
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing', 'paused')),
    
    -- Payment integration
    paystack_customer_id TEXT,
    paystack_subscription_code TEXT,
    paystack_plan_code TEXT,
    
    -- Billing period
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    
    -- Usage tracking
    requests_this_period INTEGER DEFAULT 0,
    last_request_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id) -- One active subscription per user
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_paystack ON user_subscriptions(paystack_subscription_code);

-- 4. RLS Policies
ALTER TABLE calculation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Calculation logs: users see their own, admins see all
CREATE POLICY calc_logs_user ON calculation_logs
    FOR SELECT USING (user_id = auth.uid());

-- Pricing tiers: everyone can read active tiers
CREATE POLICY pricing_tiers_read ON api_pricing_tiers
    FOR SELECT USING (is_active = true);

-- Subscriptions: users see their own
CREATE POLICY subscriptions_user ON user_subscriptions
    FOR ALL USING (user_id = auth.uid());

-- 5. Function to log a calculation
CREATE OR REPLACE FUNCTION log_calculation(
    p_user_id UUID,
    p_api_key_id UUID,
    p_tax_type TEXT,
    p_input JSONB,
    p_output JSONB,
    p_source TEXT,
    p_response_time_ms INTEGER DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO calculation_logs (
        user_id, api_key_id, tax_type, input, output, source, 
        rules_version, response_time_ms
    ) VALUES (
        p_user_id, p_api_key_id, p_tax_type, p_input, p_output, p_source,
        CURRENT_DATE, p_response_time_ms
    ) RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grants
GRANT SELECT ON calculation_logs TO authenticated;
GRANT SELECT ON api_pricing_tiers TO anon, authenticated;
GRANT ALL ON user_subscriptions TO authenticated;

COMMENT ON TABLE calculation_logs IS 'Audit trail for all tax calculations across all interfaces';
COMMENT ON TABLE api_pricing_tiers IS 'Admin-configurable API pricing tiers';
COMMENT ON TABLE user_subscriptions IS 'User API tier subscriptions with Paystack integration';
-- User Subscription System - FIXED
-- Creates user_pricing_tiers and helper functions only
-- (user_subscriptions already exists with different schema)

-------------------------------------------
-- 1. User Pricing Tiers (NEW TABLE)
-------------------------------------------
CREATE TABLE IF NOT EXISTS user_pricing_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    price_monthly INTEGER NOT NULL DEFAULT 0,
    price_yearly INTEGER,
    target_description TEXT,
    max_team_members INTEGER NOT NULL DEFAULT 1,
    max_bank_accounts INTEGER NOT NULL DEFAULT 0,
    max_ocr_docs_per_month INTEGER NOT NULL DEFAULT 0,
    max_chats_per_day INTEGER,
    has_pdf_reports BOOLEAN DEFAULT FALSE,
    has_reminders BOOLEAN DEFAULT FALSE,
    has_filing_assistance BOOLEAN DEFAULT FALSE,
    has_priority_support BOOLEAN DEFAULT FALSE,
    has_api_access BOOLEAN DEFAULT FALSE,
    min_revenue_band TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert pricing tiers
INSERT INTO user_pricing_tiers (name, display_name, price_monthly, price_yearly, max_team_members, max_bank_accounts, max_ocr_docs_per_month, max_chats_per_day, has_pdf_reports, has_reminders, has_filing_assistance, has_priority_support, has_api_access, min_revenue_band, sort_order, is_featured)
VALUES 
    ('free', 'Free', 0, 0, 1, 0, 0, 5, false, false, false, false, false, NULL, 1, false),
    ('personal', 'Personal', 500000, 5000000, 1, 1, 5, NULL, true, true, false, false, false, NULL, 2, false),
    ('personal_plus', 'Personal Plus', 1000000, 10000000, 1, 2, 10, NULL, true, true, true, false, false, NULL, 3, false),
    ('business_lite', 'Business Lite', 1000000, 10000000, 2, 2, 20, NULL, true, true, true, false, false, 'under_25m', 4, false),
    ('business_standard', 'Business Standard', 2500000, 25000000, 5, 5, 50, NULL, true, true, true, false, false, '25m_100m', 5, true),
    ('business_pro', 'Business Pro', 5000000, 50000000, 10, 10, 100, NULL, true, true, true, true, false, '100m_500m', 6, false),
    ('enterprise', 'Enterprise', 0, 0, 999999, 999999, 999999, NULL, true, true, true, true, true, 'over_500m', 7, false)
ON CONFLICT (name) DO UPDATE SET
    price_monthly = EXCLUDED.price_monthly,
    price_yearly = EXCLUDED.price_yearly,
    max_team_members = EXCLUDED.max_team_members,
    max_bank_accounts = EXCLUDED.max_bank_accounts,
    max_ocr_docs_per_month = EXCLUDED.max_ocr_docs_per_month;

-------------------------------------------
-- 2. Subscription Add-ons
-------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES user_subscriptions(id) ON DELETE CASCADE,
    addon_type TEXT NOT NULL CHECK (addon_type IN ('extra_bank', 'extra_team', 'ocr_pack')),
    quantity INTEGER NOT NULL DEFAULT 1,
    price_per_unit INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-------------------------------------------
-- 3. Add missing columns to user_subscriptions
-------------------------------------------
ALTER TABLE user_subscriptions 
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly',
ADD COLUMN IF NOT EXISTS paystack_email_token TEXT,
ADD COLUMN IF NOT EXISTS ocr_docs_used_this_period INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS chats_used_today INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS chats_last_reset DATE DEFAULT CURRENT_DATE;

-------------------------------------------
-- 4. Indexes
-------------------------------------------
CREATE INDEX IF NOT EXISTS idx_addons_sub ON subscription_addons(subscription_id);

-------------------------------------------
-- 5. RLS Policies
-------------------------------------------
ALTER TABLE user_pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_pricing_read ON user_pricing_tiers;
CREATE POLICY user_pricing_read ON user_pricing_tiers
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS addons_own ON subscription_addons;
CREATE POLICY addons_own ON subscription_addons
    FOR ALL USING (
        subscription_id IN (
            SELECT id FROM user_subscriptions WHERE user_id = auth.uid()
        )
    );

-------------------------------------------
-- 6. Grants
-------------------------------------------
GRANT SELECT ON user_pricing_tiers TO anon, authenticated;
GRANT ALL ON subscription_addons TO authenticated;

-------------------------------------------
-- 7. Comments
-------------------------------------------
COMMENT ON TABLE user_pricing_tiers IS 'User subscription pricing tiers (Free, Personal, Business, Enterprise)';
COMMENT ON TABLE subscription_addons IS 'Extra banks, team members, OCR packs purchased';
-- User Subscription System
-- Phase 0: Legacy Migration + Phase 1: Database

-------------------------------------------
-- 1. User Pricing Tiers
-------------------------------------------
CREATE TABLE IF NOT EXISTS user_pricing_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    price_monthly INTEGER NOT NULL DEFAULT 0,  -- In kobo
    price_yearly INTEGER,                       -- In kobo (2 months free)
    target_description TEXT,
    
    -- Limits
    max_team_members INTEGER NOT NULL DEFAULT 1,
    max_bank_accounts INTEGER NOT NULL DEFAULT 0,
    max_ocr_docs_per_month INTEGER NOT NULL DEFAULT 0,
    max_chats_per_day INTEGER,  -- NULL = unlimited
    
    -- Features
    has_pdf_reports BOOLEAN DEFAULT FALSE,
    has_reminders BOOLEAN DEFAULT FALSE,
    has_filing_assistance BOOLEAN DEFAULT FALSE,
    has_priority_support BOOLEAN DEFAULT FALSE,
    has_api_access BOOLEAN DEFAULT FALSE,
    
    -- Revenue requirements (for self-selection)
    min_revenue_band TEXT,  -- 'under_25m', '25m_100m', '100m_500m', 'over_500m'
    
    -- Display
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert approved pricing tiers
INSERT INTO user_pricing_tiers (name, display_name, price_monthly, price_yearly, max_team_members, max_bank_accounts, max_ocr_docs_per_month, max_chats_per_day, has_pdf_reports, has_reminders, has_filing_assistance, has_priority_support, has_api_access, min_revenue_band, sort_order, is_featured)
VALUES 
    ('free', 'Free', 0, 0, 1, 0, 0, 5, false, false, false, false, false, NULL, 1, false),
    ('personal', 'Personal', 500000, 5000000, 1, 1, 5, NULL, true, true, false, false, false, NULL, 2, false),
    ('personal_plus', 'Personal Plus', 1000000, 10000000, 1, 2, 10, NULL, true, true, true, false, false, NULL, 3, false),
    ('business_lite', 'Business Lite', 1000000, 10000000, 2, 2, 20, NULL, true, true, true, false, false, 'under_25m', 4, false),
    ('business_standard', 'Business Standard', 2500000, 25000000, 5, 5, 50, NULL, true, true, true, false, false, '25m_100m', 5, true),
    ('business_pro', 'Business Pro', 5000000, 50000000, 10, 10, 100, NULL, true, true, true, true, false, '100m_500m', 6, false),
    ('enterprise', 'Enterprise', 0, 0, 999999, 999999, 999999, NULL, true, true, true, true, true, 'over_500m', 7, false)
ON CONFLICT (name) DO UPDATE SET
    price_monthly = EXCLUDED.price_monthly,
    price_yearly = EXCLUDED.price_yearly,
    max_team_members = EXCLUDED.max_team_members,
    max_bank_accounts = EXCLUDED.max_bank_accounts,
    max_ocr_docs_per_month = EXCLUDED.max_ocr_docs_per_month;

-------------------------------------------
-- 2. User Subscriptions
-------------------------------------------
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier_id UUID NOT NULL REFERENCES user_pricing_tiers(id),
    
    -- Subscription state
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'paused')),
    
    -- Trial
    trial_ends_at TIMESTAMPTZ,
    
    -- Billing
    billing_cycle TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    current_period_start TIMESTAMPTZ DEFAULT NOW(),
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    
    -- Paystack integration
    paystack_customer_code TEXT,
    paystack_subscription_code TEXT,
    paystack_email_token TEXT,
    
    -- Usage tracking (reset monthly)
    ocr_docs_used_this_period INTEGER DEFAULT 0,
    chats_used_today INTEGER DEFAULT 0,
    chats_last_reset DATE DEFAULT CURRENT_DATE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id)
);

-------------------------------------------
-- 3. Subscription Add-ons
-------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES user_subscriptions(id) ON DELETE CASCADE,
    addon_type TEXT NOT NULL CHECK (addon_type IN ('extra_bank', 'extra_team', 'ocr_pack')),
    quantity INTEGER NOT NULL DEFAULT 1,
    price_per_unit INTEGER NOT NULL,  -- In kobo
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-------------------------------------------
-- 4. Migrate existing users
-------------------------------------------
-- First, get the free tier ID
DO $$
DECLARE
    free_tier_id UUID;
    standard_tier_id UUID;
    enterprise_tier_id UUID;
BEGIN
    SELECT id INTO free_tier_id FROM user_pricing_tiers WHERE name = 'free';
    SELECT id INTO standard_tier_id FROM user_pricing_tiers WHERE name = 'business_standard';
    SELECT id INTO enterprise_tier_id FROM user_pricing_tiers WHERE name = 'enterprise';
    
    -- Migrate users based on old subscription_tier
    INSERT INTO user_subscriptions (user_id, tier_id, status)
    SELECT 
        u.id,
        CASE 
            WHEN u.subscription_tier = 'enterprise' THEN enterprise_tier_id
            WHEN u.subscription_tier = 'pro' THEN standard_tier_id
            ELSE free_tier_id
        END,
        'active'
    FROM users u
    WHERE NOT EXISTS (
        SELECT 1 FROM user_subscriptions us WHERE us.user_id = u.id
    );
END $$;

-------------------------------------------
-- 5. Indexes
-------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_subs_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subs_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_subs_tier ON user_subscriptions(tier_id);
CREATE INDEX IF NOT EXISTS idx_addons_sub ON subscription_addons(subscription_id);

-------------------------------------------
-- 6. RLS Policies
-------------------------------------------
ALTER TABLE user_pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_addons ENABLE ROW LEVEL SECURITY;

-- Pricing tiers: everyone can read active tiers
CREATE POLICY user_pricing_read ON user_pricing_tiers
    FOR SELECT USING (is_active = true);

-- Subscriptions: users see/edit their own
CREATE POLICY user_subs_own ON user_subscriptions
    FOR ALL USING (user_id = auth.uid());

-- Add-ons: users see their own via subscription
CREATE POLICY addons_own ON subscription_addons
    FOR ALL USING (
        subscription_id IN (
            SELECT id FROM user_subscriptions WHERE user_id = auth.uid()
        )
    );

-------------------------------------------
-- 7. Helper Functions
-------------------------------------------

-- Get user's current tier with limits
CREATE OR REPLACE FUNCTION get_user_tier(p_user_id UUID)
RETURNS TABLE(
    tier_name TEXT,
    max_banks INTEGER,
    max_team INTEGER,
    max_ocr INTEGER,
    max_chats INTEGER,
    banks_used INTEGER,
    team_used INTEGER,
    ocr_used INTEGER,
    chats_used INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        upt.name,
        upt.max_bank_accounts + COALESCE(SUM(CASE WHEN sa.addon_type = 'extra_bank' THEN sa.quantity ELSE 0 END), 0)::INTEGER,
        upt.max_team_members + COALESCE(SUM(CASE WHEN sa.addon_type = 'extra_team' THEN sa.quantity ELSE 0 END), 0)::INTEGER,
        upt.max_ocr_docs_per_month + COALESCE(SUM(CASE WHEN sa.addon_type = 'ocr_pack' THEN sa.quantity * 50 ELSE 0 END), 0)::INTEGER,
        upt.max_chats_per_day,
        (SELECT COUNT(*)::INTEGER FROM bank_connections bc WHERE bc.user_id = p_user_id),
        (SELECT COUNT(*)::INTEGER FROM team_members tm WHERE tm.team_id IN (SELECT t.id FROM teams t WHERE t.owner_id = p_user_id)),
        us.ocr_docs_used_this_period,
        CASE WHEN us.chats_last_reset = CURRENT_DATE THEN us.chats_used_today ELSE 0 END
    FROM user_subscriptions us
    JOIN user_pricing_tiers upt ON us.tier_id = upt.id
    LEFT JOIN subscription_addons sa ON sa.subscription_id = us.id
    WHERE us.user_id = p_user_id
    GROUP BY upt.name, upt.max_bank_accounts, upt.max_team_members, upt.max_ocr_docs_per_month, upt.max_chats_per_day, us.ocr_docs_used_this_period, us.chats_used_today, us.chats_last_reset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user can perform action
CREATE OR REPLACE FUNCTION check_user_limit(
    p_user_id UUID,
    p_action TEXT  -- 'bank', 'team', 'ocr', 'chat'
) RETURNS TABLE(
    allowed BOOLEAN,
    current_count INTEGER,
    max_allowed INTEGER,
    upgrade_message TEXT
) AS $$
DECLARE
    tier_data RECORD;
BEGIN
    SELECT * INTO tier_data FROM get_user_tier(p_user_id);
    
    IF tier_data IS NULL THEN
        RETURN QUERY SELECT false, 0, 0, 'No subscription found'::TEXT;
        RETURN;
    END IF;
    
    CASE p_action
        WHEN 'bank' THEN
            RETURN QUERY SELECT 
                tier_data.banks_used < tier_data.max_banks,
                tier_data.banks_used,
                tier_data.max_banks,
                CASE WHEN tier_data.banks_used >= tier_data.max_banks 
                    THEN 'Upgrade to link more bank accounts' 
                    ELSE NULL 
                END;
        WHEN 'team' THEN
            RETURN QUERY SELECT 
                tier_data.team_used < tier_data.max_team,
                tier_data.team_used,
                tier_data.max_team,
                CASE WHEN tier_data.team_used >= tier_data.max_team 
                    THEN 'Upgrade to add more team members' 
                    ELSE NULL 
                END;
        WHEN 'ocr' THEN
            RETURN QUERY SELECT 
                tier_data.ocr_used < tier_data.max_ocr,
                tier_data.ocr_used,
                tier_data.max_ocr,
                CASE WHEN tier_data.ocr_used >= tier_data.max_ocr 
                    THEN 'Upgrade for more document processing' 
                    ELSE NULL 
                END;
        WHEN 'chat' THEN
            IF tier_data.max_chats IS NULL THEN
                RETURN QUERY SELECT true, tier_data.chats_used, 999999, NULL::TEXT;
            ELSE
                RETURN QUERY SELECT 
                    tier_data.chats_used < tier_data.max_chats,
                    tier_data.chats_used,
                    tier_data.max_chats,
                    CASE WHEN tier_data.chats_used >= tier_data.max_chats 
                        THEN 'You''ve reached your daily chat limit. Upgrade for unlimited.' 
                        ELSE NULL 
                    END;
            END IF;
        ELSE
            RETURN QUERY SELECT false, 0, 0, 'Unknown action'::TEXT;
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment usage counter
CREATE OR REPLACE FUNCTION increment_usage(
    p_user_id UUID,
    p_type TEXT  -- 'ocr' or 'chat'
) RETURNS VOID AS $$
BEGIN
    IF p_type = 'ocr' THEN
        UPDATE user_subscriptions 
        SET ocr_docs_used_this_period = ocr_docs_used_this_period + 1,
            updated_at = NOW()
        WHERE user_id = p_user_id;
    ELSIF p_type = 'chat' THEN
        UPDATE user_subscriptions 
        SET chats_used_today = CASE 
                WHEN chats_last_reset = CURRENT_DATE THEN chats_used_today + 1 
                ELSE 1 
            END,
            chats_last_reset = CURRENT_DATE,
            updated_at = NOW()
        WHERE user_id = p_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-------------------------------------------
-- 8. Grants
-------------------------------------------
GRANT SELECT ON user_pricing_tiers TO anon, authenticated;
GRANT ALL ON user_subscriptions TO authenticated;
GRANT ALL ON subscription_addons TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_tier TO authenticated;
GRANT EXECUTE ON FUNCTION check_user_limit TO authenticated;
GRANT EXECUTE ON FUNCTION increment_usage TO authenticated;

-------------------------------------------
-- 9. Comments
-------------------------------------------
COMMENT ON TABLE user_pricing_tiers IS 'User subscription pricing tiers (Free, Personal, Business, Enterprise)';
COMMENT ON TABLE user_subscriptions IS 'User subscription state and usage tracking';
COMMENT ON TABLE subscription_addons IS 'Extra banks, team members, OCR packs purchased';
COMMENT ON FUNCTION check_user_limit IS 'Check if user can perform action based on tier limits';
-- Create developer_access_requests table
CREATE TABLE public.developer_access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    
    -- Company details
    company_name VARCHAR(255),
    company_website VARCHAR(500),
    technical_contact_name VARCHAR(255),
    technical_contact_email VARCHAR(255),
    
    -- Use case description
    use_case_description TEXT NOT NULL,
    expected_monthly_requests INTEGER,
    target_api_tier VARCHAR(20) DEFAULT 'starter',
    
    -- Admin review fields
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    admin_notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add developer access columns to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS has_developer_access BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS developer_access_granted_at TIMESTAMPTZ;

-- Enable RLS
ALTER TABLE public.developer_access_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
CREATE POLICY "Users can view own developer requests"
ON public.developer_access_requests FOR SELECT
TO authenticated
USING (user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));

-- Users can insert their own requests
CREATE POLICY "Users can create own developer requests"
ON public.developer_access_requests FOR INSERT
TO authenticated
WITH CHECK (user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));

-- Admins can view all requests
CREATE POLICY "Admins can view all developer requests"
ON public.developer_access_requests FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update requests
CREATE POLICY "Admins can update developer requests"
ON public.developer_access_requests FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_developer_access_requests_updated_at
    BEFORE UPDATE ON public.developer_access_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
-- Create user_payments table for tracking subscription payments
CREATE TABLE public.user_payments (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    paystack_reference TEXT NOT NULL UNIQUE,
    amount_kobo INTEGER NOT NULL,
    currency TEXT DEFAULT 'NGN',
    status TEXT NOT NULL DEFAULT 'pending',
    tier_id UUID REFERENCES public.user_pricing_tiers(id),
    billing_cycle TEXT,
    payment_method TEXT,
    paid_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add paystack_reference to user_subscriptions if not exists
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS paystack_reference TEXT;

-- Add paystack_customer_code to user_subscriptions if not exists  
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT;

-- Enable RLS
ALTER TABLE public.user_payments ENABLE ROW LEVEL SECURITY;

-- Users can view their own payments
CREATE POLICY "Users can view their own payments"
ON public.user_payments
FOR SELECT
USING (auth.uid() = user_id);

-- Only system can insert payments (via service role)
CREATE POLICY "Service role can insert payments"
ON public.user_payments
FOR INSERT
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_user_payments_user_id ON public.user_payments(user_id);
CREATE INDEX idx_user_payments_reference ON public.user_payments(paystack_reference);
-- Function to purge expired soft-deleted items (runs after 5-minute grace period)
CREATE OR REPLACE FUNCTION public.purge_expired_deleted_items()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  purged_count INTEGER;
BEGIN
  DELETE FROM deleted_items 
  WHERE expires_at < NOW() 
    AND restored = false;
  GET DIAGNOSTICS purged_count = ROW_COUNT;
  RETURN purged_count;
END;
$$;
-- Add multi-part columns to legal_documents
ALTER TABLE public.legal_documents 
ADD COLUMN IF NOT EXISTS is_multi_part BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS total_parts INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS parts_received INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS processing_strategy TEXT DEFAULT 'single';

-- Add check constraint for processing_strategy
ALTER TABLE public.legal_documents 
ADD CONSTRAINT legal_documents_processing_strategy_check 
CHECK (processing_strategy IN ('single', 'sequential', 'parallel'));

-- Create document_parts table
CREATE TABLE IF NOT EXISTS public.document_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_document_id UUID NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
    part_number INTEGER NOT NULL,
    part_title TEXT,
    file_url TEXT,
    raw_text TEXT,
    status TEXT DEFAULT 'pending',
    provisions_count INTEGER DEFAULT 0,
    rules_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    UNIQUE(parent_document_id, part_number)
);

-- Add check constraint for status
ALTER TABLE public.document_parts 
ADD CONSTRAINT document_parts_status_check 
CHECK (status IN ('pending', 'processing', 'processed', 'failed'));

-- Add source_part_id to legal_provisions for traceability
ALTER TABLE public.legal_provisions 
ADD COLUMN IF NOT EXISTS source_part_id UUID REFERENCES public.document_parts(id) ON DELETE SET NULL;

-- Add source_part_id to compliance_rules for traceability
ALTER TABLE public.compliance_rules 
ADD COLUMN IF NOT EXISTS source_part_id UUID REFERENCES public.document_parts(id) ON DELETE SET NULL;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_document_parts_parent ON public.document_parts(parent_document_id);
CREATE INDEX IF NOT EXISTS idx_document_parts_status ON public.document_parts(status);
CREATE INDEX IF NOT EXISTS idx_legal_provisions_source_part ON public.legal_provisions(source_part_id);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_source_part ON public.compliance_rules(source_part_id);

-- Enable RLS on document_parts
ALTER TABLE public.document_parts ENABLE ROW LEVEL SECURITY;

-- RLS policies for document_parts (admins only)
CREATE POLICY "Admins can view document parts" ON public.document_parts
    FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert document parts" ON public.document_parts
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update document parts" ON public.document_parts
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete document parts" ON public.document_parts
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_document_parts_updated_at
    BEFORE UPDATE ON public.document_parts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE public.document_parts IS 'Stores individual parts of multi-part legal documents for large regulations split across multiple files';
COMMENT ON COLUMN public.document_parts.part_number IS 'Sequential order of this part within the parent document';
COMMENT ON COLUMN public.document_parts.status IS 'Processing status: pending, processing, processed, failed';
COMMENT ON COLUMN public.legal_documents.is_multi_part IS 'Whether this document is split into multiple parts';
COMMENT ON COLUMN public.legal_documents.processing_strategy IS 'How to process parts: single (default), sequential, or parallel';
-- Document Processing Events Table for tracking granular processing status
-- This table stores all processing events for complete history and diagnostics

CREATE TABLE public.document_processing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
    part_id UUID REFERENCES public.document_parts(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('started', 'stage_started', 'stage_completed', 'completed', 'failed', 'retried', 'warning')),
    stage TEXT CHECK (stage IN ('upload', 'text_extraction', 'ocr', 'provision_extraction', 'rules_extraction', 'summary_generation', 'prism_impact', 'deduplication', 'finalization')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'skipped')),
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_processing_events_document_id ON public.document_processing_events(document_id);
CREATE INDEX idx_processing_events_part_id ON public.document_processing_events(part_id);
CREATE INDEX idx_processing_events_created_at ON public.document_processing_events(created_at DESC);
CREATE INDEX idx_processing_events_event_type ON public.document_processing_events(event_type);

-- Enable RLS
ALTER TABLE public.document_processing_events ENABLE ROW LEVEL SECURITY;

-- Admins can view all processing events
CREATE POLICY "Admins can view processing events"
ON public.document_processing_events
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Service role can insert processing events (from edge functions)
CREATE POLICY "Service role can insert processing events"
ON public.document_processing_events
FOR INSERT
WITH CHECK (true);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_processing_events;

-- Add processing metadata columns to legal_documents if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_documents' AND column_name = 'processing_started_at') THEN
        ALTER TABLE public.legal_documents ADD COLUMN processing_started_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_documents' AND column_name = 'processing_completed_at') THEN
        ALTER TABLE public.legal_documents ADD COLUMN processing_completed_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_documents' AND column_name = 'current_processing_stage') THEN
        ALTER TABLE public.legal_documents ADD COLUMN current_processing_stage TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_documents' AND column_name = 'processing_progress') THEN
        ALTER TABLE public.legal_documents ADD COLUMN processing_progress INTEGER DEFAULT 0;
    END IF;
END $$;

-- Comments for documentation
COMMENT ON TABLE public.document_processing_events IS 'Stores granular processing events for document processing history and diagnostics';
COMMENT ON COLUMN public.document_processing_events.event_type IS 'Type of event: started, stage_started, stage_completed, completed, failed, retried, warning';
COMMENT ON COLUMN public.document_processing_events.stage IS 'Processing stage this event relates to';
COMMENT ON COLUMN public.document_processing_events.details IS 'Additional data like error messages, counts, timing, AI confidence scores';
-- Add processing_started_at to track stuck parts
ALTER TABLE document_parts 
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;
-- =====================================================
-- Fix Code Proposals Trigger + Add Risk Classification
-- =====================================================
-- Problem: Trigger only fired on UPDATE, not INSERT
-- Solution: Fire on both INSERT and UPDATE

-- Drop old trigger function
DROP FUNCTION IF EXISTS public.queue_code_proposal_on_rule_activation() CASCADE;

-- Create new trigger function that handles INSERT and UPDATE
CREATE OR REPLACE FUNCTION public.queue_code_proposal_trigger()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_rule_types TEXT[] := ARRAY['tax_rate', 'threshold', 'tax_band', 'relief', 'vat_rate', 'emtl', 'exemption', 'penalty'];
BEGIN
    -- On INSERT: Queue if active and relevant rule type
    IF TG_OP = 'INSERT' THEN
        IF NEW.is_active = true AND NEW.rule_type = ANY(v_rule_types) THEN
            INSERT INTO public.code_proposal_queue (rule_id, status)
            VALUES (NEW.id, 'pending')
            ON CONFLICT DO NOTHING;
        END IF;
        RETURN NEW;
    END IF;
    
    -- On UPDATE: Queue if becoming active OR parameters changed
    IF TG_OP = 'UPDATE' THEN
        IF NEW.is_active = true 
           AND NEW.rule_type = ANY(v_rule_types)
           AND (
               -- Rule becoming active
               (OLD.is_active = false OR OLD.is_active IS NULL)
               -- OR parameters changed
               OR (OLD.parameters IS DISTINCT FROM NEW.parameters)
               -- OR rule type changed
               OR (OLD.rule_type IS DISTINCT FROM NEW.rule_type)
           ) THEN
            INSERT INTO public.code_proposal_queue (rule_id, status)
            VALUES (NEW.id, 'pending')
            ON CONFLICT DO NOTHING;
        END IF;
        RETURN NEW;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Recreate trigger to fire on INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_queue_code_proposal ON public.compliance_rules;
CREATE TRIGGER trg_queue_code_proposal
    AFTER INSERT OR UPDATE ON public.compliance_rules
    FOR EACH ROW 
    EXECUTE FUNCTION public.queue_code_proposal_trigger();

-- =====================================================
-- Add Risk Classification to code_change_proposals
-- =====================================================

-- Add risk classification columns
ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'medium' 
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical'));

ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS auto_apply_eligible BOOLEAN DEFAULT false;

ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS change_type TEXT DEFAULT 'code_and_db'
    CHECK (change_type IN ('db_only', 'prompt_only', 'code_and_db'));

ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;

ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS applied_by UUID REFERENCES auth.users(id);

-- Add index for filtering by risk level
CREATE INDEX IF NOT EXISTS idx_code_proposals_risk_level 
    ON public.code_change_proposals(risk_level);

CREATE INDEX IF NOT EXISTS idx_code_proposals_auto_apply 
    ON public.code_change_proposals(auto_apply_eligible) 
    WHERE auto_apply_eligible = true;

-- =====================================================
-- Add unique constraint to prevent duplicate queue items
-- =====================================================
ALTER TABLE public.code_proposal_queue 
ADD CONSTRAINT unique_pending_rule 
UNIQUE (rule_id, status);

-- =====================================================
-- Function to classify risk level based on rule type
-- =====================================================
CREATE OR REPLACE FUNCTION public.classify_proposal_risk(
    p_rule_type TEXT,
    p_parameters JSONB
) RETURNS TABLE(
    risk_level TEXT,
    auto_apply_eligible BOOLEAN,
    change_type TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE p_rule_type
            -- Low risk: Simple rate/threshold changes
            WHEN 'vat_rate' THEN 'low'::TEXT
            WHEN 'tax_rate' THEN 'low'::TEXT
            WHEN 'threshold' THEN 'low'::TEXT
            -- Medium risk: Band changes require review
            WHEN 'tax_band' THEN 'medium'::TEXT
            WHEN 'relief' THEN 'medium'::TEXT
            -- High risk: New provisions
            WHEN 'exemption' THEN 'high'::TEXT
            WHEN 'penalty' THEN 'high'::TEXT
            -- Critical: EMTL changes
            WHEN 'emtl' THEN 'critical'::TEXT
            ELSE 'medium'::TEXT
        END,
        CASE p_rule_type
            WHEN 'vat_rate' THEN true
            WHEN 'tax_rate' THEN true
            WHEN 'threshold' THEN true
            ELSE false
        END,
        -- Most changes are DB-only now that we centralized calculations
        CASE p_rule_type
            WHEN 'vat_rate' THEN 'db_only'::TEXT
            WHEN 'tax_rate' THEN 'db_only'::TEXT
            WHEN 'threshold' THEN 'db_only'::TEXT
            WHEN 'tax_band' THEN 'db_only'::TEXT
            ELSE 'prompt_only'::TEXT  -- May need prompt updates
        END;
END;
$$;

-- =====================================================
-- Grant execute permission
-- =====================================================
GRANT EXECUTE ON FUNCTION public.queue_code_proposal_trigger() TO service_role;
GRANT EXECUTE ON FUNCTION public.classify_proposal_risk(TEXT, JSONB) TO service_role;
-- =====================================================
-- Fix Code Proposals Trigger + Add Risk Classification
-- =====================================================
-- Problem: Trigger only fired on UPDATE, not INSERT
-- Solution: Fire on both INSERT and UPDATE

-- Drop old trigger function
DROP FUNCTION IF EXISTS public.queue_code_proposal_on_rule_activation() CASCADE;

-- Create new trigger function that handles INSERT and UPDATE
CREATE OR REPLACE FUNCTION public.queue_code_proposal_trigger()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_rule_types TEXT[] := ARRAY['tax_rate', 'threshold', 'tax_band', 'relief', 'vat_rate', 'emtl', 'exemption', 'penalty'];
BEGIN
    -- On INSERT: Queue if active and relevant rule type
    IF TG_OP = 'INSERT' THEN
        IF NEW.is_active = true AND NEW.rule_type = ANY(v_rule_types) THEN
            INSERT INTO public.code_proposal_queue (rule_id, status)
            VALUES (NEW.id, 'pending')
            ON CONFLICT DO NOTHING;
        END IF;
        RETURN NEW;
    END IF;
    
    -- On UPDATE: Queue if becoming active OR parameters changed
    IF TG_OP = 'UPDATE' THEN
        IF NEW.is_active = true 
           AND NEW.rule_type = ANY(v_rule_types)
           AND (
               -- Rule becoming active
               (OLD.is_active = false OR OLD.is_active IS NULL)
               -- OR parameters changed
               OR (OLD.parameters IS DISTINCT FROM NEW.parameters)
               -- OR rule type changed
               OR (OLD.rule_type IS DISTINCT FROM NEW.rule_type)
           ) THEN
            INSERT INTO public.code_proposal_queue (rule_id, status)
            VALUES (NEW.id, 'pending')
            ON CONFLICT DO NOTHING;
        END IF;
        RETURN NEW;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Recreate trigger to fire on INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_queue_code_proposal ON public.compliance_rules;
CREATE TRIGGER trg_queue_code_proposal
    AFTER INSERT OR UPDATE ON public.compliance_rules
    FOR EACH ROW 
    EXECUTE FUNCTION public.queue_code_proposal_trigger();

-- =====================================================
-- Add Risk Classification to code_change_proposals
-- =====================================================

-- Add risk classification columns
ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'medium' 
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical'));

ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS auto_apply_eligible BOOLEAN DEFAULT false;

ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS change_type TEXT DEFAULT 'code_and_db'
    CHECK (change_type IN ('db_only', 'prompt_only', 'code_and_db'));

ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;

ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS applied_by UUID REFERENCES auth.users(id);

-- Add index for filtering by risk level
CREATE INDEX IF NOT EXISTS idx_code_proposals_risk_level 
    ON public.code_change_proposals(risk_level);

CREATE INDEX IF NOT EXISTS idx_code_proposals_auto_apply 
    ON public.code_change_proposals(auto_apply_eligible) 
    WHERE auto_apply_eligible = true;

-- =====================================================
-- Add unique constraint to prevent duplicate queue items
-- =====================================================
ALTER TABLE public.code_proposal_queue 
ADD CONSTRAINT unique_pending_rule 
UNIQUE (rule_id, status);

-- =====================================================
-- Function to classify risk level based on rule type
-- =====================================================
CREATE OR REPLACE FUNCTION public.classify_proposal_risk(
    p_rule_type TEXT,
    p_parameters JSONB
) RETURNS TABLE(
    risk_level TEXT,
    auto_apply_eligible BOOLEAN,
    change_type TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE p_rule_type
            -- Low risk: Simple rate/threshold changes
            WHEN 'vat_rate' THEN 'low'::TEXT
            WHEN 'tax_rate' THEN 'low'::TEXT
            WHEN 'threshold' THEN 'low'::TEXT
            -- Medium risk: Band changes require review
            WHEN 'tax_band' THEN 'medium'::TEXT
            WHEN 'relief' THEN 'medium'::TEXT
            -- High risk: New provisions
            WHEN 'exemption' THEN 'high'::TEXT
            WHEN 'penalty' THEN 'high'::TEXT
            -- Critical: EMTL changes
            WHEN 'emtl' THEN 'critical'::TEXT
            ELSE 'medium'::TEXT
        END,
        CASE p_rule_type
            WHEN 'vat_rate' THEN true
            WHEN 'tax_rate' THEN true
            WHEN 'threshold' THEN true
            ELSE false
        END,
        -- Most changes are DB-only now that we centralized calculations
        CASE p_rule_type
            WHEN 'vat_rate' THEN 'db_only'::TEXT
            WHEN 'tax_rate' THEN 'db_only'::TEXT
            WHEN 'threshold' THEN 'db_only'::TEXT
            WHEN 'tax_band' THEN 'db_only'::TEXT
            ELSE 'prompt_only'::TEXT  -- May need prompt updates
        END;
END;
$$;

-- =====================================================
-- Grant execute permission
-- =====================================================
GRANT EXECUTE ON FUNCTION public.queue_code_proposal_trigger() TO service_role;
GRANT EXECUTE ON FUNCTION public.classify_proposal_risk(TEXT, JSONB) TO service_role;
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
-- Add codebase_registry table for tracking hardcoded values in files
CREATE TABLE IF NOT EXISTS public.codebase_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path TEXT NOT NULL,
    value_type TEXT NOT NULL CHECK (value_type IN ('tax_rate', 'threshold', 'tax_band', 'relief', 'vat_rate', 'emtl', 'exemption', 'penalty', 'constant')),
    line_number INTEGER,
    current_value JSONB,
    rule_id UUID REFERENCES public.compliance_rules(id) ON DELETE SET NULL,
    last_scanned_at TIMESTAMPTZ DEFAULT NOW(),
    needs_update BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(file_path, value_type, line_number)
);

-- Add needs_revision column to code_change_proposals if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'code_change_proposals' 
        AND column_name = 'needs_revision'
    ) THEN
        ALTER TABLE public.code_change_proposals 
        ADD COLUMN needs_revision BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Enable RLS on codebase_registry
ALTER TABLE public.codebase_registry ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access to codebase_registry
CREATE POLICY "service_role_codebase_registry_all" ON public.codebase_registry
FOR ALL USING (true) WITH CHECK (true);

-- Allow admins to read codebase_registry
CREATE POLICY "admins_read_codebase_registry" ON public.codebase_registry
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role = 'admin'
    )
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_codebase_registry_rule_id ON public.codebase_registry(rule_id);
CREATE INDEX IF NOT EXISTS idx_codebase_registry_needs_update ON public.codebase_registry(needs_update) WHERE needs_update = true;
CREATE INDEX IF NOT EXISTS idx_codebase_registry_value_type ON public.codebase_registry(value_type);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_codebase_registry_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS update_codebase_registry_updated_at ON public.codebase_registry;
CREATE TRIGGER update_codebase_registry_updated_at
    BEFORE UPDATE ON public.codebase_registry
    FOR EACH ROW
    EXECUTE FUNCTION update_codebase_registry_updated_at();

-- Add comment for documentation
COMMENT ON TABLE public.codebase_registry IS 'Tracks hardcoded tax values in the codebase for automated update proposals';
COMMENT ON COLUMN public.codebase_registry.value_type IS 'Type of value: tax_rate, threshold, tax_band, relief, vat_rate, emtl, exemption, penalty, constant';
COMMENT ON COLUMN public.codebase_registry.needs_update IS 'Flag indicating this file location needs a code proposal update';
-- =====================================================
-- V8: Code Proposals Enhancements
-- 1. Codebase registry for AI context
-- 2. Add needs_revision status
-- =====================================================

-- =====================================================
-- Table: codebase_registry
-- Stores actual file paths for AI-aware code proposals
-- =====================================================

CREATE TABLE IF NOT EXISTS public.codebase_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path TEXT NOT NULL UNIQUE,
    file_type TEXT NOT NULL CHECK (file_type IN ('skill', 'edge_function', 'shared', 'migration', 'component', 'other')),
    description TEXT,
    related_rule_types TEXT[], -- Which rule types affect this file
    last_updated TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for rule type lookups
CREATE INDEX IF NOT EXISTS idx_codebase_registry_rule_types 
    ON public.codebase_registry USING GIN(related_rule_types);

-- Enable RLS
ALTER TABLE public.codebase_registry ENABLE ROW LEVEL SECURITY;

-- Admin read access
CREATE POLICY "Admins can read codebase registry"
    ON public.codebase_registry
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

-- Service role full access (for edge functions)
CREATE POLICY "Service role can manage codebase registry"
    ON public.codebase_registry
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =====================================================
-- Populate with actual PRISM codebase files
-- =====================================================

INSERT INTO public.codebase_registry (file_path, file_type, description, related_rule_types) VALUES
-- Gateway Skills (all centralized via taxService)
('gateway/src/skills/vat-calculation/index.ts', 'skill', 'VAT calculation with exemption NLU pass-through', ARRAY['vat_rate', 'exemption']),
('gateway/src/skills/stamp-duties/index.ts', 'skill', 'Stamp duty via taxService', ARRAY['stamp_duty', 'exemption']),
('gateway/src/skills/withholding-tax/index.ts', 'skill', 'WHT via taxService', ARRAY['wht_rate']),
('gateway/src/skills/corporate-tax/index.ts', 'skill', 'CIT via taxService', ARRAY['cit_rate', 'threshold']),
('gateway/src/skills/capital-gains/index.ts', 'skill', 'CGT via taxService', ARRAY['cgt_rate']),
('gateway/src/skills/minimum-etr/index.ts', 'skill', 'METR via taxService', ARRAY['metr_rate', 'threshold']),
('gateway/src/utils/tax-service.ts', 'skill', 'TypeScript wrapper for tax-calculate edge function', ARRAY['all']),

-- Shared utilities
('supabase/functions/_shared/prompt-generator.ts', 'shared', 'AI context builder - may need NTA section updates', ARRAY['all']),
('supabase/functions/_shared/rules-client.ts', 'shared', 'Runtime rules fetcher from compliance_rules', ARRAY['all']),

-- Edge functions
('supabase/functions/tax-calculate/index.ts', 'edge_function', 'Central tax calculator with exemption NLU', ARRAY['all']),
('supabase/functions/vat-calculator/index.ts', 'edge_function', 'User-facing VAT calculator API', ARRAY['vat_rate', 'exemption']),
('supabase/functions/income-tax-calculator/index.ts', 'edge_function', 'User-facing PIT calculator API', ARRAY['tax_rate', 'tax_band', 'relief']),

-- Database (special entry for DB-only changes)
('compliance_rules (DB)', 'other', 'Database table - most rule changes are DB-only', ARRAY['all'])
ON CONFLICT (file_path) DO UPDATE SET
    description = EXCLUDED.description,
    related_rule_types = EXCLUDED.related_rule_types,
    last_updated = now();

-- =====================================================
-- Update code_change_proposals status constraint
-- Add needs_revision status
-- =====================================================

ALTER TABLE public.code_change_proposals 
DROP CONSTRAINT IF EXISTS code_change_proposals_status_check;

DO $$ 
BEGIN
    -- Check if constraint exists before trying to drop
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'code_change_proposals_status_check_v2'
        AND table_name = 'code_change_proposals'
    ) THEN
        ALTER TABLE public.code_change_proposals 
        ADD CONSTRAINT code_change_proposals_status_check_v2 
        CHECK (status IN ('pending', 'approved', 'rejected', 'implemented', 'needs_revision'));
    END IF;
END $$;

-- Add revision notes column if not exists
ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS revision_notes TEXT;

-- Add re-queued count to track how many times proposal was revised
ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS revision_count INTEGER DEFAULT 0;

-- =====================================================
-- Function to get relevant files for a rule type
-- Used by generate-code-proposals
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_files_for_rule_type(p_rule_type TEXT)
RETURNS TABLE(
    file_path TEXT,
    file_type TEXT,
    description TEXT
)
LANGUAGE sql
STABLE
AS $$
    SELECT file_path, file_type, description
    FROM public.codebase_registry
    WHERE 'all' = ANY(related_rule_types)
       OR p_rule_type = ANY(related_rule_types)
    ORDER BY 
        CASE file_type 
            WHEN 'other' THEN 1  -- DB first
            WHEN 'shared' THEN 2
            WHEN 'edge_function' THEN 3
            WHEN 'skill' THEN 4
            ELSE 5
        END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION public.get_files_for_rule_type(TEXT) TO service_role;
-- Drop old constraint
ALTER TABLE public.code_change_proposals 
DROP CONSTRAINT IF EXISTS code_change_proposals_status_check;

-- Add new constraint with needs_revision
ALTER TABLE public.code_change_proposals 
ADD CONSTRAINT code_change_proposals_status_check_v2 
CHECK (status IN ('pending', 'approved', 'rejected', 'implemented', 'needs_revision'));

-- Add revision columns
ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS revision_notes TEXT;

ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS revision_count INTEGER DEFAULT 0;
-- =====================================================
-- V9: Fact-Grounded AI Schema
-- Ensures all tax rules are traceable to source documents
-- =====================================================

-- =====================================================
-- 1. Add document_priority to legal_documents
-- Constitution > Act > Finance Act > Circular
-- =====================================================

ALTER TABLE public.legal_documents 
ADD COLUMN IF NOT EXISTS document_priority INTEGER DEFAULT 5;

COMMENT ON COLUMN public.legal_documents.document_priority IS 
  '1=Constitution, 2=Act of Parliament, 3=Finance Act, 4=FIRS Public Notice, 5=Circular, 6=Practice Note';

-- Update priorities for existing document types
UPDATE public.legal_documents SET document_priority = 1 WHERE document_type = 'constitution';
UPDATE public.legal_documents SET document_priority = 2 WHERE document_type IN ('act', 'primary_legislation');
UPDATE public.legal_documents SET document_priority = 3 WHERE document_type IN ('finance_act', 'amendment');
UPDATE public.legal_documents SET document_priority = 4 WHERE document_type IN ('public_notice', 'gazette');
UPDATE public.legal_documents SET document_priority = 5 WHERE document_type IN ('circular', 'information_circular');
UPDATE public.legal_documents SET document_priority = 6 WHERE document_type IN ('practice_note', 'guidance');

-- =====================================================
-- 2. Enhance compliance_rules with source traceability
-- =====================================================

-- Source document reference (will make NOT NULL after backfill)
ALTER TABLE public.compliance_rules 
ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES public.legal_documents(id);

-- Section reference from document
ALTER TABLE public.compliance_rules 
ADD COLUMN IF NOT EXISTS section_reference TEXT;

-- AI extraction confidence (0.00 to 1.00)
ALTER TABLE public.compliance_rules 
ADD COLUMN IF NOT EXISTS extraction_confidence DECIMAL(3,2) DEFAULT 1.00;

-- Rule lifecycle - expiration
ALTER TABLE public.compliance_rules 
ADD COLUMN IF NOT EXISTS expiration_date DATE;

-- Rule lifecycle - supersession chain
ALTER TABLE public.compliance_rules 
ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES public.compliance_rules(id);

ALTER TABLE public.compliance_rules 
ADD COLUMN IF NOT EXISTS supersedes UUID REFERENCES public.compliance_rules(id);

-- User eligibility criteria (JSON)
ALTER TABLE public.compliance_rules 
ADD COLUMN IF NOT EXISTS eligibility_criteria JSONB DEFAULT '{}';

-- Create index for document lookups
CREATE INDEX IF NOT EXISTS idx_compliance_rules_document 
ON public.compliance_rules(document_id);

-- Create index for active rules
CREATE INDEX IF NOT EXISTS idx_compliance_rules_expiration 
ON public.compliance_rules(expiration_date) 
WHERE expiration_date IS NOT NULL;

-- Comments
COMMENT ON COLUMN public.compliance_rules.document_id IS 'Source legal document this rule was extracted from';
COMMENT ON COLUMN public.compliance_rules.section_reference IS 'Section/paragraph reference e.g. "Section 23(1)(c)"';
COMMENT ON COLUMN public.compliance_rules.extraction_confidence IS 'AI confidence in rule extraction (0.00-1.00)';
COMMENT ON COLUMN public.compliance_rules.expiration_date IS 'Date when this rule stops applying (for temporary/sunset rules)';
COMMENT ON COLUMN public.compliance_rules.superseded_by IS 'ID of rule that replaced this one';
COMMENT ON COLUMN public.compliance_rules.eligibility_criteria IS 'JSON criteria for which users this rule applies to';

-- =====================================================
-- 3. Create calculation_audit_log table
-- Tracks which rules were applied in each calculation
-- =====================================================

CREATE TABLE IF NOT EXISTS public.calculation_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    tax_type TEXT NOT NULL,
    calculation_type TEXT NOT NULL, -- 'vat', 'cit', 'wht', 'stamp_duty', etc.
    input_values JSONB NOT NULL,
    rules_applied JSONB NOT NULL DEFAULT '[]',
    result JSONB NOT NULL,
    result_amount DECIMAL(15,2),
    calculated_at TIMESTAMPTZ DEFAULT now(),
    session_id TEXT, -- For grouping related calculations
    channel TEXT -- 'web', 'telegram', 'whatsapp', 'api'
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_calc_audit_user ON public.calculation_audit_log(user_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_calc_audit_type ON public.calculation_audit_log(tax_type, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_calc_audit_session ON public.calculation_audit_log(session_id);

-- Enable RLS
ALTER TABLE public.calculation_audit_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own calculations
CREATE POLICY "Users can view own calculations"
ON public.calculation_audit_log FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR user_id IN (
    SELECT id FROM public.users WHERE auth_user_id = auth.uid()
));

-- Admins can view all
CREATE POLICY "Admins can view all calculations"
ON public.calculation_audit_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Service role full access
CREATE POLICY "Service role full access to audit log"
ON public.calculation_audit_log FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.calculation_audit_log IS 'Audit trail of all tax calculations with rules applied';

-- =====================================================
-- 4. Function to get active rules for a tax type
-- Only returns rules that are not expired and have source docs
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_active_rules_for_type(p_rule_type TEXT)
RETURNS TABLE(
    id UUID,
    rule_code TEXT,
    rule_name TEXT,
    rule_value JSONB,
    section_reference TEXT,
    document_title TEXT,
    document_priority INTEGER,
    extraction_confidence DECIMAL
)
LANGUAGE sql
STABLE
AS $$
    SELECT 
        cr.id,
        cr.rule_code,
        cr.rule_name,
        cr.rule_value,
        cr.section_reference,
        ld.title as document_title,
        ld.document_priority,
        cr.extraction_confidence
    FROM public.compliance_rules cr
    LEFT JOIN public.legal_documents ld ON cr.document_id = ld.id
    WHERE cr.rule_type = p_rule_type
      AND cr.is_active = true
      AND (cr.expiration_date IS NULL OR cr.expiration_date > CURRENT_DATE)
      AND cr.superseded_by IS NULL
    ORDER BY ld.document_priority ASC, cr.extraction_confidence DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_rules_for_type(TEXT) TO service_role;

-- =====================================================
-- 5. Function to flag rules expiring soon
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_expiring_rules(p_days_ahead INTEGER DEFAULT 30)
RETURNS TABLE(
    id UUID,
    rule_code TEXT,
    rule_name TEXT,
    expiration_date DATE,
    days_until_expiration INTEGER,
    document_title TEXT
)
LANGUAGE sql
STABLE
AS $$
    SELECT 
        cr.id,
        cr.rule_code,
        cr.rule_name,
        cr.expiration_date,
        (cr.expiration_date - CURRENT_DATE)::INTEGER as days_until_expiration,
        ld.title as document_title
    FROM public.compliance_rules cr
    LEFT JOIN public.legal_documents ld ON cr.document_id = ld.id
    WHERE cr.expiration_date IS NOT NULL
      AND cr.expiration_date > CURRENT_DATE
      AND cr.expiration_date <= CURRENT_DATE + (p_days_ahead || ' days')::INTERVAL
      AND cr.superseded_by IS NULL
    ORDER BY cr.expiration_date ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_expiring_rules(INTEGER) TO authenticated;

-- =====================================================
-- 6. Update code_change_proposals to require source
-- =====================================================

ALTER TABLE public.code_change_proposals
ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES public.legal_documents(id);

ALTER TABLE public.code_change_proposals
ADD COLUMN IF NOT EXISTS source_verification JSONB DEFAULT '{}';

COMMENT ON COLUMN public.code_change_proposals.source_document_id IS 'Legal document that triggered this proposal';
COMMENT ON COLUMN public.code_change_proposals.source_verification IS 'Verification info: document name, section, confidence';
-- Add section_reference column to compliance_rules
ALTER TABLE public.compliance_rules 
ADD COLUMN IF NOT EXISTS section_reference TEXT;

COMMENT ON COLUMN public.compliance_rules.section_reference IS 
  'Section/paragraph reference e.g. "Section 23(1)(c)"';
-- Migration: Complete all missing migration components
-- V1: User Preferences (20260113003000_user_preferences.sql)
-- V2: API Documents (20260113160000_api_documents.sql)  
-- V3: Calculation Audit Log (20260117080000_fact_grounded_ai.sql - missing table)

-- 1. User Preferences Table
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    insight_frequency VARCHAR(20) DEFAULT 'weekly' 
      CHECK (insight_frequency IN ('daily', 'weekly', 'monthly', 'never')),
    auto_categorize BOOLEAN DEFAULT TRUE,
    notification_preferences JSONB DEFAULT '{"email": true, "whatsapp": true, "telegram": false}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences"
ON public.user_preferences FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own preferences"
ON public.user_preferences FOR ALL
USING (auth.uid() = user_id);

-- 2. API Documents Table
CREATE TABLE IF NOT EXISTS public.api_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id TEXT,
    title TEXT NOT NULL,
    content TEXT,
    document_type VARCHAR(50),
    source_url TEXT,
    processed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_documents_status ON api_documents(status);
CREATE INDEX IF NOT EXISTS idx_api_documents_type ON api_documents(document_type);

-- 3. Calculation Audit Log (completes fact-grounded AI traceability)
CREATE TABLE IF NOT EXISTS public.calculation_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calculation_id UUID NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    business_id UUID REFERENCES businesses(id),
    calculation_type VARCHAR(50) NOT NULL,
    input_data JSONB NOT NULL,
    output_data JSONB NOT NULL,
    rules_applied UUID[] DEFAULT '{}',
    rules_metadata JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON calculation_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_business ON calculation_audit_log(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_type ON calculation_audit_log(calculation_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON calculation_audit_log(created_at DESC);

COMMENT ON TABLE calculation_audit_log IS 
  'Tracks which compliance rules were applied in each tax calculation for fact-grounded AI traceability';
COMMENT ON COLUMN calculation_audit_log.rules_applied IS 
  'Array of compliance_rule IDs that were used in this calculation';
COMMENT ON COLUMN calculation_audit_log.rules_metadata IS 
  'Snapshot of rule details at calculation time including source document references';
-- Enable RLS on new tables and add appropriate policies

-- API Documents: Admin-only access
ALTER TABLE public.api_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage api_documents"
ON public.api_documents FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Calculation Audit Log: Users can view their own, admins can view all
ALTER TABLE public.calculation_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own calculation audits"
ON public.calculation_audit_log FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all calculation audits"
ON public.calculation_audit_log FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can insert calculation audits"
ON public.calculation_audit_log FOR INSERT
WITH CHECK (true);
-- Step 1: Drop old constraints
ALTER TABLE public.codebase_registry 
DROP CONSTRAINT IF EXISTS codebase_registry_value_type_check;

ALTER TABLE public.codebase_registry 
DROP CONSTRAINT IF EXISTS codebase_registry_file_path_value_type_line_number_key;

-- Step 2: Rename column
ALTER TABLE public.codebase_registry 
RENAME COLUMN value_type TO file_type;

-- Step 3: Add new columns
ALTER TABLE public.codebase_registry 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS related_rule_types TEXT[] DEFAULT '{}';

-- Step 4: Add unique constraint on file_path
ALTER TABLE public.codebase_registry 
ADD CONSTRAINT codebase_registry_file_path_unique UNIQUE (file_path);

-- Step 5: Add new check constraint with expanded file types
ALTER TABLE public.codebase_registry 
ADD CONSTRAINT codebase_registry_file_type_check 
CHECK (file_type IS NULL OR file_type = ANY (ARRAY['tax_rate', 'threshold', 'tax_band', 'relief', 'vat_rate', 'emtl', 'exemption', 'penalty', 'constant', 'shared', 'edge_function', 'skill', 'database', 'service', 'frontend']));

-- Step 6: Add comments
COMMENT ON COLUMN codebase_registry.related_rule_types IS 
  'Array of rule types this file handles e.g. {"vat_rate", "exemption"}';
COMMENT ON COLUMN codebase_registry.description IS 
  'Human-readable description of file purpose';

-- Step 7: Create RPC function
CREATE OR REPLACE FUNCTION get_files_for_rule_type(p_rule_type TEXT)
RETURNS TABLE(file_path TEXT, description TEXT, file_type TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cr.file_path,
    cr.description,
    cr.file_type
  FROM codebase_registry cr
  WHERE 
    p_rule_type = ANY(cr.related_rule_types)
    OR 'all' = ANY(cr.related_rule_types)
  ORDER BY 
    CASE WHEN 'all' = ANY(cr.related_rule_types) THEN 1 ELSE 0 END,
    cr.file_path;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 8: Populate registry with PRISM file mappings
INSERT INTO public.codebase_registry 
  (file_path, file_type, description, related_rule_types) 
VALUES
('supabase/functions/_shared/rules-client.ts', 'shared', 
 'Central rules fetching and caching', ARRAY['all']),
('supabase/functions/_shared/prompt-generator.ts', 'shared', 
 'AI prompt context building with rules', ARRAY['all']),
('supabase/functions/tax-calculate/index.ts', 'edge_function', 
 'Centralized tax calculation engine', 
 ARRAY['tax_rate', 'tax_band', 'vat_rate', 'threshold', 'exemption', 'relief', 'levy']),
('gateway/src/skills/tax-calculation/index.ts', 'skill', 
 'PIT/Income tax calculation skill', ARRAY['tax_rate', 'tax_band', 'relief']),
('gateway/src/skills/vat-calculation/index.ts', 'skill', 
 'VAT calculation skill', ARRAY['vat_rate', 'exemption']),
('gateway/src/skills/withholding-tax/index.ts', 'skill', 
 'WHT calculation skill', ARRAY['wht_rate', 'threshold']),
('gateway/src/skills/corporate-tax/index.ts', 'skill', 
 'CIT calculation skill', ARRAY['cit_rate', 'tax_rate']),
('gateway/src/skills/capital-gains/index.ts', 'skill', 
 'CGT calculation skill', ARRAY['cgt_rate']),
('gateway/src/skills/stamp-duties/index.ts', 'skill', 
 'Stamp duty calculation skill', ARRAY['stamp_duty_rate', 'threshold']),
('gateway/src/skills/development-levy/index.ts', 'skill', 
 'Development levy/EMTL calculation skill', ARRAY['levy', 'threshold']),
('gateway/src/skills/minimum-etr/index.ts', 'skill', 
 'Minimum ETR calculation skill', ARRAY['etr', 'minimum_tax']),
('(DB) compliance_rules.parameters', 'database', 
 'Rule parameters stored in database', 
 ARRAY['tax_rate', 'vat_rate', 'threshold', 'tax_band']),
('(DB) compliance_rules.rule_value', 'database', 
 'Rule values in database', ARRAY['relief', 'exemption', 'deadline']),
('gateway/src/services/rules-fetcher.ts', 'service', 
 'Gateway-side rules fetching service', ARRAY['all'])
ON CONFLICT (file_path) DO UPDATE SET
  description = EXCLUDED.description,
  related_rule_types = EXCLUDED.related_rule_types,
  file_type = EXCLUDED.file_type;
-- =====================================================
-- Duplicate Rule Detection
-- Detects similar/duplicate compliance rules
-- =====================================================

-- 1. Function to find potential duplicate rules
CREATE OR REPLACE FUNCTION public.find_duplicate_rules()
RETURNS TABLE(
    rule_id_1 UUID,
    rule_code_1 TEXT,
    rule_name_1 TEXT,
    rule_id_2 UUID,
    rule_code_2 TEXT,
    rule_name_2 TEXT,
    similarity_score NUMERIC,
    duplicate_reason TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r1.id as rule_id_1,
        r1.rule_code as rule_code_1,
        r1.rule_name as rule_name_1,
        r2.id as rule_id_2,
        r2.rule_code as rule_code_2,
        r2.rule_name as rule_name_2,
        CASE 
            WHEN r1.rule_name = r2.rule_name THEN 100.0
            WHEN LOWER(r1.rule_name) = LOWER(r2.rule_name) THEN 95.0
            WHEN similarity(r1.rule_name, r2.rule_name) > 0.7 THEN (similarity(r1.rule_name, r2.rule_name) * 100)::NUMERIC
            ELSE 0.0
        END as similarity_score,
        CASE
            WHEN r1.rule_name = r2.rule_name THEN 'Exact name match'
            WHEN LOWER(r1.rule_name) = LOWER(r2.rule_name) THEN 'Case-insensitive name match'
            WHEN r1.rule_type = r2.rule_type AND r1.description = r2.description THEN 'Same type and description'
            ELSE 'Similar names'
        END as duplicate_reason
    FROM public.compliance_rules r1
    JOIN public.compliance_rules r2 ON r1.id < r2.id  -- Avoid self-join and duplicate pairs
    WHERE 
        r1.is_active = true AND r2.is_active = true
        AND (
            -- Exact name match
            r1.rule_name = r2.rule_name
            -- Or same type with very similar names
            OR (r1.rule_type = r2.rule_type AND similarity(r1.rule_name, r2.rule_name) > 0.7)
            -- Or same description
            OR (r1.description IS NOT NULL AND r1.description = r2.description AND LENGTH(r1.description) > 20)
        )
    ORDER BY similarity_score DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_rules() TO authenticated;

-- 2. Function to check for duplicates before inserting new rule
CREATE OR REPLACE FUNCTION public.check_rule_duplicate(
    p_rule_name TEXT,
    p_rule_type TEXT,
    p_description TEXT DEFAULT NULL
)
RETURNS TABLE(
    existing_rule_id UUID,
    existing_rule_code TEXT,
    existing_rule_name TEXT,
    similarity_score NUMERIC,
    recommendation TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id as existing_rule_id,
        r.rule_code as existing_rule_code,
        r.rule_name as existing_rule_name,
        CASE 
            WHEN r.rule_name = p_rule_name THEN 100.0
            WHEN LOWER(r.rule_name) = LOWER(p_rule_name) THEN 95.0
            ELSE (similarity(r.rule_name, p_rule_name) * 100)::NUMERIC
        END as similarity_score,
        CASE
            WHEN r.rule_name = p_rule_name THEN 'BLOCK: Exact duplicate exists'
            WHEN LOWER(r.rule_name) = LOWER(p_rule_name) THEN 'BLOCK: Case-insensitive duplicate exists'
            WHEN similarity(r.rule_name, p_rule_name) > 0.8 THEN 'WARN: Very similar rule exists'
            ELSE 'WARN: Similar rule exists'
        END as recommendation
    FROM public.compliance_rules r
    WHERE 
        r.is_active = true
        AND r.rule_type = p_rule_type
        AND (
            r.rule_name = p_rule_name
            OR LOWER(r.rule_name) = LOWER(p_rule_name)
            OR similarity(r.rule_name, p_rule_name) > 0.6
        )
    ORDER BY similarity_score DESC
    LIMIT 5;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rule_duplicate(TEXT, TEXT, TEXT) TO authenticated;

-- 3. Create pg_trgm extension for similarity function (if not exists)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 4. Get duplicate count for dashboard
CREATE OR REPLACE FUNCTION public.get_duplicate_rule_count()
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT COUNT(*)::INTEGER 
    FROM (SELECT DISTINCT rule_id_1 FROM public.find_duplicate_rules()) sub;
$$;

GRANT EXECUTE ON FUNCTION public.get_duplicate_rule_count() TO authenticated;

COMMENT ON FUNCTION public.find_duplicate_rules() IS 
    'Find all potential duplicate rules based on name similarity and type';
COMMENT ON FUNCTION public.check_rule_duplicate(TEXT, TEXT, TEXT) IS 
    'Check if a new rule would be a duplicate before inserting';
-- =====================================================
-- Duplicate Rule Detection
-- Detects similar/duplicate compliance rules
-- =====================================================

-- 1. Function to find potential duplicate rules
CREATE OR REPLACE FUNCTION public.find_duplicate_rules()
RETURNS TABLE(
    rule_id_1 UUID,
    rule_code_1 TEXT,
    rule_name_1 TEXT,
    rule_id_2 UUID,
    rule_code_2 TEXT,
    rule_name_2 TEXT,
    similarity_score NUMERIC,
    duplicate_reason TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r1.id as rule_id_1,
        r1.rule_code as rule_code_1,
        r1.rule_name as rule_name_1,
        r2.id as rule_id_2,
        r2.rule_code as rule_code_2,
        r2.rule_name as rule_name_2,
        CASE 
            WHEN r1.rule_name = r2.rule_name THEN 100.0
            WHEN LOWER(r1.rule_name) = LOWER(r2.rule_name) THEN 95.0
            WHEN similarity(r1.rule_name, r2.rule_name) > 0.7 THEN (similarity(r1.rule_name, r2.rule_name) * 100)::NUMERIC
            ELSE 0.0
        END as similarity_score,
        CASE
            WHEN r1.rule_name = r2.rule_name THEN 'Exact name match'
            WHEN LOWER(r1.rule_name) = LOWER(r2.rule_name) THEN 'Case-insensitive name match'
            WHEN r1.rule_type = r2.rule_type AND r1.description = r2.description THEN 'Same type and description'
            ELSE 'Similar names'
        END as duplicate_reason
    FROM public.compliance_rules r1
    JOIN public.compliance_rules r2 ON r1.id < r2.id
    WHERE 
        r1.is_active = true AND r2.is_active = true
        AND (
            r1.rule_name = r2.rule_name
            OR (r1.rule_type = r2.rule_type AND similarity(r1.rule_name, r2.rule_name) > 0.7)
            OR (r1.description IS NOT NULL AND r1.description = r2.description AND LENGTH(r1.description) > 20)
        )
    ORDER BY similarity_score DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_rules() TO authenticated;

-- 2. Function to check for duplicates before inserting new rule
CREATE OR REPLACE FUNCTION public.check_rule_duplicate(
    p_rule_name TEXT,
    p_rule_type TEXT,
    p_description TEXT DEFAULT NULL
)
RETURNS TABLE(
    existing_rule_id UUID,
    existing_rule_code TEXT,
    existing_rule_name TEXT,
    similarity_score NUMERIC,
    recommendation TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id as existing_rule_id,
        r.rule_code as existing_rule_code,
        r.rule_name as existing_rule_name,
        CASE 
            WHEN r.rule_name = p_rule_name THEN 100.0
            WHEN LOWER(r.rule_name) = LOWER(p_rule_name) THEN 95.0
            ELSE (similarity(r.rule_name, p_rule_name) * 100)::NUMERIC
        END as similarity_score,
        CASE
            WHEN r.rule_name = p_rule_name THEN 'BLOCK: Exact duplicate exists'
            WHEN LOWER(r.rule_name) = LOWER(p_rule_name) THEN 'BLOCK: Case-insensitive duplicate exists'
            WHEN similarity(r.rule_name, p_rule_name) > 0.8 THEN 'WARN: Very similar rule exists'
            ELSE 'WARN: Similar rule exists'
        END as recommendation
    FROM public.compliance_rules r
    WHERE 
        r.is_active = true
        AND r.rule_type = p_rule_type
        AND (
            r.rule_name = p_rule_name
            OR LOWER(r.rule_name) = LOWER(p_rule_name)
            OR similarity(r.rule_name, p_rule_name) > 0.6
        )
    ORDER BY similarity_score DESC
    LIMIT 5;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rule_duplicate(TEXT, TEXT, TEXT) TO authenticated;

-- 3. Create pg_trgm extension for similarity function (if not exists)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 4. Get duplicate count for dashboard
CREATE OR REPLACE FUNCTION public.get_duplicate_rule_count()
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT COUNT(*)::INTEGER 
    FROM (SELECT DISTINCT rule_id_1 FROM public.find_duplicate_rules()) sub;
$$;

GRANT EXECUTE ON FUNCTION public.get_duplicate_rule_count() TO authenticated;

COMMENT ON FUNCTION public.find_duplicate_rules() IS 
    'Find all potential duplicate rules based on name similarity and type';
COMMENT ON FUNCTION public.check_rule_duplicate(TEXT, TEXT, TEXT) IS 
    'Check if a new rule would be a duplicate before inserting';
-- Fix notify_profile_rule_changes trigger function to use valid severity values
-- The constraint compliance_notifications_severity_check only allows: 'info', 'warning', 'critical'
-- Previously using invalid values: 'high', 'medium'

CREATE OR REPLACE FUNCTION public.notify_profile_rule_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    affected_rule RECORD;
BEGIN
    -- When a compliance rule changes, log which profiles might need updates
    IF TG_OP = 'UPDATE' OR TG_OP = 'INSERT' THEN
        -- Check if this affects tax calculations (rate changes, threshold changes)
        IF NEW.rule_type IN ('tax_band', 'vat_rate', 'threshold', 'relief', 'emtl') THEN
            -- Insert notification for admins about potential profile recalculations
            INSERT INTO public.compliance_notifications (
                user_id,
                notification_type,
                title,
                message,
                severity,
                metadata
            )
            SELECT DISTINCT
                ur.user_id,
                'rate_change',
                'Tax Rule Updated: ' || NEW.rule_name,
                'A tax rule affecting your calculations has been updated. Your tax estimates may change.',
                CASE 
                    WHEN NEW.rule_type IN ('tax_band', 'vat_rate') THEN 'critical'
                    ELSE 'warning'
                END,
                jsonb_build_object(
                    'rule_id', NEW.id,
                    'rule_type', NEW.rule_type,
                    'rule_name', NEW.rule_name
                )
            FROM public.user_roles ur
            WHERE ur.role = 'admin'
            LIMIT 5;
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$function$;
-- Create missing get_expiring_rules RPC function using correct column name (effective_to)
CREATE OR REPLACE FUNCTION public.get_expiring_rules(p_days_ahead INTEGER DEFAULT 30)
RETURNS TABLE(
    id UUID,
    rule_code TEXT,
    rule_name TEXT,
    effective_to TIMESTAMPTZ,
    days_until_expiration INTEGER,
    document_title TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT 
        cr.id,
        cr.rule_code,
        cr.rule_name,
        cr.effective_to,
        (cr.effective_to::date - CURRENT_DATE)::INTEGER as days_until_expiration,
        ld.title as document_title
    FROM public.compliance_rules cr
    LEFT JOIN public.legal_documents ld ON cr.document_id = ld.id
    WHERE cr.effective_to IS NOT NULL
      AND cr.effective_to::date > CURRENT_DATE
      AND cr.effective_to::date <= CURRENT_DATE + (p_days_ahead || ' days')::INTERVAL
      AND cr.is_active = true
    ORDER BY cr.effective_to ASC;
$$;

-- Reset document_parts to pending since actual provisions/rules don't match counts
UPDATE public.document_parts
SET 
    provisions_count = 0,
    rules_count = 0,
    status = 'pending',
    processed_at = NULL
WHERE parent_document_id = '4ed41522-0768-42a0-8ff9-99445a763006';

-- Delete orphan rules from Nigeria Tax Act that have no matching provisions
DELETE FROM public.compliance_rules
WHERE document_id = '4ed41522-0768-42a0-8ff9-99445a763006';
-- Drop and recreate get_expiring_rules with correct return type
DROP FUNCTION IF EXISTS public.get_expiring_rules(INTEGER);

CREATE OR REPLACE FUNCTION public.get_expiring_rules(p_days_ahead INTEGER DEFAULT 30)
RETURNS TABLE(
    id UUID,
    rule_code TEXT,
    rule_name TEXT,
    expiration_date TIMESTAMPTZ,
    days_until_expiration INTEGER,
    document_title TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT 
        cr.id,
        cr.rule_code,
        cr.rule_name,
        cr.effective_to as expiration_date,
        (cr.effective_to::date - CURRENT_DATE)::INTEGER as days_until_expiration,
        ld.title as document_title
    FROM public.compliance_rules cr
    LEFT JOIN public.legal_documents ld ON cr.document_id = ld.id
    WHERE cr.effective_to IS NOT NULL
      AND cr.effective_to::date > CURRENT_DATE
      AND cr.effective_to::date <= CURRENT_DATE + (p_days_ahead || ' days')::INTERVAL
      AND cr.is_active = true
    ORDER BY cr.effective_to ASC;
$$;
-- Add foreign key constraint from user_subscriptions to user_pricing_tiers
-- First verify both tables exist and have the right columns
DO $$
BEGIN
    -- Only add if constraint doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'user_subscriptions_tier_id_fkey' 
        AND table_name = 'user_subscriptions'
    ) THEN
        ALTER TABLE public.user_subscriptions 
        ADD CONSTRAINT user_subscriptions_tier_id_fkey 
        FOREIGN KEY (tier_id) REFERENCES public.user_pricing_tiers(id);
    END IF;
END $$;

-- Also add user_id foreign key if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'user_subscriptions_user_id_fkey' 
        AND table_name = 'user_subscriptions'
    ) THEN
        ALTER TABLE public.user_subscriptions 
        ADD CONSTRAINT user_subscriptions_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES public.users(id);
    END IF;
END $$;
-- Fix the tier_id foreign key to point to user_pricing_tiers instead of api_pricing_tiers
ALTER TABLE public.user_subscriptions 
DROP CONSTRAINT IF EXISTS user_subscriptions_tier_id_fkey;

ALTER TABLE public.user_subscriptions 
ADD CONSTRAINT user_subscriptions_tier_id_fkey 
FOREIGN KEY (tier_id) REFERENCES public.user_pricing_tiers(id);
-- Clear Part 2 rules for targeted reprocessing
DELETE FROM compliance_rules 
WHERE source_part_id = '5748e48c-8c7f-4494-8dc3-e665cd0b1e8c';

-- Reset Part 2 status to allow reprocessing
UPDATE document_parts 
SET status = 'pending', rules_count = 0, provisions_count = 0, processed_at = NULL
WHERE id = '5748e48c-8c7f-4494-8dc3-e665cd0b1e8c';
-- Fix legal_provisions check constraint to accept all provision types
ALTER TABLE legal_provisions 
DROP CONSTRAINT IF EXISTS legal_provisions_provision_type_check;

ALTER TABLE legal_provisions 
ADD CONSTRAINT legal_provisions_provision_type_check 
CHECK (provision_type = ANY (ARRAY[
    'definition', 'obligation', 'exemption', 'rate', 
    'threshold', 'penalty', 'procedure', 'deadline', 
    'relief', 'power', 'general', 'other'
]));

-- Fix compliance_rules check constraint to accept all rule types including tax_band
ALTER TABLE compliance_rules 
DROP CONSTRAINT IF EXISTS compliance_rules_rule_type_check;

ALTER TABLE compliance_rules 
ADD CONSTRAINT compliance_rules_rule_type_check 
CHECK (rule_type = ANY (ARRAY[
    'tax_rate', 'tax_band', 'threshold', 'relief', 
    'exemption', 'penalty', 'deadline', 'filing_deadline', 
    'vat_rate', 'emtl', 'procedure'
]));

-- Clear Part 2 rules to allow fresh extraction with tax_band support
DELETE FROM compliance_rules 
WHERE source_part_id = '5748e48c-8c7f-4494-8dc3-e665cd0b1e8c';

-- Reset Part 2 status for reprocessing
UPDATE document_parts 
SET status = 'pending', rules_count = 0, provisions_count = 0
WHERE id = '5748e48c-8c7f-4494-8dc3-e665cd0b1e8c';
-- Enable realtime for document_parts table so processing status updates live
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_parts;
-- Enable Supabase Realtime for Admin Tables (only existing tables)

-- Code Proposals System
ALTER PUBLICATION supabase_realtime ADD TABLE public.code_change_proposals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.code_proposal_queue;

-- Compliance Rules
ALTER PUBLICATION supabase_realtime ADD TABLE public.compliance_rules;

-- Legal Provisions (legal_documents already enabled)
ALTER PUBLICATION supabase_realtime ADD TABLE public.legal_provisions;

-- Chat System
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.compliance_notifications;

-- Review Queue
ALTER PUBLICATION supabase_realtime ADD TABLE public.review_queue;
-- =====================================================
-- Enable Supabase Realtime for Admin Tables
-- Provides live updates on admin dashboard pages
-- =====================================================

-- Code Proposals System
ALTER PUBLICATION supabase_realtime ADD TABLE public.code_change_proposals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.code_proposal_queue;

-- Compliance Rules
ALTER PUBLICATION supabase_realtime ADD TABLE public.compliance_rules;

-- Legal Documents (document_parts already enabled by Lovable)
ALTER PUBLICATION supabase_realtime ADD TABLE public.legal_documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.legal_provisions;

-- Filings
ALTER PUBLICATION supabase_realtime ADD TABLE public.tax_filings;

-- Chat System
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.compliance_notifications;

-- Search Analytics
ALTER PUBLICATION supabase_realtime ADD TABLE public.search_analytics;

-- Review Queue
ALTER PUBLICATION supabase_realtime ADD TABLE public.review_queue;

-- Document Processing Events
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_processing_events;

-- =====================================================
-- NOTES:
-- 1. Realtime only works for tables in this publication
-- 2. Frontend needs to subscribe with supabase.channel()
-- 3. RLS policies still apply to realtime events
-- 4. Each subscription counts toward connection limits
-- =====================================================

COMMENT ON PUBLICATION supabase_realtime IS 
'Tables enabled for live updates on admin dashboards. Includes code proposals, compliance rules, documents, filings, chat, notifications, and analytics.';
-- =====================================================
-- V11: Structured Memory Layer
-- Replaces unstructured remembered_facts with queryable profile fields
-- =====================================================

-- Add structured profile columns to user_preferences
ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS entity_type TEXT 
    CHECK (entity_type IN ('individual', 'self_employed', 'sme', 'company')),
ADD COLUMN IF NOT EXISTS industry TEXT,
ADD COLUMN IF NOT EXISTS business_name TEXT,
ADD COLUMN IF NOT EXISTS annual_income NUMERIC,
ADD COLUMN IF NOT EXISTS registered_taxes TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS tin TEXT,
ADD COLUMN IF NOT EXISTS vat_number TEXT,
ADD COLUMN IF NOT EXISTS last_filing_date DATE,
ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'unknown'
    CHECK (risk_level IN ('low', 'medium', 'high', 'unknown')),
ADD COLUMN IF NOT EXISTS filing_frequency TEXT
    CHECK (filing_frequency IN ('monthly', 'quarterly', 'annually'));

-- Migrate income_estimate to annual_income (backwards compat)
UPDATE public.user_preferences 
SET annual_income = income_estimate 
WHERE annual_income IS NULL AND income_estimate IS NOT NULL;

-- Migrate entity_type from users table if set there
UPDATE public.user_preferences up 
SET entity_type = u.entity_type
FROM public.users u 
WHERE u.id = up.user_id 
  AND up.entity_type IS NULL 
  AND u.entity_type IS NOT NULL;

-- =====================================================
-- Profile Learning History - Track how profile was learned
-- =====================================================

CREATE TABLE IF NOT EXISTS public.profile_learning_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    source TEXT NOT NULL CHECK (source IN ('chat', 'onboarding', 'transaction', 'ocr', 'correction', 'manual', 'admin')),
    channel TEXT CHECK (channel IN ('web', 'telegram', 'whatsapp', 'api')),
    confidence NUMERIC DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying user's profile history
CREATE INDEX IF NOT EXISTS idx_profile_learning_user 
    ON public.profile_learning_log(user_id, created_at DESC);

-- RLS
ALTER TABLE public.profile_learning_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile learning"
    ON public.profile_learning_log FOR SELECT
    USING (auth.uid()::text = user_id::text);

CREATE POLICY "Service role can manage profile learning"
    ON public.profile_learning_log FOR ALL
    USING (auth.role() = 'service_role');

-- =====================================================
-- Helper function to update profile with logging
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_user_profile(
    p_user_id UUID,
    p_field TEXT,
    p_value TEXT,
    p_source TEXT DEFAULT 'chat',
    p_channel TEXT DEFAULT NULL,
    p_confidence NUMERIC DEFAULT 1.0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_old_value TEXT;
BEGIN
    -- Get current value
    EXECUTE format('SELECT %I::text FROM user_preferences WHERE user_id = $1', p_field)
    INTO v_old_value
    USING p_user_id;
    
    -- Log the change
    INSERT INTO profile_learning_log (user_id, field_name, old_value, new_value, source, channel, confidence)
    VALUES (p_user_id, p_field, v_old_value, p_value, p_source, p_channel, p_confidence);
    
    -- Update the preference (upsert)
    INSERT INTO user_preferences (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
    
    -- Set the field value
    EXECUTE format('UPDATE user_preferences SET %I = $1 WHERE user_id = $2', p_field)
    USING p_value, p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_profile(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_profile(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC) TO service_role;

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON COLUMN public.user_preferences.entity_type IS 'User type: individual (PAYE), self_employed (freelancer), sme (small business), company';
COMMENT ON COLUMN public.user_preferences.registered_taxes IS 'Array of tax types user is registered for: VAT, CIT, PAYE, WHT, etc';
COMMENT ON COLUMN public.user_preferences.risk_level IS 'AI-assessed compliance risk level based on filing history';
COMMENT ON TABLE public.profile_learning_log IS 'Audit trail of how user profile was learned/updated';
-- =====================================================
-- V11: Structured Memory Layer
-- Replaces unstructured remembered_facts with queryable profile fields
-- =====================================================

-- Add structured profile columns to user_preferences
ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS entity_type TEXT 
    CHECK (entity_type IN ('individual', 'self_employed', 'sme', 'company')),
ADD COLUMN IF NOT EXISTS industry TEXT,
ADD COLUMN IF NOT EXISTS business_name TEXT,
ADD COLUMN IF NOT EXISTS annual_income NUMERIC,
ADD COLUMN IF NOT EXISTS registered_taxes TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS tin TEXT,
ADD COLUMN IF NOT EXISTS vat_number TEXT,
ADD COLUMN IF NOT EXISTS last_filing_date DATE,
ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'unknown'
    CHECK (risk_level IN ('low', 'medium', 'high', 'unknown')),
ADD COLUMN IF NOT EXISTS filing_frequency TEXT
    CHECK (filing_frequency IN ('monthly', 'quarterly', 'annually'));

-- Migrate entity_type from users table if set there
UPDATE public.user_preferences up 
SET entity_type = u.entity_type
FROM public.users u 
WHERE u.id = up.user_id 
  AND up.entity_type IS NULL 
  AND u.entity_type IS NOT NULL;

-- =====================================================
-- Profile Learning History - Track how profile was learned
-- =====================================================

CREATE TABLE IF NOT EXISTS public.profile_learning_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    source TEXT NOT NULL CHECK (source IN ('chat', 'onboarding', 'transaction', 'ocr', 'correction', 'manual', 'admin')),
    channel TEXT CHECK (channel IN ('web', 'telegram', 'whatsapp', 'api')),
    confidence NUMERIC DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying user's profile history
CREATE INDEX IF NOT EXISTS idx_profile_learning_user 
    ON public.profile_learning_log(user_id, created_at DESC);

-- RLS
ALTER TABLE public.profile_learning_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile learning" ON public.profile_learning_log;
CREATE POLICY "Users can view own profile learning"
    ON public.profile_learning_log FOR SELECT
    USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Service role can manage profile learning" ON public.profile_learning_log;
CREATE POLICY "Service role can manage profile learning"
    ON public.profile_learning_log FOR ALL
    USING (auth.role() = 'service_role');

-- =====================================================
-- Helper function to update profile with logging
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_user_profile(
    p_user_id UUID,
    p_field TEXT,
    p_value TEXT,
    p_source TEXT DEFAULT 'chat',
    p_channel TEXT DEFAULT NULL,
    p_confidence NUMERIC DEFAULT 1.0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_old_value TEXT;
BEGIN
    -- Get current value
    EXECUTE format('SELECT %I::text FROM user_preferences WHERE user_id = $1', p_field)
    INTO v_old_value
    USING p_user_id;
    
    -- Log the change
    INSERT INTO profile_learning_log (user_id, field_name, old_value, new_value, source, channel, confidence)
    VALUES (p_user_id, p_field, v_old_value, p_value, p_source, p_channel, p_confidence);
    
    -- Update the preference (upsert)
    INSERT INTO user_preferences (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
    
    -- Set the field value
    EXECUTE format('UPDATE user_preferences SET %I = $1 WHERE user_id = $2', p_field)
    USING p_value, p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_profile(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_profile(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC) TO service_role;

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON COLUMN public.user_preferences.entity_type IS 'User type: individual (PAYE), self_employed (freelancer), sme (small business), company';
COMMENT ON COLUMN public.user_preferences.registered_taxes IS 'Array of tax types user is registered for: VAT, CIT, PAYE, WHT, etc';
COMMENT ON COLUMN public.user_preferences.risk_level IS 'AI-assessed compliance risk level based on filing history';
COMMENT ON TABLE public.profile_learning_log IS 'Audit trail of how user profile was learned/updated';
-- =====================================================
-- V12: Compliance Automations - Scheduled Notifications
-- Morning briefings, weekly summaries, quarterly reviews
-- =====================================================

-- Enable pg_net extension for HTTP calls (required for cron jobs)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Note: pg_cron may not be available on all Supabase plans
-- Attempt to enable it, but wrap in exception handling
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available - use external scheduler instead';
END $$;

-- =====================================================
-- Cron jobs (only if pg_cron is available)
-- =====================================================
DO $$
BEGIN
  -- Morning Briefing - Daily at 8am WAT (7am UTC)
  PERFORM cron.schedule(
    'morning-compliance-briefing',
    '0 7 * * *',
    $job$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/compliance-automations',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{"type": "morning_briefing"}'::jsonb
    );
    $job$
  );

  -- Weekly Summary - Monday 9am WAT (8am UTC)
  PERFORM cron.schedule(
    'weekly-tax-summary',
    '0 8 * * 1',
    $job$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/compliance-automations',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{"type": "weekly_summary"}'::jsonb
    );
    $job$
  );

  -- Quarterly Review - 1st of Jan, Apr, Jul, Oct at 9am WAT
  PERFORM cron.schedule(
    'quarterly-tax-review',
    '0 8 1 1,4,7,10 *',
    $job$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/compliance-automations',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{"type": "quarterly_review"}'::jsonb
    );
    $job$
  );

  RAISE NOTICE 'Cron jobs scheduled successfully';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available - use external scheduler to call compliance-automations endpoint';
END $$;

-- =====================================================
-- Add notification type tracking
-- =====================================================
ALTER TABLE IF EXISTS public.notification_history 
ADD COLUMN IF NOT EXISTS automation_type TEXT;

COMMENT ON COLUMN public.notification_history.automation_type IS 'Type of automated notification: morning_briefing, weekly_summary, quarterly_review';
-- =====================================================
-- V12: Compliance Automations - Scheduled Notifications
-- Morning briefings, weekly summaries, quarterly reviews
-- =====================================================

-- Enable pg_net extension for HTTP calls (required for cron jobs)
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =====================================================
-- Morning Briefing - Daily at 8am WAT (7am UTC)
-- =====================================================
SELECT cron.schedule(
  'morning-compliance-briefing',
  '0 7 * * *',  -- 7am UTC = 8am WAT
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/compliance-automations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{"type": "morning_briefing"}'::jsonb
  );
  $$
);

-- =====================================================
-- Weekly Summary - Monday 9am WAT (8am UTC)
-- =====================================================
SELECT cron.schedule(
  'weekly-tax-summary',
  '0 8 * * 1',  -- 8am UTC Monday = 9am WAT
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/compliance-automations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{"type": "weekly_summary"}'::jsonb
  );
  $$
);

-- =====================================================
-- Quarterly Review - 1st of Jan, Apr, Jul, Oct at 9am WAT
-- =====================================================
SELECT cron.schedule(
  'quarterly-tax-review',
  '0 8 1 1,4,7,10 *',  -- 8am UTC on 1st of quarter months
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/compliance-automations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{"type": "quarterly_review"}'::jsonb
  );
  $$
);

-- =====================================================
-- Add automation notification types
-- =====================================================
-- Add new notification types to the compliance_notifications table if constraint exists
DO $$
BEGIN
  -- Check if we can add to existing constraint, if not just proceed
  -- The edge function will work regardless
  NULL;
END $$;

-- =====================================================
-- Documentation
-- =====================================================
COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL - powers V12 compliance automations';

-- Note: pg_cron may not be available on all Supabase plans
-- If not available, use external scheduler to call:
--   POST /functions/v1/compliance-automations?type=morning_briefing
--   POST /functions/v1/compliance-automations?type=weekly_summary  
--   POST /functions/v1/compliance-automations?type=quarterly_review
-- =====================================================
-- V17: Historical Tax Rules Support
-- Enables correct tax calculations for 2024/2025 filings
-- using pre-2026 (PITA 2011) rules
-- =====================================================

-- =====================================================
-- 1. Schema Enhancements
-- =====================================================

-- Add tax regime and law reference columns
ALTER TABLE compliance_rules 
ADD COLUMN IF NOT EXISTS tax_regime TEXT CHECK (tax_regime IN ('pre_2026', '2026_act', 'universal')),
ADD COLUMN IF NOT EXISTS law_reference TEXT;

-- Index for efficient tax year lookups
CREATE INDEX IF NOT EXISTS idx_rules_effective_dates 
ON compliance_rules(rule_type, effective_from, effective_to);

-- =====================================================
-- 2. Update Rule Lookup Function
-- =====================================================

CREATE OR REPLACE FUNCTION get_active_rules_for_type(
    p_rule_type TEXT,
    p_tax_year INTEGER DEFAULT NULL
)
RETURNS SETOF compliance_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_year INTEGER;
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    v_year := COALESCE(p_tax_year, EXTRACT(YEAR FROM NOW())::INTEGER);
    v_start_date := make_date(v_year, 1, 1);
    v_end_date := make_date(v_year, 12, 31);
    
    RETURN QUERY
    SELECT * FROM compliance_rules
    WHERE rule_type = p_rule_type
      AND is_active = true
      AND effective_from <= v_end_date
      AND (effective_to IS NULL OR effective_to >= v_start_date)
    ORDER BY effective_from DESC;
END;
$$;

-- =====================================================
-- 3. Pre-2026 Tax Rules (PITA 2011 era)
-- Using valid rule_types from CHECK constraint
-- =====================================================

-- Personal Income Tax Bands (PITA 2011) - using 'tax_band'
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('PIT_BAND_1_PRE2026', 'PIT Band 1 (Pre-2026)', 'tax_band', '{"band": 1, "min": 0, "max": 300000, "rate": 0.07, "tax_type": "pit"}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 Sixth Schedule', true),
('PIT_BAND_2_PRE2026', 'PIT Band 2 (Pre-2026)', 'tax_band', '{"band": 2, "min": 300001, "max": 600000, "rate": 0.11, "tax_type": "pit"}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 Sixth Schedule', true),
('PIT_BAND_3_PRE2026', 'PIT Band 3 (Pre-2026)', 'tax_band', '{"band": 3, "min": 600001, "max": 1100000, "rate": 0.15, "tax_type": "pit"}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 Sixth Schedule', true),
('PIT_BAND_4_PRE2026', 'PIT Band 4 (Pre-2026)', 'tax_band', '{"band": 4, "min": 1100001, "max": 1600000, "rate": 0.19, "tax_type": "pit"}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 Sixth Schedule', true),
('PIT_BAND_5_PRE2026', 'PIT Band 5 (Pre-2026)', 'tax_band', '{"band": 5, "min": 1600001, "max": 3200000, "rate": 0.21, "tax_type": "pit"}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 Sixth Schedule', true),
('PIT_BAND_6_PRE2026', 'PIT Band 6 (Pre-2026)', 'tax_band', '{"band": 6, "min": 3200001, "max": null, "rate": 0.24, "tax_type": "pit"}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 Sixth Schedule', true)
ON CONFLICT (rule_code) DO NOTHING;

-- Consolidated Relief Allowance (PITA 2011) - using 'relief'
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('CRA_FIXED_PRE2026', 'CRA Fixed Amount (Pre-2026)', 'relief', '{"type": "fixed_or_percent", "fixed": 200000, "percent_of_gross": 0.01, "use_higher": true}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 s.33(1)', true),
('CRA_PERCENT_PRE2026', 'CRA 20% Gross (Pre-2026)', 'relief', '{"type": "percentage", "rate": 0.20, "of": "gross_income"}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 s.33(2)', true)
ON CONFLICT (rule_code) DO NOTHING;

-- Minimum Tax (Pre-2026) - using 'threshold'
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('MIN_TAX_PRE2026', 'Minimum Tax (Pre-2026)', 'threshold', '{"rate": 0.01, "of": "gross_income", "threshold_type": "minimum_tax"}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 s.33(4)', true)
ON CONFLICT (rule_code) DO NOTHING;

-- VAT Rate (Pre-2026: 7.5% since Feb 2020)
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('VAT_RATE_PRE2026', 'VAT Standard Rate 7.5% (Pre-2026)', 'vat_rate', '{"rate": 0.075}', '2020-02-01', '2025-12-31', 'pre_2026', 'Finance Act 2019', true)
ON CONFLICT (rule_code) DO NOTHING;

-- CIT Rates (Pre-2026) - using 'tax_rate'
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('CIT_SMALL_PRE2026', 'CIT Small Company 0% (Pre-2026)', 'tax_rate', '{"tier": "small", "min_turnover": 0, "max_turnover": 25000000, "rate": 0, "tax_type": "cit"}', '2020-01-01', '2025-12-31', 'pre_2026', 'Finance Act 2019', true),
('CIT_MEDIUM_PRE2026', 'CIT Medium Company 20% (Pre-2026)', 'tax_rate', '{"tier": "medium", "min_turnover": 25000001, "max_turnover": 100000000, "rate": 0.20, "tax_type": "cit"}', '2020-01-01', '2025-12-31', 'pre_2026', 'Finance Act 2019', true),
('CIT_LARGE_PRE2026', 'CIT Large Company 30% (Pre-2026)', 'tax_rate', '{"tier": "large", "min_turnover": 100000001, "max_turnover": null, "rate": 0.30, "tax_type": "cit"}', '2020-01-01', '2025-12-31', 'pre_2026', 'Finance Act 2019', true)
ON CONFLICT (rule_code) DO NOTHING;

-- WHT Rates (Pre-2026) - using 'tax_rate'
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('WHT_DIVIDENDS_PRE2026', 'WHT Dividends 10% (Pre-2026)', 'tax_rate', '{"category": "dividends", "rate": 0.10, "tax_type": "wht"}', '1993-01-01', '2025-12-31', 'pre_2026', 'CITA s.80', true),
('WHT_RENT_PRE2026', 'WHT Rent 10% (Pre-2026)', 'tax_rate', '{"category": "rent", "rate": 0.10, "tax_type": "wht"}', '1993-01-01', '2025-12-31', 'pre_2026', 'WHT Regulations', true),
('WHT_PROFESSIONAL_PRE2026', 'WHT Professional Services 10% (Pre-2026)', 'tax_rate', '{"category": "professional", "rate": 0.10, "tax_type": "wht"}', '1993-01-01', '2025-12-31', 'pre_2026', 'WHT Regulations', true),
('WHT_CONTRACTS_PRE2026', 'WHT Contracts 5% (Pre-2026)', 'tax_rate', '{"category": "contracts", "rate": 0.05, "tax_type": "wht"}', '1993-01-01', '2025-12-31', 'pre_2026', 'WHT Regulations', true),
('WHT_DIRECTORS_PRE2026', 'WHT Directors Fees 10% (Pre-2026)', 'tax_rate', '{"category": "directors_fees", "rate": 0.10, "tax_type": "wht"}', '1993-01-01', '2025-12-31', 'pre_2026', 'WHT Regulations', true)
ON CONFLICT (rule_code) DO NOTHING;

-- Capital Gains Tax (Pre-2026) - using 'tax_rate'
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('CGT_RATE_PRE2026', 'CGT Rate 10% (Pre-2026)', 'tax_rate', '{"rate": 0.10, "tax_type": "cgt"}', '1967-01-01', '2025-12-31', 'pre_2026', 'CGTA s.2', true)
ON CONFLICT (rule_code) DO NOTHING;

-- Tertiary Education Tax (Pre-2026) - using 'tax_rate'
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('TET_RATE_PRE2026', 'TET Rate 2.5% (Pre-2026)', 'tax_rate', '{"rate": 0.025, "of": "assessable_profit", "tax_type": "tet"}', '2011-01-01', '2025-12-31', 'pre_2026', 'TET Fund Act', true)
ON CONFLICT (rule_code) DO NOTHING;

-- Stamp Duty Electronic Transfer (Pre-2026) - using 'threshold'
INSERT INTO compliance_rules (rule_code, rule_name, rule_type, parameters, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('STAMP_DUTY_ELECTRONIC_PRE2026', 'Stamp Duty ₦50 Electronic (Pre-2026)', 'threshold', '{"type": "electronic_transfer", "amount": 50, "threshold": 10000, "tax_type": "stamp_duty"}', '2020-01-01', '2025-12-31', 'pre_2026', 'Stamp Duties Act', true)
ON CONFLICT (rule_code) DO NOTHING;

-- =====================================================
-- 4. Mark existing 2026 rules with tax_regime
-- =====================================================

UPDATE compliance_rules 
SET tax_regime = '2026_act'
WHERE tax_regime IS NULL 
  AND effective_from >= '2026-01-01';

-- =====================================================
-- 5. Comments
-- =====================================================

COMMENT ON COLUMN compliance_rules.tax_regime IS 'Tax regime: pre_2026 (PITA 2011 era), 2026_act (Nigeria Tax Act), universal (applies to all)';
COMMENT ON COLUMN compliance_rules.law_reference IS 'Legal citation, e.g., "PITA 2011 s.33(1)"';
-- =====================================================
-- V17: Historical Tax Rules Support
-- Enables correct tax calculations for 2024/2025 filings
-- using pre-2026 (PITA 2011) rules
-- =====================================================

-- =====================================================
-- 1. Schema Enhancements
-- =====================================================

-- Add tax regime and law reference columns
ALTER TABLE compliance_rules 
ADD COLUMN IF NOT EXISTS tax_regime TEXT CHECK (tax_regime IN ('pre_2026', '2026_act', 'universal')),
ADD COLUMN IF NOT EXISTS law_reference TEXT;

-- Add tax_year to transactions for proper year assignment
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS tax_year INTEGER;

-- Backfill existing transactions
UPDATE transactions 
SET tax_year = EXTRACT(YEAR FROM transaction_date)::INTEGER
WHERE tax_year IS NULL AND transaction_date IS NOT NULL;

-- Index for efficient tax year lookups
CREATE INDEX IF NOT EXISTS idx_rules_effective_dates 
ON compliance_rules(rule_type, effective_from, effective_to);

CREATE INDEX IF NOT EXISTS idx_transactions_tax_year 
ON transactions(user_id, tax_year);

-- =====================================================
-- 2. Update Rule Lookup Function
-- =====================================================

CREATE OR REPLACE FUNCTION get_active_rules_for_type(
    p_rule_type TEXT,
    p_tax_year INTEGER DEFAULT NULL
)
RETURNS SETOF compliance_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_year INTEGER;
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    -- Default to current year if not specified
    v_year := COALESCE(p_tax_year, EXTRACT(YEAR FROM NOW())::INTEGER);
    v_start_date := make_date(v_year, 1, 1);
    v_end_date := make_date(v_year, 12, 31);
    
    RETURN QUERY
    SELECT * FROM compliance_rules
    WHERE rule_type = p_rule_type
      AND is_active = true
      AND effective_from <= v_end_date
      AND (effective_to IS NULL OR effective_to >= v_start_date)
    ORDER BY effective_from DESC;
END;
$$;

-- =====================================================
-- 3. Pre-2026 Tax Rules (PITA 2011 era)
-- =====================================================

-- Personal Income Tax Bands (PITA 2011)
INSERT INTO compliance_rules (rule_name, rule_type, rule_value, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('PIT Band 1 (Pre-2026)', 'pit_band', '{"band": 1, "min": 0, "max": 300000, "rate": 0.07}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 Sixth Schedule', true),
('PIT Band 2 (Pre-2026)', 'pit_band', '{"band": 2, "min": 300001, "max": 600000, "rate": 0.11}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 Sixth Schedule', true),
('PIT Band 3 (Pre-2026)', 'pit_band', '{"band": 3, "min": 600001, "max": 1100000, "rate": 0.15}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 Sixth Schedule', true),
('PIT Band 4 (Pre-2026)', 'pit_band', '{"band": 4, "min": 1100001, "max": 1600000, "rate": 0.19}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 Sixth Schedule', true),
('PIT Band 5 (Pre-2026)', 'pit_band', '{"band": 5, "min": 1600001, "max": 3200000, "rate": 0.21}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 Sixth Schedule', true),
('PIT Band 6 (Pre-2026)', 'pit_band', '{"band": 6, "min": 3200001, "max": null, "rate": 0.24}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 Sixth Schedule', true)
ON CONFLICT DO NOTHING;

-- Consolidated Relief Allowance (PITA 2011)
INSERT INTO compliance_rules (rule_name, rule_type, rule_value, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('CRA Fixed Amount (Pre-2026)', 'cra', '{"type": "fixed_or_percent", "fixed": 200000, "percent_of_gross": 0.01, "use_higher": true}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 s.33(1)', true),
('CRA 20% Gross (Pre-2026)', 'cra', '{"type": "percentage", "rate": 0.20, "of": "gross_income"}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 s.33(2)', true)
ON CONFLICT DO NOTHING;

-- Minimum Tax (Pre-2026): 1% of gross income
INSERT INTO compliance_rules (rule_name, rule_type, rule_value, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('Minimum Tax (Pre-2026)', 'minimum_tax', '{"rate": 0.01, "of": "gross_income"}', '2011-06-01', '2025-12-31', 'pre_2026', 'PITA 2011 s.33(4)', true)
ON CONFLICT DO NOTHING;

-- VAT Rate (Pre-2026: 7.5% since Feb 2020)
INSERT INTO compliance_rules (rule_name, rule_type, rule_value, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('VAT Standard Rate 7.5% (Pre-2026)', 'vat_rate', '{"rate": 0.075}', '2020-02-01', '2025-12-31', 'pre_2026', 'Finance Act 2019', true)
ON CONFLICT DO NOTHING;

-- CIT Rates (Pre-2026: Tiered by turnover)
INSERT INTO compliance_rules (rule_name, rule_type, rule_value, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('CIT Small Company 0% (Pre-2026)', 'cit_rate', '{"tier": "small", "min_turnover": 0, "max_turnover": 25000000, "rate": 0}', '2020-01-01', '2025-12-31', 'pre_2026', 'Finance Act 2019', true),
('CIT Medium Company 20% (Pre-2026)', 'cit_rate', '{"tier": "medium", "min_turnover": 25000001, "max_turnover": 100000000, "rate": 0.20}', '2020-01-01', '2025-12-31', 'pre_2026', 'Finance Act 2019', true),
('CIT Large Company 30% (Pre-2026)', 'cit_rate', '{"tier": "large", "min_turnover": 100000001, "max_turnover": null, "rate": 0.30}', '2020-01-01', '2025-12-31', 'pre_2026', 'Finance Act 2019', true)
ON CONFLICT DO NOTHING;

-- WHT Rates (Pre-2026)
INSERT INTO compliance_rules (rule_name, rule_type, rule_value, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('WHT Dividends 10% (Pre-2026)', 'wht_rate', '{"category": "dividends", "rate": 0.10}', '1993-01-01', '2025-12-31', 'pre_2026', 'CITA s.80', true),
('WHT Rent 10% (Pre-2026)', 'wht_rate', '{"category": "rent", "rate": 0.10}', '1993-01-01', '2025-12-31', 'pre_2026', 'WHT Regulations', true),
('WHT Professional Services 10% (Pre-2026)', 'wht_rate', '{"category": "professional", "rate": 0.10}', '1993-01-01', '2025-12-31', 'pre_2026', 'WHT Regulations', true),
('WHT Contracts 5% (Pre-2026)', 'wht_rate', '{"category": "contracts", "rate": 0.05}', '1993-01-01', '2025-12-31', 'pre_2026', 'WHT Regulations', true),
('WHT Directors Fees 10% (Pre-2026)', 'wht_rate', '{"category": "directors_fees", "rate": 0.10}', '1993-01-01', '2025-12-31', 'pre_2026', 'WHT Regulations', true)
ON CONFLICT DO NOTHING;

-- Capital Gains Tax (Pre-2026)
INSERT INTO compliance_rules (rule_name, rule_type, rule_value, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('CGT Rate 10% (Pre-2026)', 'cgt_rate', '{"rate": 0.10}', '1967-01-01', '2025-12-31', 'pre_2026', 'CGTA s.2', true)
ON CONFLICT DO NOTHING;

-- Tertiary Education Tax (Pre-2026)
INSERT INTO compliance_rules (rule_name, rule_type, rule_value, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('TET Rate 2.5% (Pre-2026)', 'tet_rate', '{"rate": 0.025, "of": "assessable_profit"}', '2011-01-01', '2025-12-31', 'pre_2026', 'TET Fund Act', true)
ON CONFLICT DO NOTHING;

-- Stamp Duty Electronic Transfer (Pre-2026)
INSERT INTO compliance_rules (rule_name, rule_type, rule_value, effective_from, effective_to, tax_regime, law_reference, is_active) VALUES
('Stamp Duty ₦50 Electronic (Pre-2026)', 'stamp_duty', '{"type": "electronic_transfer", "amount": 50, "threshold": 10000}', '2020-01-01', '2025-12-31', 'pre_2026', 'Stamp Duties Act', true)
ON CONFLICT DO NOTHING;

-- =====================================================
-- 4. Mark existing 2026 rules with tax_regime
-- =====================================================

UPDATE compliance_rules 
SET tax_regime = '2026_act'
WHERE tax_regime IS NULL 
  AND effective_from >= '2026-01-01';

-- =====================================================
-- 5. Comments
-- =====================================================

COMMENT ON COLUMN compliance_rules.tax_regime IS 'Tax regime: pre_2026 (PITA 2011 era), 2026_act (Nigeria Tax Act), universal (applies to all)';
COMMENT ON COLUMN compliance_rules.law_reference IS 'Legal citation, e.g., "PITA 2011 s.33(1)"';
COMMENT ON COLUMN transactions.tax_year IS 'Tax year for this transaction, used for correct rule application';
-- V20: Calendar Layer - Upcoming Deadlines Skill
-- Drop old function signatures first, then create the new unified version

-- Drop old function (INT, INT signature)
DROP FUNCTION IF EXISTS public.get_upcoming_deadlines(INT, INT);

-- Drop another old function (no args or different args)
DROP FUNCTION IF EXISTS public.get_upcoming_deadlines();

-- Now create the new function with UUID, INT signature
CREATE OR REPLACE FUNCTION public.get_upcoming_deadlines(
    p_user_id UUID DEFAULT NULL,
    p_days_ahead INT DEFAULT 30
)
RETURNS TABLE (
    deadline_id UUID,
    deadline_type TEXT,
    title TEXT,
    description TEXT,
    due_date DATE,
    days_until INT,
    is_filed BOOLEAN,
    urgency TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_end_date DATE := CURRENT_DATE + p_days_ahead;
BEGIN
    RETURN QUERY
    WITH upcoming AS (
        SELECT 
            td.id,
            td.deadline_type::TEXT,
            td.title::TEXT,
            td.description::TEXT,
            CASE 
                WHEN td.specific_date IS NOT NULL THEN td.specific_date
                WHEN td.recurrence = 'monthly' THEN 
                    CASE 
                        WHEN td.day_of_month >= EXTRACT(DAY FROM v_today)::INT 
                        THEN DATE_TRUNC('month', v_today)::DATE + (td.day_of_month - 1)
                        ELSE (DATE_TRUNC('month', v_today) + INTERVAL '1 month')::DATE + (td.day_of_month - 1)
                    END
                WHEN td.recurrence = 'annual' THEN
                    MAKE_DATE(
                        CASE 
                            WHEN MAKE_DATE(EXTRACT(YEAR FROM v_today)::INT, td.month_of_year, td.day_of_month) >= v_today 
                            THEN EXTRACT(YEAR FROM v_today)::INT
                            ELSE EXTRACT(YEAR FROM v_today)::INT + 1
                        END,
                        td.month_of_year,
                        td.day_of_month
                    )
                ELSE v_today
            END::DATE as next_due
        FROM public.tax_deadlines td
        WHERE td.is_active = true
    )
    SELECT 
        u.id as deadline_id,
        u.deadline_type,
        u.title,
        u.description,
        u.next_due as due_date,
        (u.next_due - v_today)::INT as days_until,
        FALSE as is_filed,
        CASE 
            WHEN (u.next_due - v_today) <= 3 THEN 'critical'
            WHEN (u.next_due - v_today) <= 7 THEN 'high'
            WHEN (u.next_due - v_today) <= 14 THEN 'medium'
            ELSE 'low'
        END::TEXT as urgency
    FROM upcoming u
    WHERE u.next_due BETWEEN v_today AND v_end_date
    ORDER BY u.next_due ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_upcoming_deadlines(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_upcoming_deadlines(UUID, INT) TO service_role;

COMMENT ON FUNCTION public.get_upcoming_deadlines(UUID, INT) IS 
  'V20 Calendar Skill: Returns upcoming tax deadlines with urgency levels. Powers AI responses to "What is due?"';
-- V21: Financial Layer - Transaction & Invoice Summary Skills
-- Powers AI ability to answer questions about user's financial status

-- Function: Get transaction summary for last N days
CREATE OR REPLACE FUNCTION public.get_transaction_summary(
    p_user_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    total_income NUMERIC,
    total_expenses NUMERIC,
    transaction_count INT,
    top_expense_category TEXT,
    top_income_category TEXT,
    emtl_total NUMERIC,
    vat_total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_start_date DATE := CURRENT_DATE - p_days;
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(bt.credit), 0)::NUMERIC as total_income,
        COALESCE(SUM(bt.debit), 0)::NUMERIC as total_expenses,
        COUNT(*)::INT as transaction_count,
        (SELECT bt2.category::TEXT FROM bank_transactions bt2 
         WHERE bt2.user_id = p_user_id 
         AND bt2.is_expense = true 
         AND bt2.transaction_date >= v_start_date
         GROUP BY bt2.category ORDER BY SUM(bt2.debit) DESC LIMIT 1) as top_expense_category,
        (SELECT bt3.category::TEXT FROM bank_transactions bt3 
         WHERE bt3.user_id = p_user_id 
         AND bt3.is_revenue = true 
         AND bt3.transaction_date >= v_start_date
         GROUP BY bt3.category ORDER BY SUM(bt3.credit) DESC LIMIT 1) as top_income_category,
        COALESCE(SUM(CASE WHEN bt.is_emtl THEN bt.debit ELSE 0 END), 0)::NUMERIC as emtl_total,
        COALESCE(SUM(bt.vat_amount), 0)::NUMERIC as vat_total
    FROM public.bank_transactions bt
    WHERE bt.user_id = p_user_id
    AND bt.transaction_date >= v_start_date;
END;
$$;

-- Function: Get invoice status summary
CREATE OR REPLACE FUNCTION public.get_invoice_summary(
    p_user_id UUID
)
RETURNS TABLE (
    total_invoices INT,
    pending_count INT,
    paid_count INT,
    overdue_count INT,
    pending_amount NUMERIC,
    paid_amount NUMERIC,
    overdue_amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INT as total_invoices,
        COUNT(*) FILTER (WHERE i.status = 'pending_remittance')::INT as pending_count,
        COUNT(*) FILTER (WHERE i.status = 'remitted')::INT as paid_count,
        0::INT as overdue_count,
        COALESCE(SUM(i.total) FILTER (WHERE i.status = 'pending_remittance'), 0)::NUMERIC as pending_amount,
        COALESCE(SUM(i.total) FILTER (WHERE i.status = 'remitted'), 0)::NUMERIC as paid_amount,
        0::NUMERIC as overdue_amount
    FROM public.invoices i
    WHERE i.user_id = p_user_id;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.get_transaction_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_transaction_summary TO service_role;
GRANT EXECUTE ON FUNCTION public.get_invoice_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoice_summary TO service_role;

COMMENT ON FUNCTION public.get_transaction_summary IS 'V21 Financial Skill: Returns 30-day transaction summary for AI context';
COMMENT ON FUNCTION public.get_invoice_summary IS 'V21 Financial Skill: Returns invoice status summary for AI context';
-- V24: Project Intelligence - Project Summary Skill
-- Powers AI ability to answer questions about user's project status and budget

CREATE OR REPLACE FUNCTION public.get_project_summary(
    p_user_id UUID
)
RETURNS TABLE (
    total_projects INT,
    active_count INT,
    completed_count INT,
    total_budget NUMERIC,
    total_spent NUMERIC,
    budget_remaining NUMERIC,
    budget_utilization NUMERIC,
    top_project_name TEXT,
    top_project_spent NUMERIC,
    top_project_remaining NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    WITH project_stats AS (
        SELECT 
            p.id,
            p.name,
            p.budget,
            p.spent,
            p.status,
            (p.budget - p.spent) as remaining
        FROM public.projects p
        WHERE p.user_id = p_user_id
    ),
    top_active AS (
        SELECT name, spent, remaining
        FROM project_stats
        WHERE status = 'active'
        ORDER BY budget DESC
        LIMIT 1
    )
    SELECT
        COUNT(*)::INT as total_projects,
        COUNT(*) FILTER (WHERE ps.status = 'active')::INT as active_count,
        COUNT(*) FILTER (WHERE ps.status = 'completed')::INT as completed_count,
        COALESCE(SUM(ps.budget), 0)::NUMERIC as total_budget,
        COALESCE(SUM(ps.spent), 0)::NUMERIC as total_spent,
        COALESCE(SUM(ps.remaining), 0)::NUMERIC as budget_remaining,
        CASE 
            WHEN SUM(ps.budget) > 0 THEN ROUND((SUM(ps.spent) / SUM(ps.budget)) * 100, 1)
            ELSE 0 
        END::NUMERIC as budget_utilization,
        (SELECT ta.name FROM top_active ta LIMIT 1)::TEXT as top_project_name,
        (SELECT ta.spent FROM top_active ta LIMIT 1)::NUMERIC as top_project_spent,
        (SELECT ta.remaining FROM top_active ta LIMIT 1)::NUMERIC as top_project_remaining
    FROM project_stats ps;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.get_project_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_summary TO service_role;

COMMENT ON FUNCTION public.get_project_summary IS 'V24 Project Intelligence: Returns project summary with budget utilization for AI context';
-- V26: Inventory & Liability Layer
-- Enables inventory tracking, accounts payable, and COGS calculation

-- ============= Inventory Tables =============

CREATE TABLE IF NOT EXISTS public.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES public.businesses(id),
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    description TEXT,
    category VARCHAR(100),
    quantity_on_hand DECIMAL(15,2) DEFAULT 0,
    unit_of_measure VARCHAR(50) DEFAULT 'units',
    reorder_level DECIMAL(15,2) DEFAULT 0,
    unit_cost DECIMAL(15,2) NOT NULL,
    total_value DECIMAL(15,2) GENERATED ALWAYS AS (quantity_on_hand * unit_cost) STORED,
    selling_price DECIMAL(15,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('purchase', 'sale', 'adjustment', 'return')),
    quantity DECIMAL(15,2) NOT NULL,
    unit_cost DECIMAL(15,2),
    total_cost DECIMAL(15,2),
    reference_type VARCHAR(50),
    reference_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============= Project Columns =============

ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS accounts_payable DECIMAL(15,2) DEFAULT 0;

ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS accounts_receivable DECIMAL(15,2) DEFAULT 0;

-- ============= Accounts Payable Table =============

CREATE TABLE IF NOT EXISTS public.accounts_payable (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id),
    vendor_name VARCHAR(255) NOT NULL,
    vendor_tin VARCHAR(20),
    invoice_number VARCHAR(100),
    invoice_date DATE NOT NULL,
    due_date DATE,
    amount DECIMAL(15,2) NOT NULL,
    vat_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) NOT NULL,
    amount_paid DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
    payment_date DATE,
    payment_reference VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============= Indexes =============

CREATE INDEX IF NOT EXISTS idx_inventory_items_user ON public.inventory_items(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_sku ON public.inventory_items(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item ON public.inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_type ON public.inventory_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_user ON public.accounts_payable(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_status ON public.accounts_payable(status);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_project ON public.accounts_payable(project_id) WHERE project_id IS NOT NULL;

-- ============= RLS Policies =============

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own inventory" ON public.inventory_items;
CREATE POLICY "Users can view their own inventory" ON public.inventory_items
FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can manage their own inventory" ON public.inventory_items;
CREATE POLICY "Users can manage their own inventory" ON public.inventory_items
FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view their own transactions" ON public.inventory_transactions;
CREATE POLICY "Users can view their own transactions" ON public.inventory_transactions
FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can manage their own transactions" ON public.inventory_transactions;
CREATE POLICY "Users can manage their own transactions" ON public.inventory_transactions
FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view their own payables" ON public.accounts_payable;
CREATE POLICY "Users can view their own payables" ON public.accounts_payable
FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can manage their own payables" ON public.accounts_payable;
CREATE POLICY "Users can manage their own payables" ON public.accounts_payable
FOR ALL USING (user_id = auth.uid());

-- ============= Triggers =============

CREATE OR REPLACE FUNCTION public.update_inventory_on_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.inventory_items
        SET quantity_on_hand = quantity_on_hand + 
            CASE 
                WHEN NEW.transaction_type IN ('purchase', 'return') THEN NEW.quantity
                WHEN NEW.transaction_type IN ('sale', 'adjustment') THEN -NEW.quantity
                ELSE 0
            END,
            updated_at = NOW()
        WHERE id = NEW.item_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_inventory_quantity ON public.inventory_transactions;
CREATE TRIGGER update_inventory_quantity
AFTER INSERT ON public.inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_inventory_on_transaction();

CREATE OR REPLACE FUNCTION public.update_project_payables()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.project_id IS NOT NULL THEN
        UPDATE public.projects
        SET accounts_payable = (
            SELECT COALESCE(SUM(total_amount - amount_paid), 0)
            FROM public.accounts_payable
            WHERE project_id = NEW.project_id AND status != 'paid'
        ),
        updated_at = NOW()
        WHERE id = NEW.project_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_project_payables_on_change ON public.accounts_payable;
CREATE TRIGGER update_project_payables_on_change
AFTER INSERT OR UPDATE ON public.accounts_payable
FOR EACH ROW
EXECUTE FUNCTION public.update_project_payables();

-- ============= AI Context Functions =============

CREATE OR REPLACE FUNCTION public.get_inventory_summary(
    p_user_id UUID
)
RETURNS TABLE (
    total_items INT,
    total_value NUMERIC,
    low_stock_count INT,
    total_purchases_30d NUMERIC,
    total_sales_30d NUMERIC,
    cogs_30d NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_30d_ago DATE := CURRENT_DATE - 30;
BEGIN
    RETURN QUERY
    WITH inventory_stats AS (
        SELECT 
            COUNT(*)::INT as item_count,
            COALESCE(SUM(ii.total_value), 0) as inventory_value,
            COUNT(*) FILTER (WHERE ii.quantity_on_hand <= ii.reorder_level)::INT as low_stock
        FROM public.inventory_items ii
        WHERE ii.user_id = p_user_id AND ii.is_active = true
    ),
    transaction_stats AS (
        SELECT
            COALESCE(SUM(it.total_cost) FILTER (WHERE it.transaction_type = 'purchase'), 0) as purchases,
            COALESCE(SUM(it.total_cost) FILTER (WHERE it.transaction_type = 'sale'), 0) as sales
        FROM public.inventory_transactions it
        WHERE it.user_id = p_user_id AND it.created_at >= v_30d_ago
    )
    SELECT
        is_stats.item_count as total_items,
        is_stats.inventory_value as total_value,
        is_stats.low_stock as low_stock_count,
        ts.purchases as total_purchases_30d,
        ts.sales as total_sales_30d,
        ts.sales as cogs_30d
    FROM inventory_stats is_stats, transaction_stats ts;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_payables_summary(
    p_user_id UUID
)
RETURNS TABLE (
    total_payables INT,
    total_amount_due NUMERIC,
    overdue_count INT,
    overdue_amount NUMERIC,
    due_within_7_days INT,
    due_within_7_days_amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INT as total_payables,
        COALESCE(SUM(ap.total_amount - ap.amount_paid), 0)::NUMERIC as total_amount_due,
        COUNT(*) FILTER (WHERE ap.due_date < CURRENT_DATE AND ap.status != 'paid')::INT as overdue_count,
        COALESCE(SUM(ap.total_amount - ap.amount_paid) FILTER (WHERE ap.due_date < CURRENT_DATE AND ap.status != 'paid'), 0)::NUMERIC as overdue_amount,
        COUNT(*) FILTER (WHERE ap.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND ap.status != 'paid')::INT as due_within_7_days,
        COALESCE(SUM(ap.total_amount - ap.amount_paid) FILTER (WHERE ap.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND ap.status != 'paid'), 0)::NUMERIC as due_within_7_days_amount
    FROM public.accounts_payable ap
    WHERE ap.user_id = p_user_id AND ap.status != 'paid';
END;
$$;

-- ============= Grants =============

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts_payable TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_summary TO service_role;
GRANT EXECUTE ON FUNCTION public.get_payables_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payables_summary TO service_role;

COMMENT ON TABLE public.inventory_items IS 'V26: Inventory tracking for COGS calculation';
COMMENT ON TABLE public.accounts_payable IS 'V26: Accounts payable tracking for liability management';
COMMENT ON FUNCTION public.get_inventory_summary IS 'V26: Returns inventory summary for AI context';
COMMENT ON FUNCTION public.get_payables_summary IS 'V26: Returns accounts payable summary for AI context';
-- V26b: Inventory Accuracy & Accounting Basis
-- Refines COGS calculation and introduces tax accounting basics

-- ============= Schema Enhancements =============

-- Add accounting basis to user tax profiles
ALTER TABLE public.user_tax_profiles 
ADD COLUMN IF NOT EXISTS accounting_basis VARCHAR(10) DEFAULT 'cash' CHECK (accounting_basis IN ('cash', 'accrual'));

-- Set defaults based on user type
UPDATE public.user_tax_profiles 
SET accounting_basis = 'accrual' 
WHERE user_type IN ('business', 'partnership') AND accounting_basis = 'cash';

-- ============= AI Context Functions =============

-- Drop existing function to allow return type change
DROP FUNCTION IF EXISTS public.get_inventory_summary(UUID);

-- Refined get_inventory_summary that respects accounting basis
CREATE OR REPLACE FUNCTION public.get_inventory_summary(
    p_user_id UUID
)
RETURNS TABLE (
    total_items INT,
    total_value NUMERIC,
    low_stock_count INT,
    total_purchases_30d NUMERIC,
    total_sales_30d NUMERIC,
    cogs_paid_30d NUMERIC,
    cogs_incurred_30d NUMERIC,
    accounting_basis TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_30d_ago DATE := CURRENT_DATE - 30;
    v_basis TEXT;
BEGIN
    -- Get user's accounting basis
    SELECT COALESCE(tp.accounting_basis, 'cash') INTO v_basis
    FROM public.user_tax_profiles tp
    WHERE tp.user_id = p_user_id;

    RETURN QUERY
    WITH inventory_stats AS (
        SELECT 
            COUNT(*)::INT as item_count,
            COALESCE(SUM(ii.total_value), 0) as inventory_value,
            COUNT(*) FILTER (WHERE ii.quantity_on_hand <= ii.reorder_level)::INT as low_stock
        FROM public.inventory_items ii
        WHERE ii.user_id = p_user_id AND ii.is_active = true
    ),
    transaction_stats AS (
        SELECT
            -- Total purchases (accrual)
            COALESCE(SUM(it.total_cost) FILTER (WHERE it.transaction_type = 'purchase'), 0) as purchases_incurred,
            -- Purchases actually paid for (cash basis)
            COALESCE(SUM(it.total_cost) FILTER (
                WHERE it.transaction_type = 'purchase' 
                AND (it.reference_type = 'expense' OR it.notes ILIKE '%paid%')
            ), 0) as purchases_paid,
            -- Total sales cost (accrual basis COGS)
            COALESCE(SUM(it.total_cost) FILTER (WHERE it.transaction_type = 'sale'), 0) as sales_cost
        FROM public.inventory_transactions it
        WHERE it.user_id = p_user_id AND it.created_at >= v_30d_ago
    )
    SELECT
        is_stats.item_count as total_items,
        is_stats.inventory_value as total_value,
        is_stats.low_stock as low_stock_count,
        ts.purchases_incurred as total_purchases_30d,
        ts.sales_cost as total_sales_30d,
        ts.purchases_paid as cogs_paid_30d,
        ts.sales_cost as cogs_incurred_30d,
        v_basis as accounting_basis
    FROM inventory_stats is_stats, transaction_stats ts;
END;
$$;

-- ============= Grants =============

GRANT EXECUTE ON FUNCTION public.get_inventory_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_summary TO service_role;

-- ============= Comments =============

COMMENT ON COLUMN public.user_tax_profiles.accounting_basis IS 'Tax reporting basis: cash (standard for individuals) or accrual (standard for companies)';
COMMENT ON FUNCTION public.get_inventory_summary IS 'V26b: Refined summary distinguishing between cash and accrual COGS';
-- V20: Calendar Layer - Upcoming Deadlines Skill
-- This function powers the AI's ability to answer "What's due?"

CREATE OR REPLACE FUNCTION public.get_upcoming_deadlines(
    p_user_id UUID DEFAULT NULL,
    p_days_ahead INT DEFAULT 30
)
RETURNS TABLE (
    deadline_id UUID,
    deadline_type TEXT,
    title TEXT,
    description TEXT,
    due_date DATE,
    days_until INT,
    is_filed BOOLEAN,
    urgency TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_end_date DATE := CURRENT_DATE + p_days_ahead;
BEGIN
    RETURN QUERY
    WITH upcoming AS (
        SELECT 
            td.id,
            td.deadline_type::TEXT,
            td.title,
            td.description,
            -- Calculate next occurrence based on recurrence
            CASE 
                WHEN td.specific_date IS NOT NULL THEN td.specific_date
                WHEN td.recurrence = 'monthly' THEN 
                    CASE 
                        WHEN td.day_of_month >= EXTRACT(DAY FROM v_today)::INT 
                        THEN DATE_TRUNC('month', v_today) + (td.day_of_month - 1) * INTERVAL '1 day'
                        ELSE DATE_TRUNC('month', v_today + INTERVAL '1 month') + (td.day_of_month - 1) * INTERVAL '1 day'
                    END
                WHEN td.recurrence = 'annual' THEN
                    MAKE_DATE(
                        CASE 
                            WHEN MAKE_DATE(EXTRACT(YEAR FROM v_today)::INT, td.month_of_year, td.day_of_month) >= v_today 
                            THEN EXTRACT(YEAR FROM v_today)::INT
                            ELSE EXTRACT(YEAR FROM v_today)::INT + 1
                        END,
                        td.month_of_year,
                        td.day_of_month
                    )
                ELSE v_today
            END::DATE as next_due
        FROM public.tax_deadlines td
        WHERE td.is_active = true
    )
    SELECT 
        u.id as deadline_id,
        u.deadline_type,
        u.title,
        u.description,
        u.next_due as due_date,
        (u.next_due - v_today)::INT as days_until,
        -- Check if user has filed (placeholder - can be expanded)
        FALSE as is_filed,
        CASE 
            WHEN (u.next_due - v_today) <= 3 THEN 'critical'
            WHEN (u.next_due - v_today) <= 7 THEN 'high'
            WHEN (u.next_due - v_today) <= 14 THEN 'medium'
            ELSE 'low'
        END as urgency
    FROM upcoming u
    WHERE u.next_due BETWEEN v_today AND v_end_date
    ORDER BY u.next_due ASC;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.get_upcoming_deadlines TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_upcoming_deadlines TO service_role;

COMMENT ON FUNCTION public.get_upcoming_deadlines IS 'V20 Calendar Skill: Returns upcoming tax deadlines with urgency levels. Powers AI responses to "What''s due?"';
-- V21: Financial Layer - Transaction & Invoice Summary Skills
-- Powers AI ability to answer questions about user's financial status

-- Function: Get transaction summary for last N days
CREATE OR REPLACE FUNCTION public.get_transaction_summary(
    p_user_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    total_income NUMERIC,
    total_expenses NUMERIC,
    transaction_count INT,
    top_expense_category TEXT,
    top_income_category TEXT,
    emtl_total NUMERIC,
    vat_total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_date DATE := CURRENT_DATE - p_days;
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(bt.credit), 0)::NUMERIC as total_income,
        COALESCE(SUM(bt.debit), 0)::NUMERIC as total_expenses,
        COUNT(*)::INT as transaction_count,
        (SELECT bt2.category FROM bank_transactions bt2 
         WHERE bt2.user_id = p_user_id 
         AND bt2.is_expense = true 
         AND bt2.transaction_date >= v_start_date
         GROUP BY bt2.category ORDER BY SUM(bt2.debit) DESC LIMIT 1) as top_expense_category,
        (SELECT bt3.category FROM bank_transactions bt3 
         WHERE bt3.user_id = p_user_id 
         AND bt3.is_revenue = true 
         AND bt3.transaction_date >= v_start_date
         GROUP BY bt3.category ORDER BY SUM(bt3.credit) DESC LIMIT 1) as top_income_category,
        COALESCE(SUM(CASE WHEN bt.is_emtl THEN bt.debit ELSE 0 END), 0)::NUMERIC as emtl_total,
        COALESCE(SUM(bt.vat_amount), 0)::NUMERIC as vat_total
    FROM public.bank_transactions bt
    WHERE bt.user_id = p_user_id
    AND bt.transaction_date >= v_start_date;
END;
$$;

-- Function: Get invoice status summary
-- Note: invoices table uses 'total' not 'total_amount', has no 'due_date' column
-- Status values: 'pending_remittance', 'remitted', etc.
CREATE OR REPLACE FUNCTION public.get_invoice_summary(
    p_user_id UUID
)
RETURNS TABLE (
    total_invoices INT,
    pending_count INT,
    paid_count INT,
    overdue_count INT,
    pending_amount NUMERIC,
    paid_amount NUMERIC,
    overdue_amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INT as total_invoices,
        COUNT(*) FILTER (WHERE i.status = 'pending_remittance')::INT as pending_count,
        COUNT(*) FILTER (WHERE i.status = 'remitted')::INT as paid_count,
        0::INT as overdue_count, -- No due_date column in invoices table
        COALESCE(SUM(i.total) FILTER (WHERE i.status = 'pending_remittance'), 0)::NUMERIC as pending_amount,
        COALESCE(SUM(i.total) FILTER (WHERE i.status = 'remitted'), 0)::NUMERIC as paid_amount,
        0::NUMERIC as overdue_amount -- No due_date column in invoices table
    FROM public.invoices i
    WHERE i.user_id = p_user_id;
END;
$$;


-- Grant access
GRANT EXECUTE ON FUNCTION public.get_transaction_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_transaction_summary TO service_role;
GRANT EXECUTE ON FUNCTION public.get_invoice_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoice_summary TO service_role;

COMMENT ON FUNCTION public.get_transaction_summary IS 'V21 Financial Skill: Returns 30-day transaction summary for AI context';
COMMENT ON FUNCTION public.get_invoice_summary IS 'V21 Financial Skill: Returns invoice status summary for AI context';
-- V24: Project Intelligence - Project Summary Skill
-- Powers AI ability to answer questions about user's projects and budgets

CREATE OR REPLACE FUNCTION public.get_project_summary(
    p_user_id UUID
)
RETURNS TABLE (
    total_projects INT,
    active_count INT,
    completed_count INT,
    total_budget NUMERIC,
    total_spent NUMERIC,
    budget_remaining NUMERIC,
    budget_utilization NUMERIC,
    top_project_name TEXT,
    top_project_spent NUMERIC,
    top_project_remaining NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH project_stats AS (
        SELECT 
            p.id,
            p.name,
            p.budget,
            p.spent,
            p.status,
            (p.budget - p.spent) as remaining
        FROM public.projects p
        WHERE p.user_id = p_user_id
    ),
    top_active AS (
        SELECT name, spent, remaining
        FROM project_stats
        WHERE status = 'active'
        ORDER BY budget DESC
        LIMIT 1
    )
    SELECT
        COUNT(*)::INT as total_projects,
        COUNT(*) FILTER (WHERE ps.status = 'active')::INT as active_count,
        COUNT(*) FILTER (WHERE ps.status = 'completed')::INT as completed_count,
        COALESCE(SUM(ps.budget), 0)::NUMERIC as total_budget,
        COALESCE(SUM(ps.spent), 0)::NUMERIC as total_spent,
        COALESCE(SUM(ps.remaining), 0)::NUMERIC as budget_remaining,
        CASE 
            WHEN SUM(ps.budget) > 0 THEN ROUND((SUM(ps.spent) / SUM(ps.budget)) * 100, 1)
            ELSE 0 
        END::NUMERIC as budget_utilization,
        (SELECT ta.name FROM top_active ta LIMIT 1) as top_project_name,
        (SELECT ta.spent FROM top_active ta LIMIT 1)::NUMERIC as top_project_spent,
        (SELECT ta.remaining FROM top_active ta LIMIT 1)::NUMERIC as top_project_remaining
    FROM project_stats ps;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.get_project_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_summary TO service_role;

COMMENT ON FUNCTION public.get_project_summary IS 'V24 Project Intelligence: Returns project summary with budget utilization for AI context';
-- V26b: Inventory Accuracy & Accounting Basis
-- Refines COGS calculation and introduces tax accounting basics

-- ============= Schema Enhancements =============

-- Add accounting basis to user tax profiles
ALTER TABLE public.user_tax_profiles 
ADD COLUMN IF NOT EXISTS accounting_basis VARCHAR(10) DEFAULT 'cash' CHECK (accounting_basis IN ('cash', 'accrual'));

-- Set defaults based on user type
UPDATE public.user_tax_profiles 
SET accounting_basis = 'accrual' 
WHERE user_type IN ('business', 'partnership') AND accounting_basis = 'cash';

-- ============= AI Context Functions =============

-- Refined get_inventory_summary that respects accounting basis
CREATE OR REPLACE FUNCTION public.get_inventory_summary(
    p_user_id UUID
)
RETURNS TABLE (
    total_items INT,
    total_value NUMERIC,
    low_stock_count INT,
    total_purchases_30d NUMERIC,
    total_sales_30d NUMERIC,
    cogs_paid_30d NUMERIC,
    cogs_incurred_30d NUMERIC,
    accounting_basis TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_30d_ago DATE := CURRENT_DATE - 30;
    v_basis TEXT;
BEGIN
    -- Get user's accounting basis
    SELECT COALESCE(tp.accounting_basis, 'cash') INTO v_basis
    FROM public.user_tax_profiles tp
    WHERE tp.user_id = p_user_id;

    RETURN QUERY
    WITH inventory_stats AS (
        SELECT 
            COUNT(*)::INT as item_count,
            COALESCE(SUM(ii.total_value), 0) as inventory_value,
            COUNT(*) FILTER (WHERE ii.quantity_on_hand <= ii.reorder_level)::INT as low_stock
        FROM public.inventory_items ii
        WHERE ii.user_id = p_user_id AND ii.is_active = true
    ),
    transaction_stats AS (
        SELECT
            -- Total purchases (accrual)
            COALESCE(SUM(it.total_cost) FILTER (WHERE it.transaction_type = 'purchase'), 0) as purchases_incurred,
            -- Purchases actually paid for (cash basis)
            COALESCE(SUM(it.total_cost) FILTER (
                WHERE it.transaction_type = 'purchase' 
                AND (it.reference_type = 'expense' OR it.notes ILIKE '%paid%')
            ), 0) as purchases_paid,
            -- Total sales cost (accrual basis COGS)
            COALESCE(SUM(it.total_cost) FILTER (WHERE it.transaction_type = 'sale'), 0) as sales_cost
        FROM public.inventory_transactions it
        WHERE it.user_id = p_user_id AND it.created_at >= v_30d_ago
    )
    SELECT
        is_stats.item_count as total_items,
        is_stats.inventory_value as total_value,
        is_stats.low_stock as low_stock_count,
        ts.purchases_incurred as total_purchases_30d,
        ts.sales_cost as total_sales_30d,
        ts.purchases_paid as cogs_paid_30d, -- Simplified: only paid purchases count as COGS for cash basis
        ts.sales_cost as cogs_incurred_30d, -- Full cost of sales for accrual basis
        v_basis as accounting_basis
    FROM inventory_stats is_stats, transaction_stats ts;
END;
$$;

-- ============= Comments =============

COMMENT ON COLUMN public.user_tax_profiles.accounting_basis IS 'Tax reporting basis: cash (standard for individuals) or accrual (standard for companies)';
COMMENT ON FUNCTION public.get_inventory_summary IS 'V26b: Refined summary distinguishing between cash and accrual COGS';
-- V26: Inventory & Liability Layer
-- Enables inventory tracking, accounts payable, and COGS calculation

-- ============= Inventory Tables =============

-- Inventory items table for tracking stock
CREATE TABLE public.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES public.businesses(id),
    
    -- Item Details
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    description TEXT,
    category VARCHAR(100),
    
    -- Stock Levels
    quantity_on_hand DECIMAL(15,2) DEFAULT 0,
    unit_of_measure VARCHAR(50) DEFAULT 'units',
    reorder_level DECIMAL(15,2) DEFAULT 0,
    
    -- Costing (for COGS)
    unit_cost DECIMAL(15,2) NOT NULL,
    total_value DECIMAL(15,2) GENERATED ALWAYS AS (quantity_on_hand * unit_cost) STORED,
    
    -- Pricing
    selling_price DECIMAL(15,2),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory transactions (purchases, sales, adjustments)
CREATE TABLE public.inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- Transaction Details
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('purchase', 'sale', 'adjustment', 'return')),
    quantity DECIMAL(15,2) NOT NULL,
    unit_cost DECIMAL(15,2),
    total_cost DECIMAL(15,2),
    
    -- Reference
    reference_type VARCHAR(50), -- 'invoice', 'expense', 'manual'
    reference_id UUID,
    
    -- Description
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============= Accounts Payable =============

-- Add accounts_payable to projects
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS accounts_payable DECIMAL(15,2) DEFAULT 0;

ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS accounts_receivable DECIMAL(15,2) DEFAULT 0;

-- Accounts payable tracking table
CREATE TABLE public.accounts_payable (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id),
    
    -- Vendor Info
    vendor_name VARCHAR(255) NOT NULL,
    vendor_tin VARCHAR(20),
    
    -- Invoice Details
    invoice_number VARCHAR(100),
    invoice_date DATE NOT NULL,
    due_date DATE,
    
    -- Amounts
    amount DECIMAL(15,2) NOT NULL,
    vat_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) NOT NULL,
    amount_paid DECIMAL(15,2) DEFAULT 0,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
    
    -- Tracking
    payment_date DATE,
    payment_reference VARCHAR(255),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============= Indexes =============

CREATE INDEX idx_inventory_items_user ON public.inventory_items(user_id);
CREATE INDEX idx_inventory_items_sku ON public.inventory_items(sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_inventory_transactions_item ON public.inventory_transactions(item_id);
CREATE INDEX idx_inventory_transactions_type ON public.inventory_transactions(transaction_type);
CREATE INDEX idx_accounts_payable_user ON public.accounts_payable(user_id);
CREATE INDEX idx_accounts_payable_status ON public.accounts_payable(status);
CREATE INDEX idx_accounts_payable_project ON public.accounts_payable(project_id) WHERE project_id IS NOT NULL;

-- ============= RLS Policies =============

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;

-- Inventory items policies
CREATE POLICY "Users can view their own inventory" ON public.inventory_items
FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can manage their own inventory" ON public.inventory_items
FOR ALL USING (user_id = auth.uid());

-- Inventory transactions policies
CREATE POLICY "Users can view their own transactions" ON public.inventory_transactions
FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can manage their own transactions" ON public.inventory_transactions
FOR ALL USING (user_id = auth.uid());

-- Accounts payable policies
CREATE POLICY "Users can view their own payables" ON public.accounts_payable
FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can manage their own payables" ON public.accounts_payable
FOR ALL USING (user_id = auth.uid());

-- ============= Triggers =============

-- Update inventory on transaction
CREATE OR REPLACE FUNCTION public.update_inventory_on_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.inventory_items
        SET quantity_on_hand = quantity_on_hand + 
            CASE 
                WHEN NEW.transaction_type IN ('purchase', 'return') THEN NEW.quantity
                WHEN NEW.transaction_type IN ('sale', 'adjustment') THEN -NEW.quantity
                ELSE 0
            END,
            updated_at = NOW()
        WHERE id = NEW.item_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_inventory_quantity
AFTER INSERT ON public.inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_inventory_on_transaction();

-- Update project accounts_payable total
CREATE OR REPLACE FUNCTION public.update_project_payables()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.project_id IS NOT NULL THEN
        UPDATE public.projects
        SET accounts_payable = (
            SELECT COALESCE(SUM(total_amount - amount_paid), 0)
            FROM public.accounts_payable
            WHERE project_id = NEW.project_id AND status != 'paid'
        ),
        updated_at = NOW()
        WHERE id = NEW.project_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_project_payables_on_change
AFTER INSERT OR UPDATE ON public.accounts_payable
FOR EACH ROW
EXECUTE FUNCTION public.update_project_payables();

-- ============= AI Context Functions =============

-- Get inventory summary for AI context
CREATE OR REPLACE FUNCTION public.get_inventory_summary(
    p_user_id UUID
)
RETURNS TABLE (
    total_items INT,
    total_value NUMERIC,
    low_stock_count INT,
    total_purchases_30d NUMERIC,
    total_sales_30d NUMERIC,
    cogs_30d NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_30d_ago DATE := CURRENT_DATE - 30;
BEGIN
    RETURN QUERY
    WITH inventory_stats AS (
        SELECT 
            COUNT(*)::INT as item_count,
            COALESCE(SUM(ii.total_value), 0) as inventory_value,
            COUNT(*) FILTER (WHERE ii.quantity_on_hand <= ii.reorder_level)::INT as low_stock
        FROM public.inventory_items ii
        WHERE ii.user_id = p_user_id AND ii.is_active = true
    ),
    transaction_stats AS (
        SELECT
            COALESCE(SUM(it.total_cost) FILTER (WHERE it.transaction_type = 'purchase'), 0) as purchases,
            COALESCE(SUM(it.total_cost) FILTER (WHERE it.transaction_type = 'sale'), 0) as sales
        FROM public.inventory_transactions it
        WHERE it.user_id = p_user_id AND it.created_at >= v_30d_ago
    )
    SELECT
        is_stats.item_count as total_items,
        is_stats.inventory_value as total_value,
        is_stats.low_stock as low_stock_count,
        ts.purchases as total_purchases_30d,
        ts.sales as total_sales_30d,
        ts.sales as cogs_30d -- Simplified COGS = sales value at cost
    FROM inventory_stats is_stats, transaction_stats ts;
END;
$$;

-- Get accounts payable summary for AI context
CREATE OR REPLACE FUNCTION public.get_payables_summary(
    p_user_id UUID
)
RETURNS TABLE (
    total_payables INT,
    total_amount_due NUMERIC,
    overdue_count INT,
    overdue_amount NUMERIC,
    due_within_7_days INT,
    due_within_7_days_amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INT as total_payables,
        COALESCE(SUM(ap.total_amount - ap.amount_paid), 0)::NUMERIC as total_amount_due,
        COUNT(*) FILTER (WHERE ap.due_date < CURRENT_DATE AND ap.status != 'paid')::INT as overdue_count,
        COALESCE(SUM(ap.total_amount - ap.amount_paid) FILTER (WHERE ap.due_date < CURRENT_DATE AND ap.status != 'paid'), 0)::NUMERIC as overdue_amount,
        COUNT(*) FILTER (WHERE ap.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND ap.status != 'paid')::INT as due_within_7_days,
        COALESCE(SUM(ap.total_amount - ap.amount_paid) FILTER (WHERE ap.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND ap.status != 'paid'), 0)::NUMERIC as due_within_7_days_amount
    FROM public.accounts_payable ap
    WHERE ap.user_id = p_user_id AND ap.status != 'paid';
END;
$$;

-- ============= Grants =============

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts_payable TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_summary TO service_role;
GRANT EXECUTE ON FUNCTION public.get_payables_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payables_summary TO service_role;

COMMENT ON TABLE public.inventory_items IS 'V26: Inventory tracking for COGS calculation';
COMMENT ON TABLE public.accounts_payable IS 'V26: Accounts payable tracking for liability management';
COMMENT ON FUNCTION public.get_inventory_summary IS 'V26: Returns inventory summary for AI context';
COMMENT ON FUNCTION public.get_payables_summary IS 'V26: Returns accounts payable summary for AI context';
-- =====================================================
-- V27: Automated CBN Exchange Rate Fetching
-- Schedules daily fetches at 9:30 AM and 10:00 AM WAT
-- =====================================================

-- Primary Fetch: 9:30 AM WAT (08:30 UTC)
SELECT cron.schedule(
  'cbn-rate-fetch-primary',
  '30 8 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/cbn-rate-fetcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{"force_refresh": true}'::jsonb
  );
  $$
);

-- Secondary Fetch (Retry/Update): 10:00 AM WAT (09:00 UTC)
SELECT cron.schedule(
  'cbn-rate-fetch-secondary',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/cbn-rate-fetcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{"force_refresh": true}'::jsonb
  );
  $$
);

-- Daily CBN exchange rate fetch at 9:30 AM WAT
-- Follow-up CBN exchange rate fetch at 10:00 AM WAT to ensure latest data
-- Transaction Enhancements Migration
-- Adds splitting, receipt processing, recurring detection, and VAT breakdown

-- 1. Add transaction splitting columns
ALTER TABLE public.bank_transactions 
ADD COLUMN IF NOT EXISTS parent_transaction_id UUID REFERENCES public.bank_transactions(id),
ADD COLUMN IF NOT EXISTS is_split BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS split_note TEXT;

-- 2. Add receipt processing columns (privacy-first: no original storage)
ALTER TABLE public.bank_transactions 
ADD COLUMN IF NOT EXISTS receipt_markdown TEXT,
ADD COLUMN IF NOT EXISTS receipt_source_hash TEXT;

-- 3. Add recurring transaction detection
ALTER TABLE public.bank_transactions 
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS recurring_pattern TEXT;

-- 4. Add VAT breakdown columns (Nigerian VAT default 7.5%)
ALTER TABLE public.bank_transactions 
ADD COLUMN IF NOT EXISTS vat_gross NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS vat_net NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) DEFAULT 7.5;

-- 5. Add user note for AI reclassification context
ALTER TABLE public.bank_transactions 
ADD COLUMN IF NOT EXISTS user_note TEXT;

-- 6. Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_bank_transactions_parent 
ON public.bank_transactions(parent_transaction_id) 
WHERE parent_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_has_receipt 
ON public.bank_transactions(id) 
WHERE receipt_markdown IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_recurring 
ON public.bank_transactions(is_recurring, recurring_pattern) 
WHERE is_recurring = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN public.bank_transactions.receipt_markdown IS 'OCR-extracted receipt content in Markdown format. Original image is NOT stored for privacy.';
COMMENT ON COLUMN public.bank_transactions.receipt_source_hash IS 'SHA-256 hash of original receipt image for verification purposes.';
COMMENT ON COLUMN public.bank_transactions.vat_rate IS 'VAT rate applied, defaults to Nigerian standard 7.5%';
-- Migration: Transaction enhancements for splitting, receipts, and recurring detection
-- Purpose: Support FIRS/LIRS compliant transaction splitting, receipt-to-markdown conversion, VAT breakdown

-- =====================================================
-- Phase 4: Transaction Splitting Support
-- =====================================================

-- Add parent transaction reference for splits
ALTER TABLE bank_transactions 
ADD COLUMN IF NOT EXISTS parent_transaction_id UUID REFERENCES bank_transactions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_split BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS split_note TEXT;

-- Index for efficient split queries
CREATE INDEX IF NOT EXISTS idx_bank_transactions_parent 
ON bank_transactions(parent_transaction_id) 
WHERE parent_transaction_id IS NOT NULL;

-- =====================================================
-- Phase 5D: Receipt Processing (PDF/Image → Markdown)
-- =====================================================

ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS receipt_markdown TEXT,
ADD COLUMN IF NOT EXISTS receipt_source_hash TEXT;  -- SHA-256 of original file for verification

-- Index for finding transactions with receipts
CREATE INDEX IF NOT EXISTS idx_bank_transactions_has_receipt 
ON bank_transactions(user_id) 
WHERE receipt_markdown IS NOT NULL;

-- =====================================================
-- Phase 5E: Recurring Transaction Detection
-- =====================================================

ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS recurring_pattern TEXT;  -- e.g., "monthly", "weekly", "DSTV", "Netflix"

-- Index for recurring transactions
CREATE INDEX IF NOT EXISTS idx_bank_transactions_recurring 
ON bank_transactions(user_id, is_recurring) 
WHERE is_recurring = true;

-- =====================================================
-- Phase 5F: VAT Breakdown
-- =====================================================

ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS vat_gross NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS vat_net NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) DEFAULT 7.5;  -- Nigeria VAT rate

-- =====================================================
-- User Notes for Smart Reclassification
-- =====================================================

ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS user_note TEXT;  -- Free text that triggers AI reclassification

-- =====================================================
-- Comment updates for documentation
-- =====================================================

COMMENT ON COLUMN bank_transactions.parent_transaction_id IS 'For split transactions, references the original parent transaction';
COMMENT ON COLUMN bank_transactions.is_split IS 'True if this is a child transaction from a split';
COMMENT ON COLUMN bank_transactions.split_note IS 'Explanation of why transaction was split (e.g., "48500 hospital + 1500 personal")';
COMMENT ON COLUMN bank_transactions.receipt_markdown IS 'Markdown content extracted from uploaded receipt/PDF';
COMMENT ON COLUMN bank_transactions.receipt_source_hash IS 'SHA-256 hash of original uploaded file for verification (original not stored)';
COMMENT ON COLUMN bank_transactions.is_recurring IS 'True if detected as recurring (Netflix, rent, etc.)';
COMMENT ON COLUMN bank_transactions.recurring_pattern IS 'Pattern name or vendor for recurring detection';
COMMENT ON COLUMN bank_transactions.vat_gross IS 'VAT-inclusive amount';
COMMENT ON COLUMN bank_transactions.vat_net IS 'Net amount excluding VAT';
COMMENT ON COLUMN bank_transactions.vat_amount IS 'VAT portion of the transaction';
COMMENT ON COLUMN bank_transactions.vat_rate IS 'VAT rate applied (default 7.5%)';
COMMENT ON COLUMN bank_transactions.user_note IS 'User-provided context for smart reclassification';
-- =====================================================
-- Phase 6.12: Agent Security & RBAC Extensions
-- Implements the 3-Strike Breach Policy and 'owner' role
-- =====================================================

-- 1. Extend app_role with 'owner'
-- Note: ALTER TYPE ... ADD VALUE cannot be executed in a transaction block
-- In Supabase migrations, we usually rely on the environment's handling.
DO $$ BEGIN
    ALTER TYPE public.app_role ADD VALUE 'owner';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add security headers to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS breach_count INTEGER DEFAULT 0;

-- 3. Create Security Breach Logs table
CREATE TABLE IF NOT EXISTS public.security_breach_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    breach_type TEXT NOT NULL, -- 'prompt_injection', 'unauthorized_access', 'data_probe'
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    prompt_snippet TEXT,
    mitigation_action TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable RLS
ALTER TABLE public.security_breach_logs ENABLE ROW LEVEL SECURITY;

-- 5. Indexes for performance and monitoring
CREATE INDEX IF NOT EXISTS idx_security_breach_user ON public.security_breach_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_flagged ON public.users(is_flagged) WHERE is_flagged = true;

-- 6. RLS Policies
CREATE POLICY "Admins/Owners can view all breach logs"
    ON public.security_breach_logs FOR SELECT
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Users can view their own breach logs (transparency)"
    ON public.security_breach_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role manages breach logs"
    ON public.security_breach_logs FOR ALL
    USING (auth.role() = 'service_role');

-- 7. Update has_role triggers/functions if necessary
-- The existing has_role function uses the user_roles table, which 
-- uses the app_role enum, so it should handle 'owner' automatically.

COMMENT ON TABLE public.security_breach_logs IS 'Logs unauthorized AI probes and prompt injections for the 3-Strike Rule';
COMMENT ON COLUMN public.users.is_flagged IS 'True if user is locked out of AI features due to security breaches';
-- =====================================================
-- Phase 6.12: Agent Action History & Review Queue
-- Tracks the Perception-Reasoning-Action cycles
-- =====================================================

-- 1. Agent Action Logs
-- Stores the thinking process and resulting actions
CREATE TABLE IF NOT EXISTS public.agent_action_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL, -- Logical grouping for one full loop
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- AI Context & Reasoning
    perception_data JSONB NOT NULL, -- Snapshot of what the agent "saw"
    reasoning_path TEXT NOT NULL,   -- The "Chain of Thought" or logic used
    
    -- Action Details
    action_type TEXT NOT NULL,      -- e.g., 'draft_tax_filing', 'transaction_split'
    action_payload JSONB NOT NULL,  -- The data intended for the action
    
    -- Execution State
    confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    status TEXT NOT NULL CHECK (status IN ('pending', 'executed', 'failed', 'review_required', 'rejected')),
    error_log TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Agent Review Queue
-- Proposals that require explicit "Apply" or MFA verification
CREATE TABLE IF NOT EXISTS public.agent_review_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_log_id UUID NOT NULL REFERENCES public.agent_action_logs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    user_feedback TEXT,
    
    reviewed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'), -- Auto-expire proposals
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE public.agent_action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_review_queue ENABLE ROW LEVEL SECURITY;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_agent_logs_user ON public.agent_action_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_cycle ON public.agent_action_logs(cycle_id);
CREATE INDEX IF NOT EXISTS idx_agent_review_user ON public.agent_review_queue(user_id, status);

-- 5. RLS Policies
CREATE POLICY "Users can view their own agent logs"
    ON public.agent_action_logs FOR SELECT
    USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Users can view their own review items"
    ON public.agent_review_queue FOR SELECT
    USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Users can update their own review status"
    ON public.agent_review_queue FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role manages agent operations"
    ON public.agent_action_logs FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role manages review queue"
    ON public.agent_review_queue FOR ALL
    USING (auth.role() = 'service_role');

-- 6. Triggers for updated_at
CREATE TRIGGER update_agent_action_logs_updated_at
    BEFORE UPDATE ON public.agent_action_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.agent_action_logs IS 'Audit trail for the PRISM Agent Perception-Reasoning-Action loop';
COMMENT ON TABLE public.agent_review_queue IS 'Queue for Tier 3/4 agent proposals requiring user approval';
-- =====================================================
-- Phase 6.12: Atomic Facts (PARA Structured Memory)
-- Implements durable, queryable agent memory
-- =====================================================

-- 1. PARA Layer Enum
DO $$ BEGIN
    CREATE TYPE public.para_layer AS ENUM ('project', 'area', 'resource', 'archive');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Atomic Facts Table
-- Replaces ephemeral session memory with durable facts
CREATE TABLE IF NOT EXISTS public.atomic_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- PARA Categorization
    layer para_layer NOT NULL DEFAULT 'area',
    entity_name TEXT NOT NULL, -- e.g., 'FIRS', 'Mono Account', 'VAT Rate'
    
    -- The Knowledge
    fact_content JSONB NOT NULL, -- The actual data/values
    source_metadata JSONB DEFAULT '{}', -- OCR snippets, chat message IDs, etc.
    
    -- Metadata & Lifecycle
    confidence NUMERIC(3,2) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
    is_superseded BOOLEAN DEFAULT false,
    superseded_by_id UUID REFERENCES public.atomic_facts(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE public.atomic_facts ENABLE ROW LEVEL SECURITY;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_atomic_facts_user ON public.atomic_facts(user_id, layer);
CREATE INDEX IF NOT EXISTS idx_atomic_facts_entity ON public.atomic_facts(user_id, entity_name);
CREATE INDEX IF NOT EXISTS idx_atomic_facts_active ON public.atomic_facts(user_id) WHERE NOT is_superseded;

-- 5. RLS Policies
CREATE POLICY "Users can view their own atomic facts"
    ON public.atomic_facts FOR SELECT
    USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Service role manages atomic facts"
    ON public.atomic_facts FOR ALL
    USING (auth.role() = 'service_role');

-- 6. Trigger to automate supersession (Optional/Manual for now)
-- The agent orchestrator will handle the logic of finding and superseding facts,
-- but we ensure updated_at is handled.

CREATE TRIGGER update_atomic_facts_updated_at
    BEFORE UPDATE ON public.atomic_facts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Logic for QMD Grounding (View for easy access)
CREATE OR REPLACE VIEW public.active_user_knowledge AS
SELECT 
    user_id,
    layer,
    entity_name,
    fact_content,
    confidence,
    created_at
FROM public.atomic_facts
WHERE NOT is_superseded;

COMMENT ON TABLE public.atomic_facts IS 'Durable AI knowledge base following the PARA structure';
COMMENT ON VIEW public.active_user_knowledge IS 'Helper view for agent context building, showing only current (non-superseded) facts';
-- Add last_heartbeat_at to track extraction cycles
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for faster querying by worker
CREATE INDEX IF NOT EXISTS idx_users_last_heartbeat ON public.users(last_heartbeat_at);

-- Set initial value for existing users
UPDATE public.users SET last_heartbeat_at = NOW() WHERE last_heartbeat_at IS NULL;
-- Migration 1a: Add 'owner' to app_role enum
-- This must be committed separately before it can be used
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';
-- Migration 1b: Agent Security, Action History, and Structured Memory
-- All remaining schema changes after 'owner' enum was committed

-- =====================================================
-- PART 1: Security Breach Tracking
-- =====================================================

-- Add security columns to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS breach_count INTEGER DEFAULT 0;

-- Create Security Breach Logs table
CREATE TABLE IF NOT EXISTS public.security_breach_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    breach_type TEXT NOT NULL,
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    prompt_snippet TEXT,
    mitigation_action TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.security_breach_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_security_breach_user ON public.security_breach_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_flagged ON public.users(is_flagged) WHERE is_flagged = true;

CREATE POLICY "Admins/Owners can view all breach logs"
    ON public.security_breach_logs FOR SELECT
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Users can view their own breach logs (transparency)"
    ON public.security_breach_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role manages breach logs"
    ON public.security_breach_logs FOR ALL
    USING (auth.role() = 'service_role');

COMMENT ON TABLE public.security_breach_logs IS 'Logs unauthorized AI probes and prompt injections for the 3-Strike Rule';
COMMENT ON COLUMN public.users.is_flagged IS 'True if user is locked out of AI features due to security breaches';

-- =====================================================
-- PART 2: Agent Action History & Review Queue
-- =====================================================

CREATE TABLE IF NOT EXISTS public.agent_action_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    perception_data JSONB NOT NULL,
    reasoning_path TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_payload JSONB NOT NULL,
    confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    status TEXT NOT NULL CHECK (status IN ('pending', 'executed', 'failed', 'review_required', 'rejected')),
    error_log TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_review_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_log_id UUID NOT NULL REFERENCES public.agent_action_logs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    user_feedback TEXT,
    reviewed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.agent_action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_review_queue ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_agent_logs_user ON public.agent_action_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_logs_cycle ON public.agent_action_logs(cycle_id);
CREATE INDEX IF NOT EXISTS idx_agent_review_user ON public.agent_review_queue(user_id, status);

CREATE POLICY "Users can view their own agent logs"
    ON public.agent_action_logs FOR SELECT
    USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Users can view their own review items"
    ON public.agent_review_queue FOR SELECT
    USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Users can update their own review status"
    ON public.agent_review_queue FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role manages agent operations"
    ON public.agent_action_logs FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role manages review queue"
    ON public.agent_review_queue FOR ALL
    USING (auth.role() = 'service_role');

CREATE TRIGGER update_agent_action_logs_updated_at
    BEFORE UPDATE ON public.agent_action_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.agent_action_logs IS 'Audit trail for the PRISM Agent Perception-Reasoning-Action loop';
COMMENT ON TABLE public.agent_review_queue IS 'Queue for Tier 3/4 agent proposals requiring user approval';

-- =====================================================
-- PART 3: Atomic Facts (PARA Structured Memory)
-- =====================================================

DO $$ BEGIN
    CREATE TYPE public.para_layer AS ENUM ('project', 'area', 'resource', 'archive');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.atomic_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    layer para_layer NOT NULL DEFAULT 'area',
    entity_name TEXT NOT NULL,
    fact_content JSONB NOT NULL,
    source_metadata JSONB DEFAULT '{}',
    confidence NUMERIC(3,2) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
    is_superseded BOOLEAN DEFAULT false,
    superseded_by_id UUID REFERENCES public.atomic_facts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.atomic_facts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_atomic_facts_user ON public.atomic_facts(user_id, layer);
CREATE INDEX IF NOT EXISTS idx_atomic_facts_entity ON public.atomic_facts(user_id, entity_name);
CREATE INDEX IF NOT EXISTS idx_atomic_facts_active ON public.atomic_facts(user_id) WHERE NOT is_superseded;

CREATE POLICY "Users can view their own atomic facts"
    ON public.atomic_facts FOR SELECT
    USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Service role manages atomic facts"
    ON public.atomic_facts FOR ALL
    USING (auth.role() = 'service_role');

CREATE TRIGGER update_atomic_facts_updated_at
    BEFORE UPDATE ON public.atomic_facts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE VIEW public.active_user_knowledge AS
SELECT 
    user_id,
    layer,
    entity_name,
    fact_content,
    confidence,
    created_at
FROM public.atomic_facts
WHERE NOT is_superseded;

COMMENT ON TABLE public.atomic_facts IS 'Durable AI knowledge base following the PARA structure';
COMMENT ON VIEW public.active_user_knowledge IS 'Helper view for agent context building, showing only current (non-superseded) facts';
-- Fix: Set security_invoker on active_user_knowledge view
-- This ensures the view respects the querying user's RLS policies
CREATE OR REPLACE VIEW public.active_user_knowledge 
WITH (security_invoker = true) AS
SELECT 
    user_id,
    layer,
    entity_name,
    fact_content,
    confidence,
    created_at
FROM public.atomic_facts
WHERE NOT is_superseded;
-- Migration: Update has_role to implement role hierarchy
-- Hierarchy: owner > admin > moderator > user
-- An owner has all permissions of admin, moderator, and user
-- An admin has all permissions of moderator and user
-- A moderator has all permissions of user

-- Drop and recreate with hierarchy logic
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND (
        -- Direct role match
        ur.role = _role
        -- OR hierarchy: owner has all roles
        OR (ur.role = 'owner')
        -- OR hierarchy: admin has moderator and user
        OR (ur.role = 'admin' AND _role IN ('moderator', 'user'))
        -- OR hierarchy: moderator has user
        OR (ur.role = 'moderator' AND _role = 'user')
      )
  )
$$;

COMMENT ON FUNCTION public.has_role IS 'Check if user has a role with hierarchy: owner > admin > moderator > user';
