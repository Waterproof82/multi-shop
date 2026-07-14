-- ============================================================
-- Migration: 20260714000003_tpv_numero_z_detalle_items
-- RD 1619/2012: Informe Z (numero_z) + desglose de ítems (detalle_items)
-- ============================================================

-- ─── 1. numero_z en tpv_turnos ───────────────────────────────────────────────

ALTER TABLE public.tpv_turnos
  ADD COLUMN IF NOT EXISTS numero_z BIGINT;

-- Trigger BEFORE UPDATE: asigna el siguiente numero_z al cerrar el turno.
-- Nombre 'tpv_turno_assign_z' garantiza orden alfabético ANTES de
-- 'tpv_turno_no_update_fields', así que numero_z se asigna primero
-- y el segundo trigger no lo bloquea.
CREATE OR REPLACE FUNCTION tpv_turno_assign_numero_z()
RETURNS TRIGGER AS $$
DECLARE
  next_z BIGINT;
BEGIN
  -- Solo asignar al cerrar (cierre_at pasa de NULL a NOT NULL) y si aún no tiene Z
  IF OLD.cierre_at IS NULL AND NEW.cierre_at IS NOT NULL AND NEW.numero_z IS NULL THEN
    SELECT COALESCE(MAX(numero_z), 0) + 1
      INTO next_z
      FROM public.tpv_turnos
     WHERE empresa_id = NEW.empresa_id
       FOR UPDATE;
    NEW.numero_z := next_z;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop first to avoid conflicts on re-run
DROP TRIGGER IF EXISTS tpv_turno_assign_z ON public.tpv_turnos;

CREATE TRIGGER tpv_turno_assign_z
  BEFORE UPDATE ON public.tpv_turnos
  FOR EACH ROW EXECUTE FUNCTION tpv_turno_assign_numero_z();

-- ─── 2. detalle_items en tpv_cobros ──────────────────────────────────────────

ALTER TABLE public.tpv_cobros
  ADD COLUMN IF NOT EXISTS detalle_items JSONB;

-- Reemplazar la función de inmutabilidad para proteger también detalle_items.
-- IS DISTINCT FROM es NULL-safe (necesario porque detalle_items es nullable).
CREATE OR REPLACE FUNCTION tpv_cobro_block_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.numero_ticket <> NEW.numero_ticket OR
     OLD.importe_cobrado_cents <> NEW.importe_cobrado_cents OR
     OLD.metodo_pago <> NEW.metodo_pago OR
     OLD.hash <> NEW.hash OR
     OLD.empresa_id <> NEW.empresa_id OR
     OLD.detalle_items IS DISTINCT FROM NEW.detalle_items THEN
    RAISE EXCEPTION 'tpv_cobros: campos fiscales inmutables (RD 1619/2012)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: the trigger tpv_cobro_block_update already exists on tpv_cobros.
-- CREATE OR REPLACE FUNCTION above updates the function body in place.
-- No need to recreate the trigger.
