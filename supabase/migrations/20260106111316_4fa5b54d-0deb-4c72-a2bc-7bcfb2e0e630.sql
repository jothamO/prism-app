-- Fix RLS for users, businesses, and bank_transactions tables
-- These tables have proper policies defined but may have public access issues

-- 1. Drop any overly permissive policies that might exist on users table
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;
DROP POLICY IF EXISTS "Allow public read access" ON public.users;
DROP POLICY IF EXISTS "Public read access" ON public.users;
DROP POLICY IF EXISTS "public_read" ON public.users;

-- 2. Drop any overly permissive policies on businesses table  
DROP POLICY IF EXISTS "Enable read access for all users" ON public.businesses;
DROP POLICY IF EXISTS "Allow public read access" ON public.businesses;
DROP POLICY IF EXISTS "Public read access" ON public.businesses;
DROP POLICY IF EXISTS "public_read" ON public.businesses;
DROP POLICY IF EXISTS "Anyone can view businesses" ON public.businesses;

-- 3. Drop any overly permissive policies on bank_transactions table
DROP POLICY IF EXISTS "Enable read access for all users" ON public.bank_transactions;
DROP POLICY IF EXISTS "Allow public read access" ON public.bank_transactions;
DROP POLICY IF EXISTS "Public read access" ON public.bank_transactions;
DROP POLICY IF EXISTS "public_read" ON public.bank_transactions;
DROP POLICY IF EXISTS "Anyone can view transactions" ON public.bank_transactions;

-- 4. Add INSERT policy for profiles table (allows users to create their own profile)
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- 5. Ensure businesses table has admin management policy
DROP POLICY IF EXISTS "Admins can manage all businesses" ON public.businesses;
CREATE POLICY "Admins can manage all businesses"
ON public.businesses
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- 6. Verify and recreate the proper SELECT policy for businesses
-- First drop existing to avoid conflicts, then recreate
DROP POLICY IF EXISTS "Users can view their own businesses" ON public.businesses;
CREATE POLICY "Users can view their own businesses"
ON public.businesses
FOR SELECT
USING ((auth.uid() = owner_user_id) OR has_role(auth.uid(), 'admin'::app_role));

-- 7. Ensure bank_transactions has proper SELECT policy (recreate to ensure correctness)
DROP POLICY IF EXISTS "Users can view their own transactions" ON public.bank_transactions;
CREATE POLICY "Users can view their own transactions"
ON public.bank_transactions
FOR SELECT
USING (((user_id)::text = (auth.uid())::text) OR has_role(auth.uid(), 'admin'::app_role));

-- 8. Ensure users table has proper SELECT policy (recreate to ensure correctness)
DROP POLICY IF EXISTS "Users can view their own user record" ON public.users;
CREATE POLICY "Users can view their own user record"
ON public.users
FOR SELECT
USING ((id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));