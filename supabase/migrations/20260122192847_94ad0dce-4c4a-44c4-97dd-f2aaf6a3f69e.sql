-- Add section_reference column to compliance_rules
ALTER TABLE public.compliance_rules 
ADD COLUMN IF NOT EXISTS section_reference TEXT;

COMMENT ON COLUMN public.compliance_rules.section_reference IS 
  'Section/paragraph reference e.g. "Section 23(1)(c)"';