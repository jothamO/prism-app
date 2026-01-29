-- V21: Financial Layer - Transaction & Invoice Summary Skills
-- Powers AI ability to answer questions about user's financial status

-- Function: Get transaction summary for last N days
CREATE OR REPLACE FUNCTION public.get_transaction_summary(
    p_user_id UUID,
    p_days INT DEFAULT 30
)
RETURNS TABLE (
    total_income NUMERIC,
    total_expenses NUMERIC,
    transaction_count INT,
    top_expense_category TEXT,
    top_income_category TEXT,
    emtl_total NUMERIC,
    vat_total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_start_date DATE := CURRENT_DATE - p_days;
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(bt.credit), 0)::NUMERIC as total_income,
        COALESCE(SUM(bt.debit), 0)::NUMERIC as total_expenses,
        COUNT(*)::INT as transaction_count,
        (SELECT bt2.category::TEXT FROM bank_transactions bt2 
         WHERE bt2.user_id = p_user_id 
         AND bt2.is_expense = true 
         AND bt2.transaction_date >= v_start_date
         GROUP BY bt2.category ORDER BY SUM(bt2.debit) DESC LIMIT 1) as top_expense_category,
        (SELECT bt3.category::TEXT FROM bank_transactions bt3 
         WHERE bt3.user_id = p_user_id 
         AND bt3.is_revenue = true 
         AND bt3.transaction_date >= v_start_date
         GROUP BY bt3.category ORDER BY SUM(bt3.credit) DESC LIMIT 1) as top_income_category,
        COALESCE(SUM(CASE WHEN bt.is_emtl THEN bt.debit ELSE 0 END), 0)::NUMERIC as emtl_total,
        COALESCE(SUM(bt.vat_amount), 0)::NUMERIC as vat_total
    FROM public.bank_transactions bt
    WHERE bt.user_id = p_user_id
    AND bt.transaction_date >= v_start_date;
END;
$$;

-- Function: Get invoice status summary
CREATE OR REPLACE FUNCTION public.get_invoice_summary(
    p_user_id UUID
)
RETURNS TABLE (
    total_invoices INT,
    pending_count INT,
    paid_count INT,
    overdue_count INT,
    pending_amount NUMERIC,
    paid_amount NUMERIC,
    overdue_amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INT as total_invoices,
        COUNT(*) FILTER (WHERE i.status = 'pending_remittance')::INT as pending_count,
        COUNT(*) FILTER (WHERE i.status = 'remitted')::INT as paid_count,
        0::INT as overdue_count,
        COALESCE(SUM(i.total) FILTER (WHERE i.status = 'pending_remittance'), 0)::NUMERIC as pending_amount,
        COALESCE(SUM(i.total) FILTER (WHERE i.status = 'remitted'), 0)::NUMERIC as paid_amount,
        0::NUMERIC as overdue_amount
    FROM public.invoices i
    WHERE i.user_id = p_user_id;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.get_transaction_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_transaction_summary TO service_role;
GRANT EXECUTE ON FUNCTION public.get_invoice_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoice_summary TO service_role;

COMMENT ON FUNCTION public.get_transaction_summary IS 'V21 Financial Skill: Returns 30-day transaction summary for AI context';
COMMENT ON FUNCTION public.get_invoice_summary IS 'V21 Financial Skill: Returns invoice status summary for AI context';