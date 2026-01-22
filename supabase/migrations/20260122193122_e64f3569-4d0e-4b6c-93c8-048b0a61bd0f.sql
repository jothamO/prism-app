-- Enable RLS on new tables and add appropriate policies

-- API Documents: Admin-only access
ALTER TABLE public.api_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage api_documents"
ON public.api_documents FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Calculation Audit Log: Users can view their own, admins can view all
ALTER TABLE public.calculation_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own calculation audits"
ON public.calculation_audit_log FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all calculation audits"
ON public.calculation_audit_log FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can insert calculation audits"
ON public.calculation_audit_log FOR INSERT
WITH CHECK (true);