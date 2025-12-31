-- Create receipts table for OCR-processed receipts
CREATE TABLE IF NOT EXISTS public.receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    image_url TEXT,
    merchant VARCHAR(255),
    amount NUMERIC(15,2),
    date DATE,
    category VARCHAR(100),
    confidence NUMERIC(5,4),
    confirmed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create conversation_state table for multi-platform chat state
CREATE TABLE IF NOT EXISTS public.conversation_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id VARCHAR(100),
    whatsapp_id VARCHAR(100),
    expecting VARCHAR(100),
    context JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_telegram_id UNIQUE (telegram_id),
    CONSTRAINT unique_whatsapp_id UNIQUE (whatsapp_id)
);

-- Add Telegram/platform support columns to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS telegram_id VARCHAR(100) UNIQUE,
ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(100),
ADD COLUMN IF NOT EXISTS whatsapp_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS full_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS nin VARCHAR(11),
ADD COLUMN IF NOT EXISTS cac_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS tax_regime VARCHAR(10),
ADD COLUMN IF NOT EXISTS company_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'whatsapp';

-- Make columns nullable for Telegram users who don't have WhatsApp
ALTER TABLE public.users ALTER COLUMN whatsapp_number DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN business_name DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN tin DROP NOT NULL;

-- Enable RLS on new tables
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_state ENABLE ROW LEVEL SECURITY;

-- RLS policies for receipts
CREATE POLICY "Users can view own receipts" ON public.receipts
    FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create own receipts" ON public.receipts
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own receipts" ON public.receipts
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own receipts" ON public.receipts
    FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all receipts" ON public.receipts
    FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for conversation_state (service-level access for bot)
CREATE POLICY "Admins can manage all conversation states" ON public.conversation_state
    FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage conversation states" ON public.conversation_state
    FOR ALL USING (true) WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_receipts_user_id ON public.receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_receipts_date ON public.receipts(date);
CREATE INDEX IF NOT EXISTS idx_conversation_state_telegram ON public.conversation_state(telegram_id) WHERE telegram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversation_state_whatsapp ON public.conversation_state(whatsapp_id) WHERE whatsapp_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON public.users(telegram_id) WHERE telegram_id IS NOT NULL;

-- Trigger for updated_at on receipts
CREATE TRIGGER update_receipts_updated_at
    BEFORE UPDATE ON public.receipts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on conversation_state
CREATE TRIGGER update_conversation_state_updated_at
    BEFORE UPDATE ON public.conversation_state
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();