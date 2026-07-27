-- Migration: 20260729000002_tpv_cobros_verifactu_qr.sql
-- Purpose:
--   1. Add verifactu_qr_url TEXT column to tpv_cobros (nullable — NULL when empresa has no NIF).
--   2. Extend tpv_cobro_before_insert() to compute and persist verifactu_qr_url atomically.
--   3. Extend tpv_cobro_block_update() to enforce immutability of verifactu_qr_url.
--
-- numserie format: T000042 (no hyphen) per RD 1007/2023 Anexo II {serie}{numero_6digits}.
-- QR URL is set after step 3 (hash chain) so numero_ticket is already assigned.
-- NULL NIF → NULL verifactu_qr_url (graceful: IGIC empresas or test setups without NIF).
-- search_path: public, extensions, pg_catalog — required so pgcrypto's digest() resolves.

-- Step 1: Add column
ALTER TABLE public.tpv_cobros
  ADD COLUMN IF NOT EXISTS verifactu_qr_url TEXT;

-- Step 2: Extend tpv_cobro_before_insert to add QR URL computation after hash chain
-- Full CREATE OR REPLACE — preserves all existing steps exactly, adds step 4.
CREATE OR REPLACE FUNCTION public.tpv_cobro_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
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
  -- QR URL variables (step 4)
  v_nif           TEXT;
  v_numserie      TEXT;
  v_fecha         TEXT;
  v_importe       TEXT;
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

  -- ── 4. VeriFactu QR URL (Art. 12 RD 1007/2023 — No-VeriFactu mode) ─────────
  -- Requires numero_ticket (step 1) to already be set.
  -- numserie format: T000042 (no hyphen per AEAT ValidarQR spec Anexo II).
  -- NULL NIF → NULL verifactu_qr_url (graceful for IGIC empresas or test setups).
  SELECT nif INTO v_nif FROM public.empresas WHERE id = NEW.empresa_id;

  IF v_nif IS NOT NULL THEN
    v_numserie := NEW.serie || lpad(NEW.numero_ticket::TEXT, 6, '0');
    v_fecha    := to_char(COALESCE(NEW.cobrado_at, now()), 'DD-MM-YYYY');
    v_importe  := to_char(NEW.importe_cobrado_cents::NUMERIC / 100, 'FM999999990.00');

    NEW.verifactu_qr_url :=
      'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR' ||
      '?nif='      || v_nif      ||
      '&numserie=' || v_numserie ||
      '&fecha='    || v_fecha    ||
      '&importe='  || v_importe;
  ELSE
    NEW.verifactu_qr_url := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Step 3: Extend tpv_cobro_block_update to protect verifactu_qr_url from mutation
-- Follows the same DISTINCT FROM pattern as desglose_iva (added in 20260720100003).
CREATE OR REPLACE FUNCTION public.tpv_cobro_block_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
BEGIN
  IF OLD.numero_ticket         <> NEW.numero_ticket         OR
     OLD.importe_cobrado_cents <> NEW.importe_cobrado_cents OR
     OLD.metodo_pago           <> NEW.metodo_pago           OR
     OLD.hash                  <> NEW.hash                  OR
     OLD.empresa_id            <> NEW.empresa_id            OR
     (OLD.desglose_iva IS DISTINCT FROM NEW.desglose_iva)   OR
     (OLD.verifactu_qr_url IS DISTINCT FROM NEW.verifactu_qr_url) THEN
    RAISE EXCEPTION 'tpv_cobros: campos fiscales inmutables (RD 1619/2012)';
  END IF;
  RETURN NEW;
END;
$$;
