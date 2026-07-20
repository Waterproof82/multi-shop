-- T3: Add desglose_iva to tpv_cobros + rewrite tpv_cobro_before_insert for multi-rate IVA
-- Idempotent: ADD COLUMN IF NOT EXISTS
--
-- desglose_iva: JSONB array of {porcentaje, baseCents, ivaCents} per tax bracket.
--   NULL = legacy cobro (single rate, backward-compatible).
--
-- The trigger rewrite preserves:
--   - numero_ticket assignment (sequential per empresa, FOR UPDATE lock)
--   - hash_anterior + hash chain (sha256, RD 1619/2012 fiscal immutability)
--   - Legacy path when detalle_items IS NULL or empty
--
-- ROLLBACK SQL (save to re-apply prior trigger if needed):
-- ─────────────────────────────────────────────────────────
-- CREATE OR REPLACE FUNCTION public.tpv_cobro_before_insert()
-- RETURNS TRIGGER
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, extensions
-- AS $$
-- DECLARE
--   prev_row       RECORD;
--   importe_neto   INTEGER;
--   payload        TEXT;
-- BEGIN
--   SELECT numero_ticket, hash
--     INTO prev_row
--     FROM public.tpv_cobros
--    WHERE empresa_id = NEW.empresa_id
--    ORDER BY numero_ticket DESC
--    LIMIT 1
--    FOR UPDATE;
--   NEW.numero_ticket := COALESCE(prev_row.numero_ticket, 0) + 1;
--   NEW.hash_anterior := prev_row.hash;
--   importe_neto             := NEW.importe_cobrado_cents - NEW.propina_cents;
--   NEW.base_imponible_cents := ROUND(importe_neto::NUMERIC / (1 + NEW.iva_porcentaje / 100));
--   NEW.iva_cents            := importe_neto - NEW.base_imponible_cents;
--   payload := NEW.serie                                              || '|' ||
--              NEW.empresa_id::TEXT                                   || '|' ||
--              NEW.numero_ticket::TEXT                                || '|' ||
--              NEW.importe_cobrado_cents::TEXT                        || '|' ||
--              NEW.metodo_pago                                        || '|' ||
--              to_char(NEW.cobrado_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || '|' ||
--              COALESCE(NEW.hash_anterior, 'INICIO');
--   NEW.hash := encode(digest(payload, 'sha256'), 'hex');
--   RETURN NEW;
-- END;
-- $$;
-- ─────────────────────────────────────────────────────────

-- Step 1: Add desglose_iva column
ALTER TABLE public.tpv_cobros
  ADD COLUMN IF NOT EXISTS desglose_iva JSONB DEFAULT NULL;

-- Step 2: Rewrite tpv_cobro_before_insert to handle multi-rate IVA/IGIC
CREATE OR REPLACE FUNCTION public.tpv_cobro_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  prev_row        RECORD;
  item            JSONB;
  item_total      INTEGER;
  item_rate       NUMERIC(5,2);
  rates           JSONB   := '{}'::JSONB;
  rate_key        TEXT;
  rate_neto       INTEGER;
  bracket_base    INTEGER;
  bracket_iva     INTEGER;
  total_base      INTEGER := 0;
  total_iva       INTEGER := 0;
  desglose        JSONB   := '[]'::JSONB;
  importe_neto    INTEGER;
  payload         TEXT;
BEGIN
  -- ── 1. Numero ticket (sequential per empresa, locked to avoid races) ────────
  SELECT numero_ticket, hash
    INTO prev_row
    FROM public.tpv_cobros
   WHERE empresa_id = NEW.empresa_id
   ORDER BY numero_ticket DESC
   LIMIT 1
   FOR UPDATE;

  NEW.numero_ticket := COALESCE(prev_row.numero_ticket, 0) + 1;
  NEW.hash_anterior := prev_row.hash;

  -- ── 2. IVA/IGIC breakdown ──────────────────────────────────────────────────
  IF NEW.detalle_items IS NOT NULL AND jsonb_array_length(NEW.detalle_items) > 0 THEN
    -- Accumulate gross (price × qty) per tax bracket
    -- Each item: { nombre, cantidad, precioUnitarioCents, ivaPorcentaje? }
    -- ivaPorcentaje is optional; falls back to NEW.iva_porcentaje (company default)
    FOR item IN SELECT * FROM jsonb_array_elements(NEW.detalle_items) LOOP
      item_rate  := COALESCE(NULLIF(item->>'ivaPorcentaje', '')::NUMERIC, NEW.iva_porcentaje);
      item_total := COALESCE((item->>'cantidad')::INTEGER, 0) *
                    COALESCE((item->>'precioUnitarioCents')::INTEGER, 0);
      rate_key   := item_rate::TEXT;

      rates := jsonb_set(
        rates,
        ARRAY[rate_key],
        to_jsonb(COALESCE((rates->>rate_key)::INTEGER, 0) + item_total)
      );
    END LOOP;

    -- Compute base_imponible + iva per bracket
    FOR rate_key, rate_neto IN
      SELECT key, value::INTEGER FROM jsonb_each_text(rates)
    LOOP
      item_rate    := rate_key::NUMERIC;
      bracket_base := ROUND(rate_neto::NUMERIC / (1 + item_rate / 100));
      bracket_iva  := rate_neto - bracket_base;
      total_base   := total_base + bracket_base;
      total_iva    := total_iva  + bracket_iva;

      desglose := desglose || jsonb_build_array(
        jsonb_build_object(
          'porcentaje', item_rate,
          'baseCents',  bracket_base,
          'ivaCents',   bracket_iva
        )
      );
    END LOOP;

    NEW.desglose_iva         := desglose;
    NEW.base_imponible_cents := total_base;
    NEW.iva_cents            := total_iva;
    -- iva_porcentaje stays as-is (client-provided, used as primary/blended rate for legacy compat)

  ELSE
    -- Legacy path: single rate (no detalle_items or empty array)
    importe_neto             := NEW.importe_cobrado_cents - NEW.propina_cents;
    NEW.base_imponible_cents := ROUND(importe_neto::NUMERIC / (1 + NEW.iva_porcentaje / 100));
    NEW.iva_cents            := importe_neto - NEW.base_imponible_cents;
    NEW.desglose_iva         := NULL;
  END IF;

  -- ── 3. Hash chain (canonical payload — DO NOT change field order) ───────────
  payload := NEW.serie                                              || '|' ||
             NEW.empresa_id::TEXT                                   || '|' ||
             NEW.numero_ticket::TEXT                                || '|' ||
             NEW.importe_cobrado_cents::TEXT                        || '|' ||
             NEW.metodo_pago                                        || '|' ||
             to_char(NEW.cobrado_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || '|' ||
             COALESCE(NEW.hash_anterior, 'INICIO');

  NEW.hash := encode(digest(payload, 'sha256'), 'hex');

  RETURN NEW;
END;
$$;

-- Step 3: Update tpv_cobro_block_update to protect desglose_iva from mutation
CREATE OR REPLACE FUNCTION public.tpv_cobro_block_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF OLD.numero_ticket         <> NEW.numero_ticket         OR
     OLD.importe_cobrado_cents <> NEW.importe_cobrado_cents OR
     OLD.metodo_pago           <> NEW.metodo_pago           OR
     OLD.hash                  <> NEW.hash                  OR
     OLD.empresa_id            <> NEW.empresa_id            OR
     (OLD.desglose_iva IS DISTINCT FROM NEW.desglose_iva)   THEN
    RAISE EXCEPTION 'tpv_cobros: campos fiscales inmutables (RD 1619/2012)';
  END IF;
  RETURN NEW;
END;
$$;
