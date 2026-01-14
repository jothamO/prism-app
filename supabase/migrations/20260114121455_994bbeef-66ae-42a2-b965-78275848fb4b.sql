-- Create developer_access_requests table
CREATE TABLE public.developer_access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    
    -- Company details
    company_name VARCHAR(255),
    company_website VARCHAR(500),
    technical_contact_name VARCHAR(255),
    technical_contact_email VARCHAR(255),
    
    -- Use case description
    use_case_description TEXT NOT NULL,
    expected_monthly_requests INTEGER,
    target_api_tier VARCHAR(20) DEFAULT 'starter',
    
    -- Admin review fields
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    admin_notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add developer access columns to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS has_developer_access BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS developer_access_granted_at TIMESTAMPTZ;

-- Enable RLS
ALTER TABLE public.developer_access_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
CREATE POLICY "Users can view own developer requests"
ON public.developer_access_requests FOR SELECT
TO authenticated
USING (user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));

-- Users can insert their own requests
CREATE POLICY "Users can create own developer requests"
ON public.developer_access_requests FOR INSERT
TO authenticated
WITH CHECK (user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));

-- Admins can view all requests
CREATE POLICY "Admins can view all developer requests"
ON public.developer_access_requests FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update requests
CREATE POLICY "Admins can update developer requests"
ON public.developer_access_requests FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_developer_access_requests_updated_at
    BEFORE UPDATE ON public.developer_access_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();