-- pgcrypto for SHA-256 hash chaining (Verifactu inalterabilidad)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── tpv_cobros ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tpv_cobros (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID         NOT NULL REFERENCES public.empresas(id)      ON DELETE RESTRICT,
  turno_id              UUID         NOT NULL REFERENCES public.tpv_turnos(id)    ON DELETE RESTRICT,
  sesion_id             UUID                  REFERENCES public.mesa_sesiones(id) ON DELETE RESTRICT,
  numero_ticket         BIGINT       NOT NULL,
  serie                 TEXT         NOT NULL DEFAULT 'T',
  metodo_pago           TEXT         NOT NULL CHECK (metodo_pago IN ('efectivo','tarjeta')),
  importe_cobrado_cents INTEGER      NOT NULL,
  propina_cents         INTEGER      NOT NULL DEFAULT 0,
  iva_porcentaje        NUMERIC(5,2) NOT NULL DEFAULT 10,
  base_imponible_cents  INTEGER      NOT NULL DEFAULT 0,
  iva_cents             INTEGER      NOT NULL DEFAULT 0,
  hash_anterior         TEXT,
  hash                  TEXT         NOT NULL DEFAULT '',
  cobrado_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),

  UNIQUE (empresa_id, numero_ticket)
);

CREATE INDEX IF NOT EXISTS idx_tpv_cobros_empresa  ON public.tpv_cobros (empresa_id);
CREATE INDEX IF NOT EXISTS idx_tpv_cobros_turno    ON public.tpv_cobros (turno_id);

-- ─── Hash chaining trigger ────────────────────────────────────────────────────
-- Runs BEFORE INSERT: assigns numero_ticket, hash_anterior, hash, IVA breakdown.
CREATE OR REPLACE FUNCTION tpv_cobro_before_insert()
RETURNS TRIGGER AS $$
DECLARE
  prev_hash      TEXT;
  next_num       BIGINT;
  importe_neto   INTEGER;
  payload        TEXT;
BEGIN
  -- Correlative number per empresa (locked to avoid races)
  SELECT COALESCE(MAX(numero_ticket), 0) + 1
    INTO next_num
    FROM public.tpv_cobros
   WHERE empresa_id = NEW.empresa_id
     FOR UPDATE;

  NEW.numero_ticket := next_num;

  -- Previous hash for chaining
  SELECT hash INTO prev_hash
    FROM public.tpv_cobros
   WHERE empresa_id = NEW.empresa_id
   ORDER BY numero_ticket DESC
   LIMIT 1;

  NEW.hash_anterior := prev_hash;

  -- IVA breakdown: propina is exempt; iva_porcentaje is stored on the row
  importe_neto              := NEW.importe_cobrado_cents - NEW.propina_cents;
  NEW.base_imponible_cents  := ROUND(importe_neto::NUMERIC / (1 + NEW.iva_porcentaje / 100));
  NEW.iva_cents             := importe_neto - NEW.base_imponible_cents;

  -- Canonical payload for SHA-256 (order is fixed — DO NOT change)
  payload := NEW.serie                                          || '|' ||
             NEW.empresa_id::TEXT                              || '|' ||
             next_num::TEXT                                    || '|' ||
             NEW.importe_cobrado_cents::TEXT                   || '|' ||
             NEW.metodo_pago                                   || '|' ||
             to_char(NEW.cobrado_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || '|' ||
             COALESCE(prev_hash, 'INICIO');

  NEW.hash := encode(digest(payload, 'sha256'), 'hex');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tpv_cobro_hash_insert
  BEFORE INSERT ON public.tpv_cobros
  FOR EACH ROW EXECUTE FUNCTION tpv_cobro_before_insert();

-- ─── No-delete trigger (inalterabilidad fiscal) ───────────────────────────────
CREATE OR REPLACE FUNCTION tpv_cobro_block_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'tpv_cobros: DELETE no permitido (cumplimiento fiscal RD 1619/2012)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tpv_cobro_no_delete
  BEFORE DELETE ON public.tpv_cobros
  FOR EACH ROW EXECUTE FUNCTION tpv_cobro_block_delete();

-- ─── No-update of immutable fields ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION tpv_cobro_block_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.numero_ticket         <> NEW.numero_ticket         OR
     OLD.importe_cobrado_cents <> NEW.importe_cobrado_cents OR
     OLD.metodo_pago           <> NEW.metodo_pago           OR
     OLD.hash                  <> NEW.hash                  OR
     OLD.empresa_id            <> NEW.empresa_id            THEN
    RAISE EXCEPTION 'tpv_cobros: campos fiscales inmutables (RD 1619/2012)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tpv_cobro_no_update_critical
  BEFORE UPDATE ON public.tpv_cobros
  FOR EACH ROW EXECUTE FUNCTION tpv_cobro_block_update();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.tpv_cobros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to tpv_cobros"
  ON public.tpv_cobros FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve sus cobros"
  ON public.tpv_cobros FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin registra cobros"
  ON public.tpv_cobros FOR INSERT TO authenticated
  WITH CHECK (empresa_id = get_mi_empresa_id());

-- No UPDATE / DELETE policies for authenticated — triggers enforce it at DB level.

-- ─── GRANTs ───────────────────────────────────────────────────────────────────
-- service_role bypasses RLS but still needs explicit table grant
GRANT SELECT, INSERT ON public.tpv_cobros TO service_role;
GRANT SELECT, INSERT ON public.tpv_cobros TO authenticated;
