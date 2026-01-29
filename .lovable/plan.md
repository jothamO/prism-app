

## Run V26 Inventory & Liability Migration

### Overview

Execute the V26 migration to create inventory tracking, accounts payable tables, and AI context functions. This enables the AI to answer questions about stock levels, COGS, and outstanding bills.

---

### What Will Be Created

#### Tables

| Table | Purpose |
|-------|---------|
| `inventory_items` | Track stock items with quantity, cost, and reorder levels |
| `inventory_transactions` | Log purchases, sales, adjustments, and returns |
| `accounts_payable` | Track vendor bills and payment status |

#### Project Enhancements

| Column | Purpose |
|--------|---------|
| `projects.accounts_payable` | Running total of unpaid vendor bills |
| `projects.accounts_receivable` | Running total of unpaid customer invoices |

#### Functions

| Function | Purpose |
|----------|---------|
| `get_inventory_summary(p_user_id)` | Returns inventory metrics for AI context |
| `get_payables_summary(p_user_id)` | Returns accounts payable metrics for AI context |
| `update_inventory_on_transaction()` | Trigger to auto-update stock levels |
| `update_project_payables()` | Trigger to auto-update project payable totals |

---

### Migration Enhancement

Add `SET search_path TO 'public'` to all functions for security:

```sql
CREATE OR REPLACE FUNCTION public.get_inventory_summary(...)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'  -- Added
AS $$
...
$$;
```

---

### SQL to Execute

```sql
-- V26: Inventory & Liability Layer
-- Enables inventory tracking, accounts payable, and COGS calculation

-- ============= Inventory Tables =============

CREATE TABLE public.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES public.businesses(id),
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    description TEXT,
    category VARCHAR(100),
    quantity_on_hand DECIMAL(15,2) DEFAULT 0,
    unit_of_measure VARCHAR(50) DEFAULT 'units',
    reorder_level DECIMAL(15,2) DEFAULT 0,
    unit_cost DECIMAL(15,2) NOT NULL,
    total_value DECIMAL(15,2) GENERATED ALWAYS AS (quantity_on_hand * unit_cost) STORED,
    selling_price DECIMAL(15,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('purchase', 'sale', 'adjustment', 'return')),
    quantity DECIMAL(15,2) NOT NULL,
    unit_cost DECIMAL(15,2),
    total_cost DECIMAL(15,2),
    reference_type VARCHAR(50),
    reference_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============= Project Columns =============

ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS accounts_payable DECIMAL(15,2) DEFAULT 0;

ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS accounts_receivable DECIMAL(15,2) DEFAULT 0;

-- ============= Accounts Payable Table =============

CREATE TABLE public.accounts_payable (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id),
    vendor_name VARCHAR(255) NOT NULL,
    vendor_tin VARCHAR(20),
    invoice_number VARCHAR(100),
    invoice_date DATE NOT NULL,
    due_date DATE,
    amount DECIMAL(15,2) NOT NULL,
    vat_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) NOT NULL,
    amount_paid DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
    payment_date DATE,
    payment_reference VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============= Indexes =============

CREATE INDEX idx_inventory_items_user ON public.inventory_items(user_id);
CREATE INDEX idx_inventory_items_sku ON public.inventory_items(sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_inventory_transactions_item ON public.inventory_transactions(item_id);
CREATE INDEX idx_inventory_transactions_type ON public.inventory_transactions(transaction_type);
CREATE INDEX idx_accounts_payable_user ON public.accounts_payable(user_id);
CREATE INDEX idx_accounts_payable_status ON public.accounts_payable(status);
CREATE INDEX idx_accounts_payable_project ON public.accounts_payable(project_id) WHERE project_id IS NOT NULL;

-- ============= RLS Policies =============

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own inventory" ON public.inventory_items
FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can manage their own inventory" ON public.inventory_items
FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can view their own transactions" ON public.inventory_transactions
FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can manage their own transactions" ON public.inventory_transactions
FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can view their own payables" ON public.accounts_payable
FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can manage their own payables" ON public.accounts_payable
FOR ALL USING (user_id = auth.uid());

-- ============= Triggers =============

CREATE OR REPLACE FUNCTION public.update_inventory_on_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.inventory_items
        SET quantity_on_hand = quantity_on_hand + 
            CASE 
                WHEN NEW.transaction_type IN ('purchase', 'return') THEN NEW.quantity
                WHEN NEW.transaction_type IN ('sale', 'adjustment') THEN -NEW.quantity
                ELSE 0
            END,
            updated_at = NOW()
        WHERE id = NEW.item_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_inventory_quantity
AFTER INSERT ON public.inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_inventory_on_transaction();

CREATE OR REPLACE FUNCTION public.update_project_payables()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.project_id IS NOT NULL THEN
        UPDATE public.projects
        SET accounts_payable = (
            SELECT COALESCE(SUM(total_amount - amount_paid), 0)
            FROM public.accounts_payable
            WHERE project_id = NEW.project_id AND status != 'paid'
        ),
        updated_at = NOW()
        WHERE id = NEW.project_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_project_payables_on_change
AFTER INSERT OR UPDATE ON public.accounts_payable
FOR EACH ROW
EXECUTE FUNCTION public.update_project_payables();

-- ============= AI Context Functions =============

CREATE OR REPLACE FUNCTION public.get_inventory_summary(
    p_user_id UUID
)
RETURNS TABLE (
    total_items INT,
    total_value NUMERIC,
    low_stock_count INT,
    total_purchases_30d NUMERIC,
    total_sales_30d NUMERIC,
    cogs_30d NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_30d_ago DATE := CURRENT_DATE - 30;
BEGIN
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
            COALESCE(SUM(it.total_cost) FILTER (WHERE it.transaction_type = 'purchase'), 0) as purchases,
            COALESCE(SUM(it.total_cost) FILTER (WHERE it.transaction_type = 'sale'), 0) as sales
        FROM public.inventory_transactions it
        WHERE it.user_id = p_user_id AND it.created_at >= v_30d_ago
    )
    SELECT
        is_stats.item_count as total_items,
        is_stats.inventory_value as total_value,
        is_stats.low_stock as low_stock_count,
        ts.purchases as total_purchases_30d,
        ts.sales as total_sales_30d,
        ts.sales as cogs_30d
    FROM inventory_stats is_stats, transaction_stats ts;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_payables_summary(
    p_user_id UUID
)
RETURNS TABLE (
    total_payables INT,
    total_amount_due NUMERIC,
    overdue_count INT,
    overdue_amount NUMERIC,
    due_within_7_days INT,
    due_within_7_days_amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INT as total_payables,
        COALESCE(SUM(ap.total_amount - ap.amount_paid), 0)::NUMERIC as total_amount_due,
        COUNT(*) FILTER (WHERE ap.due_date < CURRENT_DATE AND ap.status != 'paid')::INT as overdue_count,
        COALESCE(SUM(ap.total_amount - ap.amount_paid) FILTER (WHERE ap.due_date < CURRENT_DATE AND ap.status != 'paid'), 0)::NUMERIC as overdue_amount,
        COUNT(*) FILTER (WHERE ap.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND ap.status != 'paid')::INT as due_within_7_days,
        COALESCE(SUM(ap.total_amount - ap.amount_paid) FILTER (WHERE ap.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND ap.status != 'paid'), 0)::NUMERIC as due_within_7_days_amount
    FROM public.accounts_payable ap
    WHERE ap.user_id = p_user_id AND ap.status != 'paid';
END;
$$;

-- ============= Grants =============

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts_payable TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_summary TO service_role;
GRANT EXECUTE ON FUNCTION public.get_payables_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payables_summary TO service_role;

COMMENT ON TABLE public.inventory_items IS 'V26: Inventory tracking for COGS calculation';
COMMENT ON TABLE public.accounts_payable IS 'V26: Accounts payable tracking for liability management';
COMMENT ON FUNCTION public.get_inventory_summary IS 'V26: Returns inventory summary for AI context';
COMMENT ON FUNCTION public.get_payables_summary IS 'V26: Returns accounts payable summary for AI context';
```

---

### What This Enables

Once activated, the AI can answer:
- "How much inventory do I have?"
- "What items are low on stock?"
- "How much do I owe vendors?"
- "What bills are overdue?"
- "What's my COGS for this month?"

---

### Integration Point

The `context-builder.ts` already has functions that call these:
- `fetchInventorySummary()` → `get_inventory_summary()`
- `fetchPayablesSummary()` → `get_payables_summary()`

