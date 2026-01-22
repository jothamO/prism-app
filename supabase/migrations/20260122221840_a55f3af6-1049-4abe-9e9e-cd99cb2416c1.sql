-- Fix the tier_id foreign key to point to user_pricing_tiers instead of api_pricing_tiers
ALTER TABLE public.user_subscriptions 
DROP CONSTRAINT IF EXISTS user_subscriptions_tier_id_fkey;

ALTER TABLE public.user_subscriptions 
ADD CONSTRAINT user_subscriptions_tier_id_fkey 
FOREIGN KEY (tier_id) REFERENCES public.user_pricing_tiers(id);