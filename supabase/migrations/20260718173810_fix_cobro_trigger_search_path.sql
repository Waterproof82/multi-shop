-- Fix: tpv_cobro_before_insert trigger needs 'extensions' in search_path
-- so that pgcrypto's digest() function is resolvable at runtime.

CREATE OR REPLACE FUNCTION public.tpv_cobro_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  prev_row       RECORD;
  importe_neto   INTEGER;
  payload        TEXT;
BEGIN
  SELECT numero_ticket, hash
    INTO prev_row
    FROM public.tpv_cobros
   WHERE empresa_id = NEW.empresa_id
   ORDER BY numero_ticket DESC
   LIMIT 1
   FOR UPDATE;

  NEW.numero_ticket := COALESCE(prev_row.numero_ticket, 0) + 1;
  NEW.hash_anterior := prev_row.hash;

  importe_neto             := NEW.importe_cobrado_cents - NEW.propina_cents;
  NEW.base_imponible_cents := ROUND(importe_neto::NUMERIC / (1 + NEW.iva_porcentaje / 100));
  NEW.iva_cents            := importe_neto - NEW.base_imponible_cents;

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
