-- Cleanup from the same external audit as 20260731000019: 14 trigger
-- functions (RETURNS TRIGGER) in `public` carried EXECUTE grants for
-- `PUBLIC` (inherited by anon/authenticated) plus explicit grants to both
-- roles — leftover from the same pre-Oct-2026 default-privilege posture.
--
-- check_public_function_grants() deliberately excludes trigger functions
-- from its scan (see security.md → "Función de auditoría —
-- check_public_function_grants()"): Postgres refuses to invoke a
-- RETURNS TRIGGER function outside of an actual trigger firing, regardless
-- of EXECUTE grants, so this was never callable via
-- `/rest/v1/rpc/<trigger_fn>`. Verified empirically before writing this
-- migration (scratch table + function + trigger, EXECUTE revoked from
-- `authenticated`/PUBLIC, INSERT as `authenticated` still fired the trigger
-- successfully, then rolled back) — trigger firing does not check EXECUTE
-- privilege on the invoking role at all, only at direct-call time, and
-- direct calls to trigger functions are already rejected unconditionally.
--
-- Not adding a regression test for this: it's provably not exploitable via
-- RPC today (same reasoning check_public_function_grants() already
-- documents), so this is least-privilege hygiene, not a vulnerability fix —
-- building scan infrastructure for a theoretical, already-blocked path isn't
-- worth the maintenance cost. Listed explicitly (not a dynamic loop) because
-- it's a one-time cleanup of a known, closed list of trigger functions, not
-- an invariant that needs to hold for tables/functions created later.
REVOKE EXECUTE ON FUNCTION public.block_albaran_alteration()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_albaran_deletion()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lc_fichajes_chain_verify_after() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.push_on_item_estado()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.push_on_pedido_validated()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tpv_cobro_block_delete()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tpv_turno_assign_numero_z()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tpv_turno_auto_audit_events()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tpv_turno_before_insert()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tpv_turno_block_delete()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tpv_turno_block_update_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tpv_turno_evento_block_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tpv_turno_evento_block_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_fn_recalcular_cmp()     FROM PUBLIC, anon, authenticated;
