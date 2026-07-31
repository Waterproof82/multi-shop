-- Tactical mitigation for the anon USING(true) SELECT policies added in
-- 20260627000001_realtime_anon_select_policies.sql. Those policies were meant
-- only to let Realtime postgres_changes reach anon subscribers, but permissive
-- RLS SELECT policies also open the table to direct PostgREST reads
-- (GET /rest/v1/<table>?select=*), exposing every company's order data
-- (delivery address, GPS coordinates, order contents, totals) to anyone with
-- the public anon key. This migration narrows what anon can read at the
-- column-privilege level while the row-level policy stays permissive, closing
-- the REST exposure immediately. The structural fix (migrating anon-facing
-- signals to Realtime Broadcast and dropping the row policies entirely) is
-- 20260731000003_mesa_sesiones_broadcast_trigger.sql and
-- 20260731000004_drop_anon_realtime_select_policies.sql.
--
-- Applied directly to production and verified via curl with the anon key:
-- unauthenticated `select=*` and sensitive-column requests now return
-- 401 permission denied; the columns granted below still return 200.

REVOKE SELECT ON public.pedidos FROM anon;
GRANT SELECT (id, empresa_id, mesa_id, sesion_id, estado, created_at) ON public.pedidos TO anon;

REVOKE SELECT ON public.mesa_sesiones FROM anon;
GRANT SELECT (id, empresa_id, mesa_id, pago_en_curso, sesion_pagada, cliente_activo, llamada_activa) ON public.mesa_sesiones TO anon;

REVOKE SELECT ON public.pedido_item_estados FROM anon;
GRANT SELECT (pedido_id, item_idx, empresa_id, estado) ON public.pedido_item_estados TO anon;
