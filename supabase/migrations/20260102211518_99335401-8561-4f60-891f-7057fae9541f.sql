-- Add trigger for auto-updating updated_at on chatbot_sessions
CREATE OR REPLACE FUNCTION public.update_chatbot_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

DROP TRIGGER IF EXISTS chatbot_sessions_updated_at ON public.chatbot_sessions;

CREATE TRIGGER chatbot_sessions_updated_at
  BEFORE UPDATE ON public.chatbot_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chatbot_sessions_updated_at();