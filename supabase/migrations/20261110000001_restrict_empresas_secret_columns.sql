-- Close the anon/authenticated exposure of tenant secrets on public.empresas.
--
-- 20260527000000_explicit_grants_data_api.sql granted table-wide
-- `SELECT ON public.empresas TO anon`, and the RLS policy
-- "Publico ve empresas" is `FOR SELECT TO public USING (true)`. Later,
-- 20260527100000_riders_app.sql and 20260521130331_mesa_waiter_panel.sql
-- added payment/delivery secrets to this same table. Result: anyone holding
-- the public anon key could read `redsys_secret_key`, `glovo_private_key`,
-- `waiter_pin_hash`, etc. for EVERY tenant via
-- GET /rest/v1/empresas?select=..., bypassing all application code.
-- Every authenticated user (any tenant's staff) could do the same across
-- tenants. Same vulnerability class as 20260731000002 (pedidos/mesa_sesiones).
--
-- Fix: column-level grants.
--   * anon: ONLY the columns the public storefront actually reads through
--     SupabaseEmpresaRepository(getSupabaseAnonClient()) — the union of
--     getById, findByDomain/findBySlug and PUBLIC_SELECT, plus the filter
--     columns (id, dominio, slug). Secure by default: a future column is NOT
--     readable by anon until it is explicitly added here.
--   * authenticated: every column EXCEPT the secrets. No application path
--     reads empresas through an authenticated client today (all server code
--     uses the service role), so this only removes cross-tenant secret reads.
--   * service_role keeps full access (payments, Glovo and waiter auth run
--     server-side with it).
--
-- Ops follow-up (not code): rotate every tenant's Redsys secret key and
-- Glovo private key, because they were readable before this migration.

REVOKE SELECT ON public.empresas FROM anon;
GRANT SELECT (
  id, nombre, dominio, slug, tipo, moneda, subdomain_pedidos,
  logo_url, mostrar_logo, url_image, banner_fit, tipo_banner, banner_slides,
  mostrar_carrito, mostrar_promociones, mostrar_tgtg,
  color_primary, color_primary_foreground, color_secondary, color_secondary_foreground,
  color_accent, color_accent_foreground, color_background, color_foreground,
  descripcion_es, descripcion_en, descripcion_fr, descripcion_it, descripcion_de,
  titulo, subtitulo,
  subtitulo2_es, subtitulo2_en, subtitulo2_fr, subtitulo2_it, subtitulo2_de,
  footer1_es, footer1_en, footer1_fr, footer1_it, footer1_de,
  footer2_es, footer2_en, footer2_fr, footer2_it, footer2_de,
  fb, instagram, url_mapa, google_reviews_url,
  direccion, telefono_whatsapp, email_notification, telegram_chat_id, nif, razon_social,
  tipo_impuesto, porcentaje_impuesto,
  descuento_bienvenida_activo, descuento_bienvenida_porcentaje, descuento_bienvenida_duracion,
  mesas_habilitadas, pagos_pickup_habilitados, validacion_pedidos_habilitada,
  delivery_habilitado, envio_domicilio_habilitado, landing_habilitada
) ON public.empresas TO anon;

REVOKE SELECT ON public.empresas FROM authenticated;
GRANT SELECT (
  id, nombre, dominio, logo_url, mostrar_carrito, moneda, created_at, subdomain_pedidos,
  email_notification, url_image,
  descripcion_es, descripcion_en, descripcion_fr, descripcion_it, descripcion_de,
  titulo, subtitulo,
  subtitulo2_es, subtitulo2_en, subtitulo2_fr, subtitulo2_it, subtitulo2_de,
  footer1_es, footer1_en, footer1_fr, footer1_it, footer1_de,
  footer2_es, footer2_en, footer2_fr, footer2_it, footer2_de,
  color_primary, color_primary_foreground, color_secondary, color_secondary_foreground,
  color_accent, color_accent_foreground, color_background, color_foreground,
  telefono_whatsapp, direccion, fb, instagram, url_mapa, slug,
  mostrar_promociones, mostrar_tgtg,
  descuento_bienvenida_activo, descuento_bienvenida_porcentaje, descuento_bienvenida_duracion,
  banner_fit, mostrar_logo, tipo, telegram_chat_id,
  delivery_min_order_cents, delivery_fee_surcharge_cents,
  pagos_mesa_habilitados, mesas_habilitadas, pagos_pickup_habilitados,
  validacion_pedidos_habilitada, delivery_habilitado, google_reviews_url,
  nif, tipo_impuesto, porcentaje_impuesto, razon_social, verifactu_mode,
  envio_domicilio_habilitado, tipo_banner, banner_slides, landing_habilitada,
  tpv_habilitado, es_prueba
) ON public.empresas TO authenticated;
