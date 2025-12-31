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