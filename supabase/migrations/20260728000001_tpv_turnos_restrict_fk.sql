-- GAP-006: tpv_turnos.empresa_id tenía ON DELETE CASCADE, lo que permite
-- borrar turnos fiscales si se elimina la empresa mediante una ruta no controlada
-- por el trigger tpv_turno_no_delete.
-- Fix: cambiar a ON DELETE RESTRICT para bloquear la eliminación en cualquier ruta.
-- Norma: Ley 11/2021 / SIALTI — inalterabilidad de registros fiscales.

ALTER TABLE public.tpv_turnos
  DROP CONSTRAINT tpv_turnos_empresa_id_fkey;

ALTER TABLE public.tpv_turnos
  ADD CONSTRAINT tpv_turnos_empresa_id_fkey
  FOREIGN KEY (empresa_id)
  REFERENCES public.empresas(id)
  ON DELETE RESTRICT;
