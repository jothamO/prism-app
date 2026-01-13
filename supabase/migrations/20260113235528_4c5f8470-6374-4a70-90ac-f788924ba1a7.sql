-- Phase 5-6: Tier enforcement and billing automation

-- Trigger to sync API key tier with subscription changes
CREATE OR REPLACE FUNCTION public.sync_api_key_tier_with_subscription()
RETURNS TRIGGER AS $$
BEGIN
  -- When subscription tier changes, update all active API keys for this user
  IF NEW.tier IS DISTINCT FROM OLD.tier AND NEW.status = 'active' THEN
    UPDATE public.api_keys
    SET tier = NEW.tier
    WHERE user_id = NEW.user_id AND is_active = true;
  END IF;
  
  -- If subscription becomes inactive, downgrade keys to free
  IF NEW.status IN ('cancelled', 'inactive', 'past_due') AND OLD.status = 'active' THEN
    UPDATE public.api_keys
    SET tier = 'free'
    WHERE user_id = NEW.user_id AND is_active = true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the trigger
DROP TRIGGER IF EXISTS sync_api_keys_on_subscription_change ON public.api_subscriptions;
CREATE TRIGGER sync_api_keys_on_subscription_change
  AFTER UPDATE ON public.api_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION sync_api_key_tier_with_subscription();

-- Function to check and downgrade expired subscriptions (for scheduled task)
CREATE OR REPLACE FUNCTION public.downgrade_expired_subscriptions()
RETURNS INTEGER AS $$
DECLARE
  downgraded_count INTEGER;
BEGIN
  -- Find subscriptions past grace period (3 days after period end)
  WITH expired AS (
    UPDATE public.api_subscriptions
    SET 
      status = 'inactive',
      tier = 'free',
      updated_at = NOW()
    WHERE status = 'active'
      AND current_period_end IS NOT NULL
      AND current_period_end < NOW() - INTERVAL '3 days'
    RETURNING user_id
  )
  SELECT COUNT(*) INTO downgraded_count FROM expired;
  
  -- Downgrade associated API keys
  UPDATE public.api_keys
  SET tier = 'free'
  WHERE user_id IN (
    SELECT user_id FROM public.api_subscriptions 
    WHERE status = 'inactive'
  ) AND is_active = true AND tier != 'free';
  
  RETURN downgraded_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to get usage stats for a user's API keys
CREATE OR REPLACE FUNCTION public.get_user_api_usage_summary(p_user_id UUID)
RETURNS TABLE(
  total_requests_today BIGINT,
  total_requests_month BIGINT,
  tier TEXT,
  daily_limit INTEGER,
  monthly_limit INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(CASE WHEN au.created_at >= DATE_TRUNC('day', NOW()) THEN 1 ELSE 0 END), 0)::BIGINT as total_requests_today,
    COALESCE(SUM(CASE WHEN au.created_at >= DATE_TRUNC('month', NOW()) THEN 1 ELSE 0 END), 0)::BIGINT as total_requests_month,
    COALESCE(aks.tier, 'free') as tier,
    CASE COALESCE(aks.tier, 'free')
      WHEN 'free' THEN 100
      WHEN 'starter' THEN 5000
      WHEN 'business' THEN 50000
      WHEN 'enterprise' THEN 999999
      ELSE 100
    END as daily_limit,
    CASE COALESCE(aks.tier, 'free')
      WHEN 'free' THEN 3000
      WHEN 'starter' THEN 150000
      WHEN 'business' THEN 1500000
      WHEN 'enterprise' THEN 999999999
      ELSE 3000
    END as monthly_limit
  FROM public.api_keys ak
  LEFT JOIN public.api_usage au ON ak.id = au.api_key_id
  LEFT JOIN public.api_subscriptions aks ON ak.user_id = aks.user_id
  WHERE ak.user_id = p_user_id AND ak.is_active = true
  GROUP BY aks.tier;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;