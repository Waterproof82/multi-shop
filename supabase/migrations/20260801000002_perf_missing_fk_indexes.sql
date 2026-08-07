-- Performance: índices faltantes detectados por el advisor `unindexed_foreign_keys`
-- y por el patrón real de consulta del código.
--
-- NOTA sobre CONCURRENTLY: no se usa porque las migraciones corren dentro de una
-- transacción y CREATE INDEX CONCURRENTLY no lo permite. Las tablas afectadas son
-- pequeñas hoy (pedidos ~400 filas, mesas ~20, tpv_turnos ~20, movimientos_stock ~80),
-- así que el lock es despreciable. Si alguna crece mucho antes de aplicar esto,
-- crear el índice a mano con CONCURRENTLY fuera de migración.

-- ── 1. tpv_cobros.sesion_id ──────────────────────────────────────────────────
-- El más importante de este lote: está en el camino crítico del cierre de cuenta.
-- `src/app/tpv/cobro/[sesionId]/page.tsx` y `src/app/api/tpv/pedidos/route.ts`
-- filtran por sesion_id, y hoy eso es un seq scan. La tabla no se purga nunca
-- (integridad fiscal), así que el escaneo crece con cada ticket emitido.
CREATE INDEX IF NOT EXISTS idx_tpv_cobros_sesion
  ON public.tpv_cobros (sesion_id);

-- ── 2. mesas.sesion_id ───────────────────────────────────────────────────────
-- Ojo: ya existe `mesas_one_active_sesion`, pero es UNIQUE sobre (id) con un
-- WHERE sobre sesion_id — indexa `id`, NO `sesion_id`. No sirve para buscar por
-- sesión ni para el chequeo de la FK. Parcial porque una mesa libre tiene NULL.
CREATE INDEX IF NOT EXISTS idx_mesas_sesion
  ON public.mesas (sesion_id)
  WHERE sesion_id IS NOT NULL;

-- ── 3. mesa_sesiones.custom_turno_id ─────────────────────────────────────────
-- Parcial: sólo las sesiones con turno personalizado tienen valor.
CREATE INDEX IF NOT EXISTS idx_mesa_sesiones_custom_turno
  ON public.mesa_sesiones (custom_turno_id)
  WHERE custom_turno_id IS NOT NULL;

-- ── 4/5. tpv_turnos.operador_id / user_id ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tpv_turnos_operador
  ON public.tpv_turnos (operador_id)
  WHERE operador_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tpv_turnos_user
  ON public.tpv_turnos (user_id)
  WHERE user_id IS NOT NULL;

-- ── 6. pedidos.codigo_descuento_id ───────────────────────────────────────────
-- Parcial: la gran mayoría de pedidos no llevan código de descuento.
CREATE INDEX IF NOT EXISTS idx_pedidos_codigo_descuento
  ON public.pedidos (codigo_descuento_id)
  WHERE codigo_descuento_id IS NOT NULL;

-- ── 7. movimientos_stock (empresa_id, created_at DESC) ───────────────────────
-- `findMovimientos` filtra por empresa_id Y ordena por created_at DESC en la
-- misma query. Hoy hay dos índices sueltos (idx_movimientos_stock_empresa e
-- idx_movimientos_stock_created), lo que obliga a un bitmap AND + sort. El
-- compuesto permite resolver filtro y orden con un solo recorrido del índice.
-- Los sueltos se dejan: `created_at` sola aún sirve a consultas cross-tenant
-- de mantenimiento, y borrarlos no aporta a este objetivo.
CREATE INDEX IF NOT EXISTS idx_movimientos_stock_empresa_created
  ON public.movimientos_stock (empresa_id, created_at DESC);
