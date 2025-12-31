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
