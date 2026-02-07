-- =====================================================
-- PRISM DATABASE RECOVERY PATCH
-- Resolves errors from missing tables, columns, and constraints
-- =====================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS
-- Fix for app_role 'owner'
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'owner') THEN
        ALTER TYPE public.app_role ADD VALUE 'owner';
    END IF;
END $$;

-- 3. MISSING CORE TABLES
-- admin_users (Required by compliance_knowledge_system and team policies)
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- transactions (Required by historical_tax_rules)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES public.businesses(id),
    transaction_date DATE NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'NGN',
    description TEXT,
    category VARCHAR(50),
    tax_year INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- invoices (Creating empty if missing to satisfy multi-business migration)
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES public.businesses(id),
    invoice_number TEXT,
    date DATE,
    total NUMERIC(15,2),
    status TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. MISSING COLUMNS PATCH
-- Users table enhancements
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS auth_id UUID,
ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;

-- Compliance Rules enhancements
ALTER TABLE public.compliance_rules 
ADD COLUMN IF NOT EXISTS tax_regime TEXT,
ADD COLUMN IF NOT EXISTS law_reference TEXT,
ADD COLUMN IF NOT EXISTS rule_value JSONB;

-- Code Change Proposals enhancements
ALTER TABLE public.code_change_proposals 
ADD COLUMN IF NOT EXISTS needs_revision BOOLEAN DEFAULT false;

-- Codebase Registry enhancements
ALTER TABLE public.codebase_registry 
ADD COLUMN IF NOT EXISTS line_number INTEGER,
ADD COLUMN IF NOT EXISTS current_value TEXT,
ADD COLUMN IF NOT EXISTS rule_id UUID,
ADD COLUMN IF NOT EXISTS last_scanned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS needs_update BOOLEAN DEFAULT false;

-- bank_transactions enhancements
ALTER TABLE public.bank_transactions
ADD COLUMN IF NOT EXISTS tax_year INTEGER;

-- 5. CONSTRAINT FIXES
-- Drop restrictive rule_type check (do not re-add to allow any value)
ALTER TABLE public.compliance_rules DROP CONSTRAINT IF EXISTS compliance_rules_rule_type_check;

-- Drop restrictive provision_type check
ALTER TABLE public.legal_provisions DROP CONSTRAINT IF EXISTS legal_provisions_provision_type_check;
ALTER TABLE public.legal_provisions ADD CONSTRAINT legal_provisions_provision_type_check 
CHECK (provision_type IN (
    'definition', 'obligation', 'exemption', 'rate', 
    'penalty', 'procedure', 'deadline', 'relief', 'power', 'general', 'other'
));

-- 6. FUNCTION FIXES
-- Fix for get_inventory_summary return type conflict
DROP FUNCTION IF EXISTS public.get_inventory_summary(uuid);
DROP FUNCTION IF EXISTS public.get_upcoming_deadlines(uuid); -- Also flagged as non-unique

-- 7. CLEANUP
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON public.users(auth_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tax_year ON public.transactions(tax_year);
