-- Fix: Auto-create custom 'users' row when Supabase Auth user signs up
-- This resolves the FK constraint failure on accounts.user_id → users.id

-- 1. Function that creates a users row for every new auth.users entry
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, auth_provider, auth_provider_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    CASE
      WHEN NEW.raw_user_meta_data->>'provider' = 'google' THEN 'google'
      WHEN NEW.raw_user_meta_data->>'provider' = 'instagram' THEN 'instagram'
      ELSE 'google'
    END,
    NEW.id
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Backfill: Create users rows for any existing auth users that don't have one
INSERT INTO public.users (id, email, name, auth_provider, auth_provider_id)
SELECT
  au.id,
  COALESCE(au.email, ''),
  COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)),
  CASE
    WHEN au.raw_user_meta_data->>'provider' = 'google' THEN 'google'
    WHEN au.raw_user_meta_data->>'provider' = 'instagram' THEN 'instagram'
    ELSE 'google'
  END,
  au.id
FROM auth.users au
LEFT JOIN public.users u ON u.id = au.id
WHERE u.id IS NULL
ON CONFLICT (id) DO NOTHING;
