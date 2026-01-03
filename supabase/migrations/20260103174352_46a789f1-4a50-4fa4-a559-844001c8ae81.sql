-- Add Nigerian transaction detection columns to bank_transactions
ALTER TABLE bank_transactions 
ADD COLUMN IF NOT EXISTS is_ussd_transaction boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_mobile_money boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS mobile_money_provider varchar,
ADD COLUMN IF NOT EXISTS is_pos_transaction boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_foreign_currency boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS foreign_currency varchar;

-- Add indexes for common queries on Nigerian transaction types
CREATE INDEX IF NOT EXISTS idx_bank_transactions_mobile_money 
ON bank_transactions(is_mobile_money) WHERE is_mobile_money = true;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_pos 
ON bank_transactions(is_pos_transaction) WHERE is_pos_transaction = true;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_ussd 
ON bank_transactions(is_ussd_transaction) WHERE is_ussd_transaction = true;

-- Add comment for documentation
COMMENT ON COLUMN bank_transactions.is_ussd_transaction IS 'Transaction initiated via USSD banking';
COMMENT ON COLUMN bank_transactions.is_mobile_money IS 'Transaction involves mobile money (OPay, PalmPay, etc.)';
COMMENT ON COLUMN bank_transactions.mobile_money_provider IS 'Name of mobile money provider if detected';
COMMENT ON COLUMN bank_transactions.is_pos_transaction IS 'Point of Sale terminal transaction';
COMMENT ON COLUMN bank_transactions.is_foreign_currency IS 'Transaction involves foreign currency';
COMMENT ON COLUMN bank_transactions.foreign_currency IS 'ISO currency code if foreign currency detected';