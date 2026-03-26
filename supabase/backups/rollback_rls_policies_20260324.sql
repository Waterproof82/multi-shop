-- ============================================================
-- ROLLBACK: Estado de policies RLS antes de SEC-013 / SEC-015
-- Fecha: 2026-03-24
-- Uso: Si algo sale mal, ejecutar este script en Supabase SQL Editor
--      para volver al estado original.
-- ============================================================

-- Paso 1: Eliminar TODAS las policies actuales de las tablas afectadas
DROP POLICY IF EXISTS "Admin gestiona categorias" ON public.categorias;
DROP POLICY IF EXISTS "Publico ve categorias" ON public.categorias;
DROP POLICY IF EXISTS "Admin gestiona clientes" ON public.clientes;
DROP POLICY IF EXISTS "Publico crea clientes" ON public.clientes;
DROP POLICY IF EXISTS "Admin edita su empresa" ON public.empresas;
DROP POLICY IF EXISTS "Publico ve empresas" ON public.empresas;
DROP POLICY IF EXISTS "Allow anon read log_errors" ON public.log_errors;
DROP POLICY IF EXISTS "Allow service role full access to log_errors" ON public.log_errors;
DROP POLICY IF EXISTS "Admin edita pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Admin elimina pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Admin ve pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Publico crea pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Users can insert own perfil_admin" ON public.perfiles_admin;
DROP POLICY IF EXISTS "Users can select own perfil_admin" ON public.perfiles_admin;
DROP POLICY IF EXISTS "Users can update own perfil_admin" ON public.perfiles_admin;
DROP POLICY IF EXISTS "Admin gestiona productos" ON public.productos;
DROP POLICY IF EXISTS "Publico ve productos" ON public.productos;
DROP POLICY IF EXISTS "Empresa users can delete promociones" ON public.promociones;
DROP POLICY IF EXISTS "Empresa users can insert promociones" ON public.promociones;
DROP POLICY IF EXISTS "Empresa users can select promociones" ON public.promociones;
DROP POLICY IF EXISTS "Empresa users can update promociones" ON public.promociones;
-- Policies que podría haber añadido SEC-015 (limpiar también por si acaso)
DROP POLICY IF EXISTS "Public can read active empresas" ON public.empresas;
DROP POLICY IF EXISTS "Public can read productos" ON public.productos;
DROP POLICY IF EXISTS "Public can read categorias" ON public.categorias;
DROP POLICY IF EXISTS "No direct anon access to pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "No direct anon access to clientes" ON public.clientes;
DROP POLICY IF EXISTS "No direct anon access to log_errors" ON public.log_errors;
DROP POLICY IF EXISTS "No direct anon access to perfiles_admin" ON public.perfiles_admin;
DROP POLICY IF EXISTS "No direct anon access to promociones" ON public.promociones;

-- Paso 2: Restaurar el estado original (snapshot 2026-03-24)

-- categorias
CREATE POLICY "Admin gestiona categorias" ON public.categorias
  AS PERMISSIVE FOR ALL TO public
  USING ((empresa_id = get_mi_empresa_id()));

CREATE POLICY "Publico ve categorias" ON public.categorias
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

-- clientes
CREATE POLICY "Admin gestiona clientes" ON public.clientes
  AS PERMISSIVE FOR ALL TO public
  USING ((empresa_id = get_mi_empresa_id()));

CREATE POLICY "Publico crea clientes" ON public.clientes
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((empresa_id IS NOT NULL));

-- empresas
CREATE POLICY "Admin edita su empresa" ON public.empresas
  AS PERMISSIVE FOR UPDATE TO public
  USING ((id = get_mi_empresa_id()));

CREATE POLICY "Publico ve empresas" ON public.empresas
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

-- log_errors
CREATE POLICY "Allow anon read log_errors" ON public.log_errors
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

CREATE POLICY "Allow service role full access to log_errors" ON public.log_errors
  AS PERMISSIVE FOR ALL TO public
  USING (true)
  WITH CHECK (true);

-- pedidos
CREATE POLICY "Admin edita pedidos" ON public.pedidos
  AS PERMISSIVE FOR UPDATE TO public
  USING ((empresa_id = get_mi_empresa_id()));

CREATE POLICY "Admin elimina pedidos" ON public.pedidos
  AS PERMISSIVE FOR DELETE TO public
  USING ((empresa_id = get_mi_empresa_id()));

CREATE POLICY "Admin ve pedidos" ON public.pedidos
  AS PERMISSIVE FOR SELECT TO public
  USING ((empresa_id = get_mi_empresa_id()));

CREATE POLICY "Publico crea pedidos" ON public.pedidos
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((empresa_id IS NOT NULL) AND (cliente_id IS NOT NULL)));

-- perfiles_admin
CREATE POLICY "Users can insert own perfil_admin" ON public.perfiles_admin
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((id = auth.uid()));

CREATE POLICY "Users can select own perfil_admin" ON public.perfiles_admin
  AS PERMISSIVE FOR SELECT TO public
  USING ((id = auth.uid()));

CREATE POLICY "Users can update own perfil_admin" ON public.perfiles_admin
  AS PERMISSIVE FOR UPDATE TO public
  USING ((id = auth.uid()));

-- productos
CREATE POLICY "Admin gestiona productos" ON public.productos
  AS PERMISSIVE FOR ALL TO public
  USING ((empresa_id = get_mi_empresa_id()));

CREATE POLICY "Publico ve productos" ON public.productos
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

-- promociones
CREATE POLICY "Empresa users can delete promociones" ON public.promociones
  AS PERMISSIVE FOR DELETE TO public
  USING ((empresa_id IN (
    SELECT perfiles_admin.empresa_id
    FROM perfiles_admin
    WHERE (perfiles_admin.id = auth.uid())
  )));

CREATE POLICY "Empresa users can insert promociones" ON public.promociones
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((empresa_id IN (
    SELECT perfiles_admin.empresa_id
    FROM perfiles_admin
    WHERE (perfiles_admin.id = auth.uid())
  )));

CREATE POLICY "Empresa users can select promociones" ON public.promociones
  AS PERMISSIVE FOR SELECT TO public
  USING ((empresa_id IN (
    SELECT perfiles_admin.empresa_id
    FROM perfiles_admin
    WHERE (perfiles_admin.id = auth.uid())
  )));

CREATE POLICY "Empresa users can update promociones" ON public.promociones
  AS PERMISSIVE FOR UPDATE TO public
  USING ((empresa_id IN (
    SELECT perfiles_admin.empresa_id
    FROM perfiles_admin
    WHERE (perfiles_admin.id = auth.uid())
  )));
