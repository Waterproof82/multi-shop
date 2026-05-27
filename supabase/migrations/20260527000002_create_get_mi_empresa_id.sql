-- Capture get_mi_empresa_id() into migrations.
-- This function existed in production but was never tracked — created
-- directly via SQL editor. Any fresh project or CI reset would fail
-- on all RLS policies that reference it.
--
-- SECURITY DEFINER: runs with owner privileges so it can read
-- perfiles_admin regardless of the calling role's grants.
-- search_path fixed to 'public' to prevent search_path hijacking.

CREATE OR REPLACE FUNCTION public.get_mi_empresa_id()
  RETURNS uuid
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT empresa_id FROM public.perfiles_admin
  WHERE id = auth.uid()
  LIMIT 1;
$$;
