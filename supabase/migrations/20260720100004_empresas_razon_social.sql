-- T4: Add razon_social to empresas
-- Idempotent: ADD COLUMN IF NOT EXISTS
-- razon_social: legal entity name (S.L., S.A., etc.)
--   NULL = use nombre as legal name (autónomos / freelancers)
-- No NOT NULL constraint — existing tenants must not break.

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS razon_social TEXT DEFAULT NULL;
