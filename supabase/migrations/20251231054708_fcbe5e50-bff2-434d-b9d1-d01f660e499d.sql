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