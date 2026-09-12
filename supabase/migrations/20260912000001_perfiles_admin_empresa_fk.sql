-- Agrega la FK faltante perfiles_admin.empresa_id -> empresas.id.
--
-- Sin esta FK, perfiles_admin.empresa_id no tenia integridad referencial
-- (podia apuntar a una empresa borrada) y PostgREST no podia armar el
-- embedding automatico (`.select("*, empresas(*)")`), obligando a
-- SupabaseAdminRepository.findById a hacer dos round-trips secuenciales
-- (perfiles_admin, despues empresas). Con trafico sostenido de timeouts de
-- fondo en PostgREST (Warp "Thread killed by timeout manager", ~1300/dia),
-- dos round-trips duplican la ventana en la que un login real puede pisar
-- uno de esos timeouts y devolver Gateway Timeout al cliente (Sentry
-- 90fa6dffe0094f988d362627afa71f47, 2026-09-11).
--
-- Verificado antes de aplicar: 0 filas huerfanas (empresa_id no nulo sin
-- match en empresas.id).
ALTER TABLE public.perfiles_admin
  ADD CONSTRAINT perfiles_admin_empresa_id_fkey
  FOREIGN KEY (empresa_id) REFERENCES public.empresas(id);
