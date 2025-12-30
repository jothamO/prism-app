-- Analytics tables for event tracking and metrics
CREATE TABLE IF NOT EXISTS user_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_user_type ON user_events(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON user_events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_type ON user_events(event_type);

-- Pre-aggregated analytics summary
CREATE TABLE IF NOT EXISTS analytics_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_name VARCHAR(50) NOT NULL,
    metric_value DECIMAL(15,2),
    period VARCHAR(10), -- 'daily', 'weekly', 'monthly'
    period_date DATE,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_metric ON analytics_summary(metric_name, period_date);
CREATE INDEX IF NOT EXISTS idx_analytics_period ON analytics_summary(period, period_date);
