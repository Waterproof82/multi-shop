-- Enable Row Level Security on all application tables.
-- The service_role key (used by the server) bypasses RLS automatically.
-- Anon and authenticated roles are restricted to read-only access on
-- public-facing tables; all write operations go through service_role.

-- Idempotent: RLS is already enabled on all tables, this is a no-op
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfiles_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE promociones ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_errors ENABLE ROW LEVEL SECURITY;

-- Remove legacy permissive policies that allowed anon direct writes.
-- All writes now go through service_role (which bypasses RLS), so these
-- policies are redundant and widen the attack surface unnecessarily.
DROP POLICY IF EXISTS "Publico crea pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Publico crea clientes" ON public.clientes;
DROP POLICY IF EXISTS "Allow anon read log_errors" ON public.log_errors;

-- Explicit deny for anon on sensitive tables.
-- With RLS + no matching policy the default is deny, but explicit policies
-- are clearer and prevent accidental permissive grants from re-opening access.
CREATE POLICY "No direct anon access to pedidos" ON public.pedidos
  FOR ALL TO anon
  USING (false);

CREATE POLICY "No direct anon access to clientes" ON public.clientes
  FOR ALL TO anon
  USING (false);

CREATE POLICY "No direct anon access to log_errors" ON public.log_errors
  FOR ALL TO anon
  USING (false);

CREATE POLICY "No direct anon access to perfiles_admin" ON public.perfiles_admin
  FOR ALL TO anon
  USING (false);

CREATE POLICY "No direct anon access to promociones" ON public.promociones
  FOR ALL TO anon
  USING (false);
