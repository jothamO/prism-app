-- Drop existing constraint and add 'simulator' as valid platform
ALTER TABLE chatbot_sessions 
DROP CONSTRAINT IF EXISTS chatbot_sessions_platform_check;

ALTER TABLE chatbot_sessions 
ADD CONSTRAINT chatbot_sessions_platform_check 
CHECK (platform IN ('whatsapp', 'telegram', 'simulator'));