-- Enable realtime for document_parts table so processing status updates live
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_parts;