-- Add auth_user_id to user_insights for frontend compatibility
ALTER TABLE user_insights ADD COLUMN IF NOT EXISTS auth_user_id uuid;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_insights_auth_user_id ON user_insights(auth_user_id);

-- Add RLS policy for auth_user_id access
CREATE POLICY "Users can view own insights by auth_user_id" 
ON user_insights FOR SELECT 
USING (auth_user_id = auth.uid() OR user_id = auth.uid());

CREATE POLICY "Users can update own insights by auth_user_id" 
ON user_insights FOR UPDATE 
USING (auth_user_id = auth.uid() OR user_id = auth.uid());