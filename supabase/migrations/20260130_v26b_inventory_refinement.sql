-- V26b: Inventory Accuracy & Accounting Basis
-- Refines COGS calculation and introduces tax accounting basics

-- ============= Schema Enhancements =============

-- Add accounting basis to user tax profiles
ALTER TABLE public.user_tax_profiles 
ADD COLUMN IF NOT EXISTS accounting_basis VARCHAR(10) DEFAULT 'cash' CHECK (accounting_basis IN ('cash', 'accrual'));

-- Set defaults based on user type
UPDATE public.user_tax_profiles 
SET accounting_basis = 'accrual' 
WHERE user_type IN ('business', 'partnership') AND accounting_basis = 'cash';

-- ============= AI Context Functions =============

-- Refined get_inventory_summary that respects accounting basis
CREATE OR REPLACE FUNCTION public.get_inventory_summary(
    p_user_id UUID
)
RETURNS TABLE (
    total_items INT,
    total_value NUMERIC,
    low_stock_count INT,
    total_purchases_30d NUMERIC,
    total_sales_30d NUMERIC,
    cogs_paid_30d NUMERIC,
    cogs_incurred_30d NUMERIC,
    accounting_basis TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_30d_ago DATE := CURRENT_DATE - 30;
    v_basis TEXT;
BEGIN
    -- Get user's accounting basis
    SELECT COALESCE(tp.accounting_basis, 'cash') INTO v_basis
    FROM public.user_tax_profiles tp
    WHERE tp.user_id = p_user_id;

    RETURN QUERY
    WITH inventory_stats AS (
        SELECT 
            COUNT(*)::INT as item_count,
            COALESCE(SUM(ii.total_value), 0) as inventory_value,
            COUNT(*) FILTER (WHERE ii.quantity_on_hand <= ii.reorder_level)::INT as low_stock
        FROM public.inventory_items ii
        WHERE ii.user_id = p_user_id AND ii.is_active = true
    ),
    transaction_stats AS (
        SELECT
            -- Total purchases (accrual)
            COALESCE(SUM(it.total_cost) FILTER (WHERE it.transaction_type = 'purchase'), 0) as purchases_incurred,
            -- Purchases actually paid for (cash basis)
            COALESCE(SUM(it.total_cost) FILTER (
                WHERE it.transaction_type = 'purchase' 
                AND (it.reference_type = 'expense' OR it.notes ILIKE '%paid%')
            ), 0) as purchases_paid,
            -- Total sales cost (accrual basis COGS)
            COALESCE(SUM(it.total_cost) FILTER (WHERE it.transaction_type = 'sale'), 0) as sales_cost
        FROM public.inventory_transactions it
        WHERE it.user_id = p_user_id AND it.created_at >= v_30d_ago
    )
    SELECT
        is_stats.item_count as total_items,
        is_stats.inventory_value as total_value,
        is_stats.low_stock as low_stock_count,
        ts.purchases_incurred as total_purchases_30d,
        ts.sales_cost as total_sales_30d,
        ts.purchases_paid as cogs_paid_30d, -- Simplified: only paid purchases count as COGS for cash basis
        ts.sales_cost as cogs_incurred_30d, -- Full cost of sales for accrual basis
        v_basis as accounting_basis
    FROM inventory_stats is_stats, transaction_stats ts;
END;
$$;

-- ============= Comments =============

COMMENT ON COLUMN public.user_tax_profiles.accounting_basis IS 'Tax reporting basis: cash (standard for individuals) or accrual (standard for companies)';
COMMENT ON FUNCTION public.get_inventory_summary IS 'V26b: Refined summary distinguishing between cash and accrual COGS';
