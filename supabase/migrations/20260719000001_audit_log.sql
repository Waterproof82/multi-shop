-- Create audit_log table for tracking user actions
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  actor_id UUID,
  actor_tipo TEXT NOT NULL CHECK (actor_tipo IN ('admin', 'empleado_tpv', 'waiter', 'system')),
  actor_nombre TEXT,
  action TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite index for efficient pagination per empresa
CREATE INDEX idx_audit_log_empresa_created ON public.audit_log (empresa_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Deny all anon access
CREATE POLICY "No direct anon access to audit_log"
  ON public.audit_log FOR ALL TO anon
  USING (false) WITH CHECK (false);

-- Authenticated users can only SELECT their own empresa's audit rows
CREATE POLICY "Authenticated can SELECT own empresa audit"
  ON public.audit_log FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

-- Authenticated users cannot insert/update/delete (only service_role can)
CREATE POLICY "Authenticated cannot insert/update/delete audit_log"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Authenticated cannot update audit_log"
  ON public.audit_log FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "Authenticated cannot delete audit_log"
  ON public.audit_log FOR DELETE TO authenticated
  USING (false);

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_log TO service_role;
GRANT SELECT ON public.audit_log TO authenticated;
