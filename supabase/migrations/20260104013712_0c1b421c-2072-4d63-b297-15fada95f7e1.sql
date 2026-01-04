-- Add onboarding_mode column to system_settings
ALTER TABLE system_settings 
ADD COLUMN IF NOT EXISTS onboarding_mode VARCHAR(20) DEFAULT 'strict';

-- Comment explaining the column
COMMENT ON COLUMN system_settings.onboarding_mode IS 'Onboarding mode: strict (numbers only) or ai (natural language)';

-- Update existing row to have a default value
UPDATE system_settings SET onboarding_mode = 'strict' WHERE onboarding_mode IS NULL;