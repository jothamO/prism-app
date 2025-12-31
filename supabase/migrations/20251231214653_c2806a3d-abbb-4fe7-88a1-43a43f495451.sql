-- Add age column to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS age INTEGER;

-- Create user_tax_profiles table
CREATE TABLE IF NOT EXISTS public.user_tax_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    user_type VARCHAR(50) DEFAULT 'individual',
    employment_status VARCHAR(50),
    income_types TEXT[] DEFAULT ARRAY[]::TEXT[],
    is_pensioner BOOLEAN DEFAULT FALSE,
    is_senior_citizen BOOLEAN DEFAULT FALSE,
    is_disabled BOOLEAN DEFAULT FALSE,
    has_diplomatic_immunity BOOLEAN DEFAULT FALSE,
    industry_type VARCHAR(100),
    is_professional_services BOOLEAN DEFAULT FALSE,
    ai_confidence DECIMAL(5,4),
    user_confirmed BOOLEAN DEFAULT FALSE,
    last_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create profile_corrections table
CREATE TABLE IF NOT EXISTS public.profile_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    ai_prediction JSONB NOT NULL,
    user_correction JSONB NOT NULL,
    signals JSONB,
    correction_reason TEXT,
    used_in_training BOOLEAN DEFAULT FALSE,
    training_batch_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_tax_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_corrections ENABLE ROW LEVEL SECURITY;

-- Create indexes for user_tax_profiles
CREATE INDEX IF NOT EXISTS idx_user_tax_profiles_user ON public.user_tax_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tax_profiles_pensioner ON public.user_tax_profiles(user_id) WHERE is_pensioner = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_tax_profiles_employment ON public.user_tax_profiles(employment_status);

-- Create indexes for profile_corrections
CREATE INDEX IF NOT EXISTS idx_profile_corrections_training ON public.profile_corrections(id) WHERE used_in_training = FALSE;
CREATE INDEX IF NOT EXISTS idx_profile_corrections_user ON public.profile_corrections(user_id, created_at DESC);

-- RLS Policies for user_tax_profiles
CREATE POLICY "Users can view their own tax profile"
ON public.user_tax_profiles
FOR SELECT
USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create their own tax profile"
ON public.user_tax_profiles
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own tax profile"
ON public.user_tax_profiles
FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all tax profiles"
ON public.user_tax_profiles
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for profile_corrections
CREATE POLICY "Users can view their own corrections"
ON public.profile_corrections
FOR SELECT
USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create their own corrections"
ON public.profile_corrections
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all corrections"
ON public.profile_corrections
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at on user_tax_profiles
CREATE TRIGGER update_user_tax_profiles_updated_at
BEFORE UPDATE ON public.user_tax_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();