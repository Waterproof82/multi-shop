-- Task 18 (revisión final de recogida/domicilio en tienda): cierra dos
-- hallazgos de la review sobre `20260913000001_modalidades_entrega.sql`.
--
-- I3 — la policy UPDATE no tenía WITH CHECK, inconsistente con el resto de
-- tablas del repo (ver ingredientes/tpv_turnos): sin WITH CHECK, PostgREST
-- podría en teoría mover una fila a otro `empresa_id` (el USING solo filtra
-- las filas visibles ANTES del update, no valida el valor final).
--
-- I4 — la FK `pedidos.modalidad_entrega_id` no tenía ON DELETE: como
-- `pedidos` es imborrable por retención fiscal (Art.66 LGT, trigger
-- `pedidos_no_delete`), en cuanto una modalidad recibe su primer pedido
-- queda imborrable para siempre (el DELETE de la fila padre fallaría por la
-- FK). Se corrige a ON DELETE SET NULL: el pedido histórico sobrevive sin la
-- referencia a una modalidad que ya no existe.
--
-- Nombre real de la constraint verificado en vivo antes de escribir este
-- DROP (no asumido por convención):
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.pedidos'::regclass AND contype = 'f';
--   -> pedidos_modalidad_entrega_id_fkey
--      FOREIGN KEY (modalidad_entrega_id) REFERENCES modalidades_entrega(id)
-- Coincide con el nombre que Postgres genera por convención
-- (<tabla>_<columna>_fkey) para esta FK sin nombre explícito.

-- I3
DROP POLICY "Admin actualiza modalidades_entrega" ON public.modalidades_entrega;
CREATE POLICY "Admin actualiza modalidades_entrega"
  ON public.modalidades_entrega FOR UPDATE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()))
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));

-- I4
ALTER TABLE public.pedidos DROP CONSTRAINT pedidos_modalidad_entrega_id_fkey;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_modalidad_entrega_id_fkey
  FOREIGN KEY (modalidad_entrega_id) REFERENCES public.modalidades_entrega(id) ON DELETE SET NULL;
