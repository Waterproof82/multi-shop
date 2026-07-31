-- Closes the RLS gap opened by 20260627000001_realtime_anon_select_policies.sql.
-- Those USING(true) SELECT policies for `anon` were meant only to let Realtime
-- postgres_changes reach anon subscribers, but permissive RLS SELECT policies
-- also open the table to direct PostgREST reads by anyone holding the public
-- anon key — GET /rest/v1/pedidos?select=* returned every company's orders
-- (delivery address, GPS coordinates, order contents, totals, notes).
--
-- 20260731000002_restrict_anon_columns_realtime_tables.sql already applied a
-- tactical column-level GRANT restriction to close the REST exposure
-- immediately. This migration is the structural fix: it drops the row-level
-- policies entirely now that anon-facing consumers no longer depend on
-- postgres_changes for these three tables —
--   - pedidos / pedido_item_estados: already covered by the existing
--     notify_waiter_new_order / notify_waiter_order_validated /
--     notify_waiter_items_update broadcast triggers (20260627000003/000004).
--   - mesa_sesiones: covered by the new mesa_sesiones_notify_update broadcast
--     trigger (20260731000003_mesa_sesiones_broadcast_trigger.sql).
--
-- ⚠️ DO NOT apply this migration until the frontend deploy that replaces the
-- postgres_changes subscriptions on mesa_sesiones with the 'mesa-sesion-update'
-- broadcast channel is live (client-menu-page.tsx, waiter-banner.tsx,
-- waiter-login-form.tsx, tpv-catalog-ctx.tsx, mesa-orders-client.tsx).
-- Applying it earlier will not break pedidos/pedido_item_estados (broadcast
-- already covers those), but will silently stop mesa_sesiones realtime
-- updates (payment lock detection on the client menu, waiter mesa lock)
-- until the new frontend code is live.

DROP POLICY IF EXISTS "Anon puede leer pedidos (Realtime)" ON public.pedidos;
DROP POLICY IF EXISTS "Anon puede leer mesa_sesiones (Realtime)" ON public.mesa_sesiones;
DROP POLICY IF EXISTS "Anon puede leer pedido_item_estados (Realtime)" ON public.pedido_item_estados;

-- The tactical column-level GRANTs from 20260731000002 stay in place after this
-- (defense in depth): even if a future migration re-adds a permissive SELECT
-- policy by mistake, anon still can't read sensitive columns via REST.
