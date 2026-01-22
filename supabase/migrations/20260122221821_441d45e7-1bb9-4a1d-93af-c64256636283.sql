-- Add foreign key constraint from user_subscriptions to user_pricing_tiers
-- First verify both tables exist and have the right columns
DO $$
BEGIN
    -- Only add if constraint doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'user_subscriptions_tier_id_fkey' 
        AND table_name = 'user_subscriptions'
    ) THEN
        ALTER TABLE public.user_subscriptions 
        ADD CONSTRAINT user_subscriptions_tier_id_fkey 
        FOREIGN KEY (tier_id) REFERENCES public.user_pricing_tiers(id);
    END IF;
END $$;

-- Also add user_id foreign key if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'user_subscriptions_user_id_fkey' 
        AND table_name = 'user_subscriptions'
    ) THEN
        ALTER TABLE public.user_subscriptions 
        ADD CONSTRAINT user_subscriptions_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES public.users(id);
    END IF;
END $$;