-- Add business_id to key tables
ALTER TABLE invoices ADD COLUMN business_id UUID REFERENCES businesses(id);
ALTER TABLE expenses ADD COLUMN business_id UUID REFERENCES businesses(id);
ALTER TABLE filings ADD COLUMN business_id UUID REFERENCES businesses(id);
ALTER TABLE user_accounts ADD COLUMN business_id UUID REFERENCES businesses(id);

-- Create index for performance
CREATE INDEX idx_invoices_business ON invoices(business_id);
CREATE INDEX idx_expenses_business ON expenses(business_id);
CREATE INDEX idx_filings_business ON filings(business_id);

-- Backfill: For existing records, try to link to a primary business if available, or create one from user profile
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
