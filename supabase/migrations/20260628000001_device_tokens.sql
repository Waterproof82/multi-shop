CREATE TABLE IF NOT EXISTS public.device_tokens (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('waiter', 'kitchen')),
  fcm_token   text NOT NULL UNIQUE,
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_empresa_role ON public.device_tokens (empresa_id, role);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "No direct anon access to device_tokens"
  ON public.device_tokens FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY IF NOT EXISTS "Admin manages device_tokens"
  ON public.device_tokens FOR ALL TO authenticated
  USING (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated;
