-- Insert missing user profile for legacy auth users
INSERT INTO users (auth_user_id, email, full_name, onboarding_completed)
SELECT 
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
  true
FROM auth.users
WHERE id = 'ab628b75-3165-4ead-9dbe-28b20dc2d3f2'
  AND NOT EXISTS (
    SELECT 1 FROM users WHERE auth_user_id = 'ab628b75-3165-4ead-9dbe-28b20dc2d3f2'
  );