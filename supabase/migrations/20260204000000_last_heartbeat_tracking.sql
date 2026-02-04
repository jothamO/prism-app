-- Add last_heartbeat_at to track extraction cycles
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for faster querying by worker
CREATE INDEX IF NOT EXISTS idx_users_last_heartbeat ON public.users(last_heartbeat_at);

-- Set initial value for existing users
UPDATE public.users SET last_heartbeat_at = NOW() WHERE last_heartbeat_at IS NULL;
