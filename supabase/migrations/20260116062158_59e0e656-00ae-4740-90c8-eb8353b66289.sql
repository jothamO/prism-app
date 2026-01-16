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