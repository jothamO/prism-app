-- Emergency Admin Access Grant for jothamossai@gmail.com
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/rjajxabpndmpcgssymxw/sql

-- Step 1: Find the user ID
DO $$
DECLARE
  target_user_id UUID;
BEGIN
  -- Get user ID from auth.users by email
  SELECT id INTO target_user_id 
  FROM auth.users 
  WHERE email = 'jothamossai@gmail.com'
  LIMIT 1;
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found: jothamossai@gmail.com';
  END IF;
  
  RAISE NOTICE 'Found user ID: %', target_user_id;
  
  -- Step 2: Remove any existing roles (to avoid duplicates)
  DELETE FROM public.user_roles 
  WHERE user_id = target_user_id;
  
  -- Step 3: Grant both admin and owner roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES 
    (target_user_id, 'admin'),
    (target_user_id, 'owner');
    
  RAISE NOTICE 'Successfully granted admin and owner roles to jothamossai@gmail.com';
END $$;

-- Verify the roles were assigned
SELECT 
  u.email,
  array_agg(ur.role) as roles
FROM auth.users u
JOIN public.user_roles ur ON ur.user_id = u.id
WHERE u.email = 'jothamossai@gmail.com'
GROUP BY u.email;
