-- PRISM API Infrastructure
-- API keys, rate limiting, and usage tracking

-- 1. API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_prefix TEXT NOT NULL, -- First 8 chars for display (pk_live_xxx)
    key_hash TEXT NOT NULL, -- Hashed full key
    name TEXT DEFAULT 'Default Key',
    tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'starter', 'business', 'enterprise')),
    environment TEXT NOT NULL DEFAULT 'test' CHECK (environment IN ('test', 'live')),
    
    -- Rate limits (overrides defaults if set)
    rate_limit_per_min INTEGER,
    rate_limit_per_day INTEGER,
    
    -- Permissions
    can_access_documents BOOLEAN DEFAULT FALSE,
    can_access_ocr BOOLEAN DEFAULT FALSE,
    can_use_webhooks BOOLEAN DEFAULT FALSE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    UNIQUE(key_hash)
);

-- 2. API Usage tracking
CREATE TABLE IF NOT EXISTS api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Rate limit tracking (sliding window)
CREATE TABLE IF NOT EXISTS api_rate_limits (
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    window_start TIMESTAMPTZ NOT NULL,
    window_type TEXT NOT NULL CHECK (window_type IN ('minute', 'day')),
    request_count INTEGER DEFAULT 1,
    PRIMARY KEY (api_key_id, window_start, window_type)
);

-- 4. Webhook registrations
CREATE TABLE IF NOT EXISTS api_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    events TEXT[] NOT NULL DEFAULT '{}',
    secret TEXT NOT NULL, -- For HMAC signing
    is_active BOOLEAN DEFAULT TRUE,
    last_triggered_at TIMESTAMPTZ,
    failure_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_usage_key ON api_usage(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_endpoint ON api_usage(endpoint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window ON api_rate_limits(api_key_id, window_start);

-- 5. Function to check rate limit
CREATE OR REPLACE FUNCTION check_api_rate_limit(
    p_key_id UUID,
    p_tier TEXT
) RETURNS TABLE(
    allowed BOOLEAN,
    minute_remaining INTEGER,
    day_remaining INTEGER,
    retry_after_seconds INTEGER
) AS $$
DECLARE
    v_minute_limit INTEGER;
    v_day_limit INTEGER;
    v_minute_count INTEGER;
    v_day_count INTEGER;
    v_minute_start TIMESTAMPTZ;
    v_day_start TIMESTAMPTZ;
BEGIN
    -- Set limits based on tier
    CASE p_tier
        WHEN 'free' THEN v_minute_limit := 10; v_day_limit := 100;
        WHEN 'starter' THEN v_minute_limit := 60; v_day_limit := 5000;
        WHEN 'business' THEN v_minute_limit := 300; v_day_limit := 50000;
        WHEN 'enterprise' THEN v_minute_limit := 999999; v_day_limit := 999999;
        ELSE v_minute_limit := 10; v_day_limit := 100;
    END CASE;
    
    v_minute_start := date_trunc('minute', NOW());
    v_day_start := date_trunc('day', NOW());
    
    -- Get current counts
    SELECT COALESCE(SUM(request_count), 0) INTO v_minute_count
    FROM api_rate_limits
    WHERE api_key_id = p_key_id 
      AND window_type = 'minute'
      AND window_start >= v_minute_start;
    
    SELECT COALESCE(SUM(request_count), 0) INTO v_day_count
    FROM api_rate_limits
    WHERE api_key_id = p_key_id 
      AND window_type = 'day'
      AND window_start >= v_day_start;
    
    -- Check limits
    IF v_minute_count >= v_minute_limit THEN
        RETURN QUERY SELECT 
            FALSE, 
            0, 
            v_day_limit - v_day_count,
            EXTRACT(EPOCH FROM (v_minute_start + INTERVAL '1 minute' - NOW()))::INTEGER;
        RETURN;
    END IF;
    
    IF v_day_count >= v_day_limit THEN
        RETURN QUERY SELECT 
            FALSE, 
            v_minute_limit - v_minute_count,
            0,
            EXTRACT(EPOCH FROM (v_day_start + INTERVAL '1 day' - NOW()))::INTEGER;
        RETURN;
    END IF;
    
    -- Increment counters
    INSERT INTO api_rate_limits (api_key_id, window_start, window_type, request_count)
    VALUES (p_key_id, v_minute_start, 'minute', 1)
    ON CONFLICT (api_key_id, window_start, window_type)
    DO UPDATE SET request_count = api_rate_limits.request_count + 1;
    
    INSERT INTO api_rate_limits (api_key_id, window_start, window_type, request_count)
    VALUES (p_key_id, v_day_start, 'day', 1)
    ON CONFLICT (api_key_id, window_start, window_type)
    DO UPDATE SET request_count = api_rate_limits.request_count + 1;
    
    RETURN QUERY SELECT 
        TRUE, 
        v_minute_limit - v_minute_count - 1,
        v_day_limit - v_day_count - 1,
        0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Cleanup old rate limit windows (run daily)
CREATE OR REPLACE FUNCTION cleanup_api_rate_limits() RETURNS void AS $$
BEGIN
    DELETE FROM api_rate_limits WHERE window_start < NOW() - INTERVAL '2 days';
    DELETE FROM api_usage WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. Set tier permissions function
CREATE OR REPLACE FUNCTION set_api_key_permissions() RETURNS TRIGGER AS $$
BEGIN
    CASE NEW.tier
        WHEN 'free' THEN
            NEW.can_access_documents := FALSE;
            NEW.can_access_ocr := FALSE;
            NEW.can_use_webhooks := FALSE;
        WHEN 'starter' THEN
            NEW.can_access_documents := FALSE;
            NEW.can_access_ocr := FALSE;
            NEW.can_use_webhooks := TRUE;
        WHEN 'business' THEN
            NEW.can_access_documents := TRUE;
            NEW.can_access_ocr := TRUE;
            NEW.can_use_webhooks := TRUE;
        WHEN 'enterprise' THEN
            NEW.can_access_documents := TRUE;
            NEW.can_access_ocr := TRUE;
            NEW.can_use_webhooks := TRUE;
    END CASE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop trigger if exists then recreate
DROP TRIGGER IF EXISTS trg_set_api_key_permissions ON api_keys;
CREATE TRIGGER trg_set_api_key_permissions
    BEFORE INSERT OR UPDATE OF tier ON api_keys
    FOR EACH ROW
    EXECUTE FUNCTION set_api_key_permissions();

-- RLS policies
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS api_keys_owner ON api_keys;
DROP POLICY IF EXISTS api_usage_owner ON api_usage;
DROP POLICY IF EXISTS api_webhooks_owner ON api_webhooks;
DROP POLICY IF EXISTS api_rate_limits_service ON api_rate_limits;

CREATE POLICY api_keys_owner ON api_keys
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY api_usage_owner ON api_usage
    FOR SELECT USING (
        api_key_id IN (SELECT id FROM api_keys WHERE user_id = auth.uid())
    );

CREATE POLICY api_webhooks_owner ON api_webhooks
    FOR ALL USING (
        api_key_id IN (SELECT id FROM api_keys WHERE user_id = auth.uid())
    );

-- Rate limits need service role access
CREATE POLICY api_rate_limits_service ON api_rate_limits
    FOR ALL USING (true);

-- Grant access
GRANT ALL ON api_keys TO authenticated;
GRANT ALL ON api_usage TO authenticated;
GRANT ALL ON api_webhooks TO authenticated;
GRANT ALL ON api_rate_limits TO authenticated;

COMMENT ON TABLE api_keys IS 'PRISM API access keys with tier-based permissions';
COMMENT ON TABLE api_usage IS 'API request logging for analytics';
COMMENT ON TABLE api_rate_limits IS 'Sliding window rate limit tracking';