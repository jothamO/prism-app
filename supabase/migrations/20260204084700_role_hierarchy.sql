-- Migration: Update has_role to implement role hierarchy
-- Hierarchy: owner > admin > moderator > user
-- An owner has all permissions of admin, moderator, and user
-- An admin has all permissions of moderator and user
-- A moderator has all permissions of user

-- Drop and recreate with hierarchy logic
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND (
        -- Direct role match
        ur.role = _role
        -- OR hierarchy: owner has all roles
        OR (ur.role = 'owner')
        -- OR hierarchy: admin has moderator and user
        OR (ur.role = 'admin' AND _role IN ('moderator', 'user'))
        -- OR hierarchy: moderator has user
        OR (ur.role = 'moderator' AND _role = 'user')
      )
  )
$$;

COMMENT ON FUNCTION public.has_role IS 'Check if user has a role with hierarchy: owner > admin > moderator > user';
