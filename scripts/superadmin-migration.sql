-- Migration: Create Super Admin Role
-- Run this in Supabase SQL Editor to enable super admin functionality

-- 1. The 'perfiles_admin' table already supports the 'superadmin' role
--    through the existing 'rol' column with DEFAULT 'admin'
--    No schema changes needed!

-- 2. To create a superadmin user, follow these steps:

-- Step A: Create the user in Supabase Auth (run in SQL Editor)
-- Replace 'superadmin@example.com' and 'your-password' with actual values
/*
INSERT INTO auth.users (instance_id, email, encrypted_password, email_confirmed_at, invited_at, confirmation_sent_at, recovery_sent_at, role, aud, created_at, updated_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, identity_id, id)
VALUES (
  (SELECT id FROM auth.instances LIMIT 1),
  'superadmin@example.com',
  crypt('your-password', gen_salt('bf')),
  now(),
  NULL,
  NULL,
  NULL,
  NULL,
  'authenticated',
  now(),
  now(),
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  gen_random_uuid(),
  gen_random_uuid()
);
*/

-- Step B: Create the admin profile with superadmin role (run in SQL Editor)
-- Replace '<user-id-from-step-a>' with the actual user ID
/*
INSERT INTO public.perfiles_admin (id, empresa_id, nombre_completo, rol, created_at)
VALUES ('<user-id-from-step-a>', NULL, 'Super Admin', 'superadmin', now());
*/

-- 3. Verify the superadmin was created:
-- SELECT * FROM public.perfiles_admin WHERE rol = 'superadmin';

-- 4. To remove a superadmin:
-- DELETE FROM public.perfiles_admin WHERE rol = 'superadmin' AND id = '<user-id>';
-- Then optionally delete the auth user:
-- DELETE FROM auth.users WHERE id = '<user-id>';
