-- Create user_payments table for tracking subscription payments
CREATE TABLE public.user_payments (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    paystack_reference TEXT NOT NULL UNIQUE,
    amount_kobo INTEGER NOT NULL,
    currency TEXT DEFAULT 'NGN',
    status TEXT NOT NULL DEFAULT 'pending',
    tier_id UUID REFERENCES public.user_pricing_tiers(id),
    billing_cycle TEXT,
    payment_method TEXT,
    paid_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add paystack_reference to user_subscriptions if not exists
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS paystack_reference TEXT;

-- Add paystack_customer_code to user_subscriptions if not exists  
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT;

-- Enable RLS
ALTER TABLE public.user_payments ENABLE ROW LEVEL SECURITY;

-- Users can view their own payments
CREATE POLICY "Users can view their own payments"
ON public.user_payments
FOR SELECT
USING (auth.uid() = user_id);

-- Only system can insert payments (via service role)
CREATE POLICY "Service role can insert payments"
ON public.user_payments
FOR INSERT
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_user_payments_user_id ON public.user_payments(user_id);
CREATE INDEX idx_user_payments_reference ON public.user_payments(paystack_reference);