-- pgcrypto ya habilitado en 20260703000001.

-- ─── Columnas nuevas ─────────────────────────────────────────────────────────
ALTER TABLE public.tpv_turnos
  ADD COLUMN IF NOT EXISTS hash_encadenado               TEXT,
  ADD COLUMN IF NOT EXISTS efectivo_cierre_teorico_cents INTEGER,
  ADD COLUMN IF NOT EXISTS empleado_cierre_id            UUID;

-- ─── Hash chaining BEFORE INSERT (GAP-3) ─────────────────────────────────────
-- Encadena: empresa_id | nuevo_id | efectivo_apertura | apertura_at | hash_anterior
-- El primer turno de cada empresa arranca la cadena con 'INICIO'.
CREATE OR REPLACE FUNCTION tpv_turno_before_insert()
RETURNS TRIGGER AS $$
DECLARE
  prev_hash TEXT;
  payload   TEXT;
BEGIN
  SELECT hash_encadenado INTO prev_hash
    FROM public.tpv_turnos
   WHERE empresa_id = NEW.empresa_id
   ORDER BY apertura_at DESC
   LIMIT 1;

  payload :=
    NEW.empresa_id::TEXT                                              || '|' ||
    NEW.id::TEXT                                                      || '|' ||
    NEW.efectivo_apertura_cents::TEXT                                 || '|' ||
    to_char(NEW.apertura_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')          || '|' ||
    COALESCE(prev_hash, 'INICIO');

  NEW.hash_encadenado := encode(digest(payload, 'sha256'), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tpv_turno_hash_insert
  BEFORE INSERT ON public.tpv_turnos
  FOR EACH ROW EXECUTE FUNCTION tpv_turno_before_insert();

-- ─── No-DELETE (GAP-1) ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tpv_turno_block_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'tpv_turnos: DELETE no permitido (SIALTI / Ley 11/2021)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tpv_turno_no_delete
  BEFORE DELETE ON public.tpv_turnos
  FOR EACH ROW EXECUTE FUNCTION tpv_turno_block_delete();

-- ─── Inmutabilidad de campos de apertura + bloqueo post-cierre (GAP-4) ───────
-- Dos reglas en un solo trigger:
--   1. Si el turno ya está cerrado → bloquear cualquier UPDATE.
--   2. Si el turno está abierto → proteger los campos de la instantánea de apertura.
--      Los acumuladores (total_efectivo_cents, total_tarjeta_cents) sí pueden cambiar.
CREATE OR REPLACE FUNCTION tpv_turno_block_update_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Regla 1: turno cerrado → nada puede cambiar
  IF OLD.cierre_at IS NOT NULL THEN
    RAISE EXCEPTION 'tpv_turnos: turno cerrado, no se puede modificar (SIALTI / Ley 11/2021)';
  END IF;

  -- Regla 2: turno abierto → los campos de apertura son inmutables desde el primer segundo
  IF OLD.efectivo_apertura_cents IS DISTINCT FROM NEW.efectivo_apertura_cents OR
     OLD.hash_encadenado         IS DISTINCT FROM NEW.hash_encadenado         OR
     OLD.apertura_at             IS DISTINCT FROM NEW.apertura_at             OR
     OLD.empresa_id              IS DISTINCT FROM NEW.empresa_id              OR
     OLD.user_id                 IS DISTINCT FROM NEW.user_id                 OR
     OLD.operador_id             IS DISTINCT FROM NEW.operador_id             OR
     OLD.operador_nombre         IS DISTINCT FROM NEW.operador_nombre         THEN
    RAISE EXCEPTION 'tpv_turnos: los campos de apertura son inmutables (SIALTI / Ley 11/2021)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tpv_turno_no_update_fields
  BEFORE UPDATE ON public.tpv_turnos
  FOR EACH ROW EXECUTE FUNCTION tpv_turno_block_update_fields();
