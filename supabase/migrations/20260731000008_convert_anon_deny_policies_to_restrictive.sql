-- Systemic hardening following the RLS leaks fixed in 20260731000002-000007.
--
-- Root cause of both incidents: the "No direct anon access to X" deny-all
-- policy on pedidos/mesa_sesiones/pedido_item_estados/clientes was PERMISSIVE.
-- Permissive policies for the same role/command are combined with OR, so a
-- later, careless permissive policy with `USING (true)` (added for an
-- unrelated reason — Realtime, or "select idioma") silently overrode the
-- deny-all and exposed full tables. `clientes` and `pedidos` were saved from
-- their respective incidents purely by accident: their deny-all policies
-- happened to already be RESTRICTIVE (see 20260527000000_explicit_grants_data_api.sql
-- and later hardening), and RESTRICTIVE policies are AND'd against every
-- permissive one — they can only narrow access, never grant it, regardless of
-- what other policies exist.
--
-- This migration converts every remaining PERMISSIVE "no anon access" policy
-- to RESTRICTIVE across the schema (46 policies / 44 tables — full list
-- produced by querying pg_policies for roles={anon}, qual=false,
-- permissive=PERMISSIVE). This is a pure hardening move with zero behavior
-- change for anon today: for every one of these tables, the deny-all is
-- currently the ONLY policy applicable to anon, so PERMISSIVE-false and
-- RESTRICTIVE-false produce identical results right now. The difference only
-- matters for the future: it makes this whole class of bug structurally
-- impossible to reintroduce by accident — any permissive `true` policy added
-- later for `public`/`anon` on any of these tables will be neutralized
-- automatically, instead of requiring someone to remember and manually check.
--
-- Not touched (already RESTRICTIVE, or out of scope):
--   clientes, log_errors, pedidos, perfiles_admin, promociones — already
--   RESTRICTIVE. mesa_sesiones/pedido_item_estados ARE included below since
--   despite being fixed in 20260731000002-000006, their deny-all itself was
--   never converted to RESTRICTIVE — this migration completes that.

-- --- albaranes_compra ---
DROP POLICY IF EXISTS "anon no access albaranes_compra" ON public.albaranes_compra;
CREATE POLICY "anon no access albaranes_compra" ON public.albaranes_compra AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- albaranes_compra_items ---
DROP POLICY IF EXISTS "anon no access albaranes_compra_items" ON public.albaranes_compra_items;
CREATE POLICY "anon no access albaranes_compra_items" ON public.albaranes_compra_items AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- audit_log ---
DROP POLICY IF EXISTS "No direct anon access to audit_log" ON public.audit_log;
CREATE POLICY "No direct anon access to audit_log" ON public.audit_log AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- catalogo_compra ---
DROP POLICY IF EXISTS "anon no access catalogo_compra" ON public.catalogo_compra;
CREATE POLICY "anon no access catalogo_compra" ON public.catalogo_compra AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- codigos_descuento ---
DROP POLICY IF EXISTS "No anon access" ON public.codigos_descuento;
CREATE POLICY "No anon access" ON public.codigos_descuento AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- complemento_grupos ---
DROP POLICY IF EXISTS "No anon access to complemento_grupos" ON public.complemento_grupos;
CREATE POLICY "No anon access to complemento_grupos" ON public.complemento_grupos AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- complemento_opciones ---
DROP POLICY IF EXISTS "No anon access to complemento_opciones" ON public.complemento_opciones;
CREATE POLICY "No anon access to complemento_opciones" ON public.complemento_opciones AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- device_tokens ---
DROP POLICY IF EXISTS "No direct anon access to device_tokens" ON public.device_tokens;
CREATE POLICY "No direct anon access to device_tokens" ON public.device_tokens AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- empleados_tpv ---
DROP POLICY IF EXISTS "No direct anon access to empleados_tpv" ON public.empleados_tpv;
CREATE POLICY "No direct anon access to empleados_tpv" ON public.empleados_tpv AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- facturas_proveedor ---
DROP POLICY IF EXISTS "anon no access facturas_proveedor" ON public.facturas_proveedor;
CREATE POLICY "anon no access facturas_proveedor" ON public.facturas_proveedor AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- facturas_proveedor_albaranes ---
DROP POLICY IF EXISTS "anon no access facturas_albaranes" ON public.facturas_proveedor_albaranes;
CREATE POLICY "anon no access facturas_albaranes" ON public.facturas_proveedor_albaranes AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- ingredientes ---
DROP POLICY IF EXISTS "No anon access to ingredientes" ON public.ingredientes;
CREATE POLICY "No anon access to ingredientes" ON public.ingredientes AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- lc_audit_log ---
DROP POLICY IF EXISTS "No direct anon access to lc_audit_log" ON public.lc_audit_log;
CREATE POLICY "No direct anon access to lc_audit_log" ON public.lc_audit_log AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- lc_chain_anchors ---
DROP POLICY IF EXISTS "No direct anon access to lc_chain_anchors" ON public.lc_chain_anchors;
CREATE POLICY "No direct anon access to lc_chain_anchors" ON public.lc_chain_anchors AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- lc_fichajes ---
DROP POLICY IF EXISTS "No direct anon access to lc_fichajes" ON public.lc_fichajes;
CREATE POLICY "No direct anon access to lc_fichajes" ON public.lc_fichajes AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- lc_fichajes_2026_07 ---
DROP POLICY IF EXISTS "No direct anon access to lc_fichajes_2026_07" ON public.lc_fichajes_2026_07;
CREATE POLICY "No direct anon access to lc_fichajes_2026_07" ON public.lc_fichajes_2026_07 AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- lc_fichajes_2026_08 ---
DROP POLICY IF EXISTS "No direct anon access to lc_fichajes_2026_08" ON public.lc_fichajes_2026_08;
CREATE POLICY "No direct anon access to lc_fichajes_2026_08" ON public.lc_fichajes_2026_08 AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- lc_fichajes_hold_archive ---
DROP POLICY IF EXISTS "No direct anon access to lc_fichajes_hold_archive" ON public.lc_fichajes_hold_archive;
CREATE POLICY "No direct anon access to lc_fichajes_hold_archive" ON public.lc_fichajes_hold_archive AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- lc_horas_extra ---
DROP POLICY IF EXISTS "No direct anon access to lc_horas_extra" ON public.lc_horas_extra;
CREATE POLICY "No direct anon access to lc_horas_extra" ON public.lc_horas_extra AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- lc_legal_holds ---
DROP POLICY IF EXISTS "No direct anon access to lc_legal_holds" ON public.lc_legal_holds;
CREATE POLICY "No direct anon access to lc_legal_holds" ON public.lc_legal_holds AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- lc_perfil_laboral ---
DROP POLICY IF EXISTS "No direct anon access to lc_perfil_laboral" ON public.lc_perfil_laboral;
CREATE POLICY "No direct anon access to lc_perfil_laboral" ON public.lc_perfil_laboral AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- lc_review_queue ---
DROP POLICY IF EXISTS "No direct anon access to lc_review_queue" ON public.lc_review_queue;
CREATE POLICY "No direct anon access to lc_review_queue" ON public.lc_review_queue AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- lc_rlt_asignaciones ---
DROP POLICY IF EXISTS "No direct anon access to lc_rlt_asignaciones" ON public.lc_rlt_asignaciones;
CREATE POLICY "No direct anon access to lc_rlt_asignaciones" ON public.lc_rlt_asignaciones AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- mermas ---
DROP POLICY IF EXISTS "No anon access to mermas" ON public.mermas;
CREATE POLICY "No anon access to mermas" ON public.mermas AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- mesa_client_tokens ---
DROP POLICY IF EXISTS "No direct anon access to mesa_client_tokens" ON public.mesa_client_tokens;
CREATE POLICY "No direct anon access to mesa_client_tokens" ON public.mesa_client_tokens AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- mesa_division_pagos ---
DROP POLICY IF EXISTS "No direct anon access to mesa_division_pagos" ON public.mesa_division_pagos;
CREATE POLICY "No direct anon access to mesa_division_pagos" ON public.mesa_division_pagos AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- mesa_item_pagos ---
DROP POLICY IF EXISTS "No direct anon access to mesa_item_pagos" ON public.mesa_item_pagos;
CREATE POLICY "No direct anon access to mesa_item_pagos" ON public.mesa_item_pagos AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- mesa_pagos_personalizados ---
DROP POLICY IF EXISTS "No direct anon access to mesa_pagos_personalizados" ON public.mesa_pagos_personalizados;
CREATE POLICY "No direct anon access to mesa_pagos_personalizados" ON public.mesa_pagos_personalizados AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- mesa_sesiones ---
DROP POLICY IF EXISTS "No direct anon access to mesa_sesiones" ON public.mesa_sesiones;
CREATE POLICY "No direct anon access to mesa_sesiones" ON public.mesa_sesiones AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- mesas ---
DROP POLICY IF EXISTS "No direct anon access to mesas" ON public.mesas;
CREATE POLICY "No direct anon access to mesas" ON public.mesas AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- movimientos_stock ---
DROP POLICY IF EXISTS "No anon access to movimientos_stock" ON public.movimientos_stock;
CREATE POLICY "No anon access to movimientos_stock" ON public.movimientos_stock AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- pedido_item_estados ---
DROP POLICY IF EXISTS "No direct anon access to pedido_item_estados" ON public.pedido_item_estados;
CREATE POLICY "No direct anon access to pedido_item_estados" ON public.pedido_item_estados AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- pedidos_compra ---
DROP POLICY IF EXISTS "anon no access pedidos_compra" ON public.pedidos_compra;
CREATE POLICY "anon no access pedidos_compra" ON public.pedidos_compra AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- pedidos_compra_items ---
DROP POLICY IF EXISTS "anon no access pedidos_compra_items" ON public.pedidos_compra_items;
CREATE POLICY "anon no access pedidos_compra_items" ON public.pedidos_compra_items AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- producto_complemento_grupos (2 pre-existing deny policies) ---
DROP POLICY IF EXISTS "No anon access to producto_complemento_grupos" ON public.producto_complemento_grupos;
CREATE POLICY "No anon access to producto_complemento_grupos" ON public.producto_complemento_grupos AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "anon_no_access_pcg" ON public.producto_complemento_grupos;
CREATE POLICY "anon_no_access_pcg" ON public.producto_complemento_grupos AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- proveedores ---
DROP POLICY IF EXISTS "anon no access proveedores" ON public.proveedores;
CREATE POLICY "anon no access proveedores" ON public.proveedores AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- receta_items ---
DROP POLICY IF EXISTS "No anon access to receta_items" ON public.receta_items;
CREATE POLICY "No anon access to receta_items" ON public.receta_items AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- rgpd_purge_log ---
DROP POLICY IF EXISTS "No direct anon access to rgpd_purge_log" ON public.rgpd_purge_log;
CREATE POLICY "No direct anon access to rgpd_purge_log" ON public.rgpd_purge_log AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- tgtg_items ---
DROP POLICY IF EXISTS "No direct anon access to tgtg_items" ON public.tgtg_items;
CREATE POLICY "No direct anon access to tgtg_items" ON public.tgtg_items AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- tgtg_promociones ---
DROP POLICY IF EXISTS "No direct anon access to tgtg_promociones" ON public.tgtg_promociones;
CREATE POLICY "No direct anon access to tgtg_promociones" ON public.tgtg_promociones AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- tgtg_reservas ---
DROP POLICY IF EXISTS "No direct anon access to tgtg_reservas" ON public.tgtg_reservas;
CREATE POLICY "No direct anon access to tgtg_reservas" ON public.tgtg_reservas AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- tpv_cobros ---
DROP POLICY IF EXISTS "No direct anon access to tpv_cobros" ON public.tpv_cobros;
CREATE POLICY "No direct anon access to tpv_cobros" ON public.tpv_cobros AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- tpv_turno_eventos ---
DROP POLICY IF EXISTS "No direct anon access to tpv_turno_eventos" ON public.tpv_turno_eventos;
CREATE POLICY "No direct anon access to tpv_turno_eventos" ON public.tpv_turno_eventos AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- tpv_turnos ---
DROP POLICY IF EXISTS "No direct anon access to tpv_turnos" ON public.tpv_turnos;
CREATE POLICY "No direct anon access to tpv_turnos" ON public.tpv_turnos AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- --- valoraciones ---
DROP POLICY IF EXISTS "No direct anon access to valoraciones" ON public.valoraciones;
CREATE POLICY "No direct anon access to valoraciones" ON public.valoraciones AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
