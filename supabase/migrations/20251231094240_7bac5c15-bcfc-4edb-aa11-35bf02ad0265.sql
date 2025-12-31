-- Create user_insights table for storing proactive insights
CREATE TABLE IF NOT EXISTS user_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month VARCHAR(7) NOT NULL,
    
    -- Insight details
    type VARCHAR(50) NOT NULL,
    priority VARCHAR(10) NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    action TEXT NOT NULL,
    
    -- Financial impact
    potential_saving DECIMAL(15,2),
    potential_cost DECIMAL(15,2),
    
    -- Metadata
    deadline DATE,
    metadata JSONB DEFAULT '{}',
    
    -- User interaction
    is_read BOOLEAN DEFAULT FALSE,
    is_acted_on BOOLEAN DEFAULT FALSE,
    acted_on_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_insights_user_month 
ON user_insights(user_id, month DESC);

CREATE INDEX IF NOT EXISTS idx_user_insights_priority 
ON user_insights(priority, potential_saving DESC NULLS LAST)
WHERE NOT is_read;

CREATE INDEX IF NOT EXISTS idx_user_insights_type 
ON user_insights(type, created_at DESC);

-- Enable RLS
ALTER TABLE user_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own insights"
ON user_insights FOR SELECT
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can update their own insights"
ON user_insights FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "System can insert insights"
ON user_insights FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can manage all insights"
ON user_insights FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_user_insights_updated_at
BEFORE UPDATE ON user_insights
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();