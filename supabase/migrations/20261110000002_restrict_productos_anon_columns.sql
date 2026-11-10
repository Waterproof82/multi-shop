-- Close the implicit anon SELECT * exposure on public.productos.
--
-- 20260527000000_explicit_grants_data_api.sql granted table-wide
-- `SELECT ON public.productos TO anon`, and the (pre-migrations) RLS policy
-- "Publico ve productos" is permissive (`USING (true)`, whitelisted in
-- 20260731000013_extend_rls_hygiene_fn_public_blanket_true_check.sql
-- alongside empresas/categorias). None of the 26 current columns is
-- sensitive, but any future column (cost price, supplier notes, internal
-- margin, etc.) would silently inherit public anon read the moment it's
-- added — the exact bug class just fixed for public.empresas in
-- 20261110000001_restrict_empresas_secret_columns.sql: a column added for
-- an internal need becomes world-readable via
-- `GET /rest/v1/productos?select=...` without anyone touching RLS or this
-- table-wide grant.
--
-- Fix: column-level grants, secure by default.
--   * anon: ONLY the columns the public storefront actually reads/filters
--     through SupabaseProductRepository(getSupabaseAnonClient()) —
--     src/lib/server-services.ts -> getMenuUseCase() -> GetMenuUseCase ->
--     findAllByTenant(). This is exactly the set PRODUCT_PUBLIC_COLUMNS /
--     mapToDomain() read in that repository today, plus the filter/order
--     columns (empresa_id, created_at). A future column is NOT readable by
--     anon until it is explicitly added here (and to that column list).
--   * authenticated and service_role are UNTOUCHED: every admin/TPV/stock
--     path reads and writes productos exclusively through the service_role
--     client (getSupabaseClient()) — no application code reads productos
--     through an authenticated client — so this migration only tightens
--     anon.

REVOKE SELECT ON public.productos FROM anon;
GRANT SELECT (
  id, empresa_id, categoria_id,
  titulo_es, titulo_en, titulo_fr, titulo_it, titulo_de,
  descripcion_es, descripcion_en, descripcion_fr, descripcion_it, descripcion_de,
  precio, foto_url, foto_url_2, foto_object_fit,
  es_especial, activo, tipo_producto, porcentaje_impuesto_override,
  alergenos, tabla_info, created_at, slug, canonical_externo
) ON public.productos TO anon;
