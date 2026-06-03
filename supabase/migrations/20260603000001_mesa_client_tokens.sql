-- ============================================================
-- mesa_client_tokens
-- One row per device per active mesa session.
-- Token is invalidated when the session closes (cerrada_at set)
-- or when expires_at passes.
-- ON DELETE CASCADE handles physical row cleanup (future jobs).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.mesa_client_tokens (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mesa_sesion_id  uuid        NOT NULL REFERENCES public.mesa_sesiones(id) ON DELETE CASCADE,
  token           uuid        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mesa_client_tokens_token
  ON public.mesa_client_tokens(token);

CREATE INDEX IF NOT EXISTS idx_mesa_client_tokens_sesion
  ON public.mesa_client_tokens(mesa_sesion_id);

-- RLS: anon never touches this table directly
ALTER TABLE public.mesa_client_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to mesa_client_tokens"
  ON public.mesa_client_tokens FOR ALL TO anon
  USING (false) WITH CHECK (false);

-- service_role: all operations (API routes use service_role)
GRANT SELECT, INSERT, DELETE ON public.mesa_client_tokens TO service_role;
