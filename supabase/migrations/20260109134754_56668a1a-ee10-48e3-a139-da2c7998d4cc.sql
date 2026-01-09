-- Part 1: Soft Delete with 5-minute Undo grace period
-- Create deleted_items table for tracking soft-deleted critical items
CREATE TABLE public.deleted_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT NOT NULL CHECK (item_type IN ('user', 'legal_document', 'compliance_rule', 'tax_deadline', 'education_article')),
  item_id UUID NOT NULL,
  item_data JSONB NOT NULL,
  deleted_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  restored BOOLEAN DEFAULT false,
  restored_at TIMESTAMPTZ,
  restored_by UUID REFERENCES auth.users(id)
);

-- Index for cleanup queries (find expired items)
CREATE INDEX idx_deleted_items_expires ON public.deleted_items(expires_at) WHERE restored = false;

-- Index for user lookups
CREATE INDEX idx_deleted_items_type ON public.deleted_items(item_type, deleted_at DESC);

-- Index for item lookups
CREATE INDEX idx_deleted_items_item ON public.deleted_items(item_type, item_id);

-- Enable RLS
ALTER TABLE public.deleted_items ENABLE ROW LEVEL SECURITY;

-- Only admins can view and manage deleted items
CREATE POLICY "Admins can view deleted items"
  ON public.deleted_items FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert deleted items"
  ON public.deleted_items FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update deleted items"
  ON public.deleted_items FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete expired items"
  ON public.deleted_items FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Part 2: Test Mode - Extend system_settings
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS test_mode_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_mode_enabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS test_mode_enabled_by UUID REFERENCES auth.users(id);

-- Part 3: User Approval Status for Test Mode - Extend profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;