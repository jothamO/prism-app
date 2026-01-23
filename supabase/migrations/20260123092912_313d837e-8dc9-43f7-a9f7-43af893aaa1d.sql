-- Enable Supabase Realtime for Admin Tables (only existing tables)

-- Code Proposals System
ALTER PUBLICATION supabase_realtime ADD TABLE public.code_change_proposals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.code_proposal_queue;

-- Compliance Rules
ALTER PUBLICATION supabase_realtime ADD TABLE public.compliance_rules;

-- Legal Provisions (legal_documents already enabled)
ALTER PUBLICATION supabase_realtime ADD TABLE public.legal_provisions;

-- Chat System
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.compliance_notifications;

-- Review Queue
ALTER PUBLICATION supabase_realtime ADD TABLE public.review_queue;