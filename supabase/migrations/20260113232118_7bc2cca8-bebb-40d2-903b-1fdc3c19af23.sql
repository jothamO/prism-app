-- Phase 1: API Billing Database Schema

-- API Subscriptions table - Track API tier subscriptions separately from user subscriptions
CREATE TABLE public.api_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'starter', 'business', 'enterprise')),
  paystack_subscription_code TEXT,
  paystack_customer_code TEXT,
  paystack_plan_code TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing', 'inactive')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id) -- One active subscription per user
);

-- API Payments table - Payment history for API access
CREATE TABLE public.api_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  api_subscription_id UUID REFERENCES public.api_subscriptions(id) ON DELETE SET NULL,
  paystack_reference TEXT UNIQUE NOT NULL,
  amount_kobo INTEGER NOT NULL,
  currency TEXT DEFAULT 'NGN',
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'pending', 'refunded')),
  tier TEXT NOT NULL,
  payment_method TEXT,
  metadata JSONB DEFAULT '{}',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add Paystack customer code to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT;

-- Create indexes for performance
CREATE INDEX idx_api_subscriptions_user_id ON public.api_subscriptions(user_id);
CREATE INDEX idx_api_subscriptions_status ON public.api_subscriptions(status);
CREATE INDEX idx_api_subscriptions_paystack_code ON public.api_subscriptions(paystack_subscription_code);
CREATE INDEX idx_api_payments_user_id ON public.api_payments(user_id);
CREATE INDEX idx_api_payments_subscription_id ON public.api_payments(api_subscription_id);
CREATE INDEX idx_api_payments_created_at ON public.api_payments(created_at DESC);

-- Trigger to update updated_at on api_subscriptions
CREATE TRIGGER update_api_subscriptions_updated_at
  BEFORE UPDATE ON public.api_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.api_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for api_subscriptions
CREATE POLICY "Users can view their own API subscription"
  ON public.api_subscriptions FOR SELECT
  USING (user_id IN (
    SELECT u.id FROM public.users u WHERE u.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  ));

CREATE POLICY "Users can insert their own API subscription"
  ON public.api_subscriptions FOR INSERT
  WITH CHECK (user_id IN (
    SELECT u.id FROM public.users u WHERE u.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  ));

CREATE POLICY "Users can update their own API subscription"
  ON public.api_subscriptions FOR UPDATE
  USING (user_id IN (
    SELECT u.id FROM public.users u WHERE u.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  ));

-- Service role can manage all subscriptions (for webhooks)
CREATE POLICY "Service role can manage all API subscriptions"
  ON public.api_subscriptions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policies for api_payments
CREATE POLICY "Users can view their own API payments"
  ON public.api_payments FOR SELECT
  USING (user_id IN (
    SELECT u.id FROM public.users u WHERE u.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  ));

-- Service role can manage all payments (for webhooks)
CREATE POLICY "Service role can manage all API payments"
  ON public.api_payments FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to sync API key tier with subscription tier
CREATE OR REPLACE FUNCTION public.sync_api_key_tier_with_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Trigger to sync API key tiers
CREATE TRIGGER sync_api_key_tier_on_subscription_change
  AFTER UPDATE ON public.api_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_api_key_tier_with_subscription();