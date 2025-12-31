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