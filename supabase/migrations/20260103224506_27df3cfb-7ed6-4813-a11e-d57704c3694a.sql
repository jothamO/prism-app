-- Table for logging CBN rate fetch attempts
CREATE TABLE IF NOT EXISTS public.cbn_rate_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fetch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  currencies_updated INTEGER DEFAULT 0,
  source VARCHAR(50) NOT NULL DEFAULT 'cbn_scrape',
  success BOOLEAN NOT NULL,
  error_message TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_cbn_rate_logs_date ON cbn_rate_logs(fetch_date DESC);

-- Enable RLS
ALTER TABLE public.cbn_rate_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage rate logs
CREATE POLICY "Admins can manage rate logs"
ON public.cbn_rate_logs FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Create materialized view for transaction analytics
CREATE MATERIALIZED VIEW IF NOT EXISTS transaction_analytics AS
SELECT 
  DATE_TRUNC('day', transaction_date)::date as period,
  business_id,
  user_id,
  COUNT(*) as total_count,
  SUM(CASE WHEN is_ussd_transaction THEN 1 ELSE 0 END) as ussd_count,
  SUM(CASE WHEN is_pos_transaction THEN 1 ELSE 0 END) as pos_count,
  SUM(CASE WHEN is_mobile_money THEN 1 ELSE 0 END) as mobile_money_count,
  SUM(CASE WHEN is_foreign_currency THEN 1 ELSE 0 END) as foreign_currency_count,
  SUM(CASE WHEN is_bank_charge THEN 1 ELSE 0 END) as bank_charge_count,
  SUM(CASE WHEN is_emtl THEN 1 ELSE 0 END) as emtl_count,
  SUM(CASE WHEN vat_applicable THEN COALESCE(vat_amount, 0) ELSE 0 END) as total_vat,
  SUM(CASE WHEN vat_applicable THEN 1 ELSE 0 END) as vat_applicable_count,
  SUM(COALESCE(credit, 0)) as total_credits,
  SUM(COALESCE(debit, 0)) as total_debits,
  COUNT(CASE WHEN classification_source = 'ai' THEN 1 END) as ai_classified_count,
  COUNT(CASE WHEN classification_source = 'rule_based' THEN 1 END) as rule_classified_count,
  COUNT(CASE WHEN classification_source = 'pattern' THEN 1 END) as pattern_classified_count,
  AVG(confidence) as avg_confidence
FROM bank_transactions
GROUP BY DATE_TRUNC('day', transaction_date), business_id, user_id;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_analytics_unique 
ON transaction_analytics(period, COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid), user_id);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_transaction_analytics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY transaction_analytics;
END;
$$;

-- Comments
COMMENT ON TABLE cbn_rate_logs IS 'Logs of CBN exchange rate fetch attempts for monitoring and debugging';
COMMENT ON MATERIALIZED VIEW transaction_analytics IS 'Pre-aggregated Nigerian transaction metrics for dashboard analytics';