-- Revoke explicit anon + authenticated grants on SECURITY DEFINER functions.
-- Supabase grants EXECUTE to anon/authenticated/postgres/service_role by default.
-- REVOKE FROM PUBLIC (done in previous migration) does not remove these explicit grants.
-- service_role and postgres retain EXECUTE for backend access.

REVOKE EXECUTE ON FUNCTION public.call_notify_push(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_tgtg_cupon(uuid, text, text, text, uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.close_mesa_sesion(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deducir_stock_on_servido() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_mesas_with_sessions(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_division_pagos(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_waiter_items_update() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_waiter_new_order() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_waiter_order_validated() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.open_mesa_sesion(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.push_on_new_order() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stock_update_cantidad(uuid, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tpv_analytics_kpis(uuid, date, date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tpv_analytics_por_hora(uuid, date, date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tpv_analytics_top_productos(uuid, date, date) FROM anon, authenticated;

-- get_mi_empresa_id: revoke anon only.
-- authenticated MUST retain EXECUTE — it is called inside USING/WITH CHECK of every RLS policy.
-- The advisory warning for authenticated on get_mi_empresa_id() is intentional and accepted.
REVOKE EXECUTE ON FUNCTION public.get_mi_empresa_id() FROM anon;
