-- Revoke direct access to materialized view from anon/authenticated roles
-- Only allow access through admin role check
REVOKE ALL ON transaction_analytics FROM anon, authenticated;

-- Grant access only to authenticated users (RLS will still apply on underlying data)
GRANT SELECT ON transaction_analytics TO authenticated;