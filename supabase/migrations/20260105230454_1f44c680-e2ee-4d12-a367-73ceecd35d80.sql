-- Create user_activity_log table for tracking login, profile changes, and transaction activity
CREATE TABLE IF NOT EXISTS user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type varchar(50) NOT NULL, -- 'login', 'logout', 'profile_update', 'receipt_upload', 'transaction_classified', etc.
  event_data jsonb DEFAULT '{}',
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Index for efficient user lookups with date ordering
CREATE INDEX idx_user_activity_user_created ON user_activity_log(user_id, created_at DESC);

-- Index for event type filtering
CREATE INDEX idx_user_activity_event_type ON user_activity_log(event_type);

-- Enable RLS
ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;

-- Admins can manage all activity logs
CREATE POLICY "Admins can manage activity logs"
  ON user_activity_log FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Users can view their own activity
CREATE POLICY "Users can view their own activity"
  ON user_activity_log FOR SELECT
  USING (user_id = auth.uid());

-- System can insert activity logs (for edge functions)
CREATE POLICY "System can insert activity logs"
  ON user_activity_log FOR INSERT
  WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE user_activity_log IS 'Tracks user activity events including login/logout, profile changes, and transaction activity';