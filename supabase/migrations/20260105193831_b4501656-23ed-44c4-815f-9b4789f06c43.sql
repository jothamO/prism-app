-- Make user_id and registration_number nullable since the edge function uses owner_user_id and cac_number
ALTER TABLE public.businesses ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.businesses ALTER COLUMN registration_number DROP NOT NULL;

-- Drop existing RLS policies that reference user_id
DROP POLICY IF EXISTS "Users can create their own businesses" ON public.businesses;
DROP POLICY IF EXISTS "Users can delete their own businesses" ON public.businesses;
DROP POLICY IF EXISTS "Users can update their own businesses" ON public.businesses;
DROP POLICY IF EXISTS "Users can view their own businesses" ON public.businesses;

-- Recreate RLS policies using owner_user_id instead of user_id
CREATE POLICY "Users can create their own businesses" 
ON public.businesses 
FOR INSERT 
WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Users can delete their own businesses" 
ON public.businesses 
FOR DELETE 
USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can update their own businesses" 
ON public.businesses 
FOR UPDATE 
USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can view their own businesses" 
ON public.businesses 
FOR SELECT 
USING (auth.uid() = owner_user_id OR has_role(auth.uid(), 'admin'::app_role));