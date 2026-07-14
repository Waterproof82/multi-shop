-- ─── Tabla de eventos inalterables (GAP-2) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tpv_turno_eventos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id    UUID        NOT NULL REFERENCES public.tpv_turnos(id)  ON DELETE RESTRICT,
  empresa_id  UUID        NOT NULL REFERENCES public.empresas(id)    ON DELETE RESTRICT,
  tipo_evento TEXT        NOT NULL CHECK (tipo_evento IN (
    'apertura',
    'cierre',
    'entrada_caja',
    'salida_caja',
    'apertura_cajon_sin_venta',
    'arqueo_parcial',
    'descuadre'
  )),
  empleado_id UUID,           -- auth.users UUID o empleados_tpv UUID, nullable
  monto_cents INTEGER,        -- NULL para eventos sin movimiento de efectivo
  descripcion TEXT,           -- Obligatorio para entrada_caja / salida_caja
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tpv_turno_eventos_turno
  ON public.tpv_turno_eventos (turno_id);

-- ─── Inalterabilidad total del audit trail ───────────────────────────────────
CREATE OR REPLACE FUNCTION tpv_turno_evento_block_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'tpv_turno_eventos: DELETE no permitido (SIALTI audit trail)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tpv_turno_evento_no_delete
  BEFORE DELETE ON public.tpv_turno_eventos
  FOR EACH ROW EXECUTE FUNCTION tpv_turno_evento_block_delete();

CREATE OR REPLACE FUNCTION tpv_turno_evento_block_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'tpv_turno_eventos: UPDATE no permitido (SIALTI audit trail)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tpv_turno_evento_no_update
  BEFORE UPDATE ON public.tpv_turno_eventos
  FOR EACH ROW EXECUTE FUNCTION tpv_turno_evento_block_update();

-- ─── Auditoría automática desde tpv_turnos (GAP-2 — atomicidad garantizada) ──
-- Este trigger corre en la MISMA transacción que el INSERT/UPDATE de tpv_turnos.
-- Si falla, el cambio de estado del turno también se revierte. Sin silent failures.
--
-- Evento 'apertura'  → AFTER INSERT en tpv_turnos
-- Evento 'cierre'    → AFTER UPDATE cuando cierre_at pasa de NULL a NOT NULL
-- Evento 'descuadre' → ídem, si diferencia_cents <> 0
--
-- empleado_cierre_id viene de la columna homónima de tpv_turnos (seteada por la app
-- al hacer el UPDATE de cierre), así el trigger sabe quién cerró el turno.
CREATE OR REPLACE FUNCTION tpv_turno_auto_audit_events()
RETURNS TRIGGER AS $$
BEGIN
  -- ── Apertura ─────────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.tpv_turno_eventos
      (turno_id, empresa_id, tipo_evento, empleado_id, monto_cents, descripcion)
    VALUES (
      NEW.id,
      NEW.empresa_id,
      'apertura',
      COALESCE(NEW.operador_id, NEW.user_id),
      NEW.efectivo_apertura_cents,
      'Apertura de turno. Fondo inicial: ' || NEW.efectivo_apertura_cents || ' cts.'
    );
  END IF;

  -- ── Cierre (y descuadre si aplica) ───────────────────────────────────────
  IF TG_OP = 'UPDATE' AND OLD.cierre_at IS NULL AND NEW.cierre_at IS NOT NULL THEN
    INSERT INTO public.tpv_turno_eventos
      (turno_id, empresa_id, tipo_evento, empleado_id, monto_cents, descripcion)
    VALUES (
      NEW.id,
      NEW.empresa_id,
      'cierre',
      NEW.empleado_cierre_id,
      NEW.efectivo_cierre_cents,
      'Cierre de turno. Declarado: ' || COALESCE(NEW.efectivo_cierre_cents::TEXT, '0') ||
      ' cts. Teórico: ' || COALESCE(NEW.efectivo_cierre_teorico_cents::TEXT, '0') || ' cts.'
    );

    IF COALESCE(NEW.diferencia_cents, 0) <> 0 THEN
      INSERT INTO public.tpv_turno_eventos
        (turno_id, empresa_id, tipo_evento, empleado_id, monto_cents, descripcion)
      VALUES (
        NEW.id,
        NEW.empresa_id,
        'descuadre',
        NEW.empleado_cierre_id,
        NEW.diferencia_cents,
        'Descuadre de ' || NEW.diferencia_cents || ' cts detectado al cierre.'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tpv_turno_audit_trigger
  AFTER INSERT OR UPDATE ON public.tpv_turnos
  FOR EACH ROW EXECUTE FUNCTION tpv_turno_auto_audit_events();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.tpv_turno_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to tpv_turno_eventos"
  ON public.tpv_turno_eventos FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve tpv_turno_eventos"
  ON public.tpv_turno_eventos FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

-- INSERT solo via service_role (triggers de DB y rutas de API backend).
-- Sin política INSERT para authenticated — el audit trail no se escribe desde el cliente.
-- La excepción son los movimientos manuales (entrada_caja/salida_caja) que van por API route.
CREATE POLICY "Admin registra movimientos manuales de caja"
  ON public.tpv_turno_eventos FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id = get_mi_empresa_id()
    AND tipo_evento IN ('entrada_caja', 'salida_caja', 'apertura_cajon_sin_venta', 'arqueo_parcial')
  );

-- ─── GRANTs ──────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON public.tpv_turno_eventos TO service_role;
GRANT SELECT, INSERT ON public.tpv_turno_eventos TO authenticated;
