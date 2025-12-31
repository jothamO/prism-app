-- Apply NOT NULL constraint to registration_number column
ALTER TABLE businesses
ALTER COLUMN registration_number SET NOT NULL;