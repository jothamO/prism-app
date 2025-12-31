-- Phase 5 Week 3: Insights System
-- Store generated insights for users

CREATE TABLE IF NOT EXISTS user_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    month VARCHAR(7) NOT NULL, -- YYYY-MM format
    
    -- Insight details
    type VARCHAR(50) NOT NULL, -- 'tax_saving', 'threshold_warning', 'vat_refund', 'cash_flow', 'compliance'
    priority VARCHAR(10) NOT NULL, -- 'high', 'medium', 'low'
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_insights_user_month 
ON user_insights(user_id, month DESC);

CREATE INDEX IF NOT EXISTS idx_user_insights_priority 
ON user_insights(priority, potential_saving DESC NULLS LAST)
WHERE NOT is_read;

CREATE INDEX IF NOT EXISTS idx_user_insights_type 
ON user_insights(type, created_at DESC);

-- Add comments
COMMENT ON TABLE user_insights IS 'Proactive tax optimization insights generated for users';
COMMENT ON COLUMN user_insights.type IS 'Type of insight: tax_saving, threshold_warning, vat_refund, cash_flow, compliance';
COMMENT ON COLUMN user_insights.priority IS 'Priority level: high (urgent), medium (important), low (nice to have)';
COMMENT ON COLUMN user_insights.potential_saving IS 'Estimated tax savings if user acts on this insight';
COMMENT ON COLUMN user_insights.potential_cost IS 'Estimated cost/penalty if user ignores this insight';
COMMENT ON COLUMN user_insights.is_acted_on IS 'Whether user has taken action on this insight';
