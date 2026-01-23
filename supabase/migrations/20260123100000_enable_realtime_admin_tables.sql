-- =====================================================
-- Enable Supabase Realtime for Admin Tables
-- Provides live updates on admin dashboard pages
-- =====================================================

-- Code Proposals System
ALTER PUBLICATION supabase_realtime ADD TABLE public.code_change_proposals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.code_proposal_queue;

-- Compliance Rules
ALTER PUBLICATION supabase_realtime ADD TABLE public.compliance_rules;

-- Legal Documents (document_parts already enabled by Lovable)
ALTER PUBLICATION supabase_realtime ADD TABLE public.legal_documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.legal_provisions;

-- Filings
ALTER PUBLICATION supabase_realtime ADD TABLE public.tax_filings;

-- Chat System
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.compliance_notifications;

-- Search Analytics
ALTER PUBLICATION supabase_realtime ADD TABLE public.search_analytics;

-- Review Queue
ALTER PUBLICATION supabase_realtime ADD TABLE public.review_queue;

-- Document Processing Events
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_processing_events;

-- =====================================================
-- NOTES:
-- 1. Realtime only works for tables in this publication
-- 2. Frontend needs to subscribe with supabase.channel()
-- 3. RLS policies still apply to realtime events
-- 4. Each subscription counts toward connection limits
-- =====================================================

COMMENT ON PUBLICATION supabase_realtime IS 
'Tables enabled for live updates on admin dashboards. Includes code proposals, compliance rules, documents, filings, chat, notifications, and analytics.';
