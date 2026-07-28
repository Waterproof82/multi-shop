-- GAP-002: audit_log insert en cobro/route.ts era fire & forget (void).
-- Un fallo del insert dejaba un cobro sin trail de auditoría.
-- Fix: trigger AFTER INSERT en tpv_cobros → insert en audit_log dentro de la
-- misma transacción, garantizando ACID. Si el insert en audit_log falla, el
-- cobro hace rollback automáticamente.
-- Norma: Ley 11/2021 / SIALTI.

CREATE OR REPLACE FUNCTION tpv_cobro_audit_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
BEGIN
  INSERT INTO public.audit_log (
    empresa_id,
    actor_id,
    actor_tipo,
    actor_nombre,
    action,
    payload
  ) VALUES (
    NEW.empresa_id,
    NULL,
    'system',
    'tpv_cobro_trigger',
    'tpv.cobro.completar',
    jsonb_build_object(
      'turno_id',              NEW.turno_id,
      'numero_ticket',         NEW.numero_ticket,
      'importe_cobrado_cents', NEW.importe_cobrado_cents,
      'metodo_pago',           NEW.metodo_pago,
      'hash',                  NEW.hash
    )
  );
  RETURN NEW;
END;
$$;

-- Solo service_role debe poder ejecutar esta función (llamada por el trigger, no directamente)
REVOKE EXECUTE ON FUNCTION tpv_cobro_audit_after_insert() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION tpv_cobro_audit_after_insert() TO service_role;

CREATE TRIGGER tpv_cobro_audit_trigger
  AFTER INSERT ON public.tpv_cobros
  FOR EACH ROW
  EXECUTE FUNCTION tpv_cobro_audit_after_insert();

COMMENT ON TRIGGER tpv_cobro_audit_trigger ON public.tpv_cobros
  IS 'Ley 11/2021 / SIALTI — audit_log atómico: si falla el insert, el cobro revierte.';
