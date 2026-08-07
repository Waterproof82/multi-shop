-- Permitir la purga de pedidos de prueba, sin abrir la puerta a borrar
-- registros fiscales reales.
--
-- El trigger `pedidos_block_delete` era un RAISE incondicional. Se sustituye por
-- una excepción estrecha, con tres barreras acumulativas y traza de auditoría:
--   1. Solo pasan las filas con `es_prueba = true`, flag que se fija en el
--      INSERT y es inmutable (ver 20260801000004).
--   2. Aunque esté marcada como prueba, si llegó a generar un cobro entonces se
--      emitió un documento fiscal y el borrado se bloquea igualmente.
--   3. Todo borrado que pase queda registrado en `pedidos_prueba_purga_log`,
--      que es de solo inserción — mismo criterio que `rgpd_purge_log`: si algún
--      día la AEAT pregunta, hay que poder demostrar QUÉ se borró y cuándo.

-- ── 1. Log de purga ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pedidos_prueba_purga_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id      uuid        NOT NULL,
  empresa_id     uuid        NOT NULL,
  numero_pedido  integer,
  total          numeric,
  pedido_creado  timestamptz,
  purgado_at     timestamptz NOT NULL DEFAULT now(),
  purgado_por    text        NOT NULL DEFAULT current_user
);

COMMENT ON TABLE public.pedidos_prueba_purga_log IS
  'Traza de solo inserción de los pedidos de prueba borrados. Evidencia de que la '
  'excepción al Art.66 LGT solo se aplicó a datos sintéticos.';

CREATE INDEX IF NOT EXISTS idx_pedidos_prueba_purga_log_empresa
  ON public.pedidos_prueba_purga_log (empresa_id, purgado_at DESC);

ALTER TABLE public.pedidos_prueba_purga_log ENABLE ROW LEVEL SECURITY;

-- RESTRICTIVE (no PERMISSIVE): se combina con AND, así que ninguna policy
-- permisiva añadida después puede anularla. Ver docs/context/security.md.
DROP POLICY IF EXISTS "No direct anon access to pedidos_prueba_purga_log" ON public.pedidos_prueba_purga_log;
CREATE POLICY "No direct anon access to pedidos_prueba_purga_log"
  ON public.pedidos_prueba_purga_log AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

-- TO authenticated explícito, nunca omitido: el default es `public`, que
-- incluye anon. Solo lectura, y aislado por empresa.
DROP POLICY IF EXISTS "Admin ve pedidos_prueba_purga_log" ON public.pedidos_prueba_purga_log;
CREATE POLICY "Admin ve pedidos_prueba_purga_log"
  ON public.pedidos_prueba_purga_log FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

-- Sin estos GRANT la tabla es inaccesible: desde el 2026-07-31 `public` ya no
-- otorga privilegios por defecto en el esquema (ver security.md).
GRANT SELECT, INSERT ON public.pedidos_prueba_purga_log TO service_role;
GRANT SELECT                ON public.pedidos_prueba_purga_log TO authenticated;

-- Inmutable: el log de una purga no se edita ni se borra.
CREATE OR REPLACE FUNCTION public.pedidos_prueba_purga_log_inmutable()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  RAISE EXCEPTION 'pedidos_prueba_purga_log es de solo inserción';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pedidos_prueba_purga_log_inmutable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pedidos_prueba_purga_log_inmutable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.pedidos_prueba_purga_log_inmutable() FROM authenticated;

DROP TRIGGER IF EXISTS pedidos_prueba_purga_log_no_update ON public.pedidos_prueba_purga_log;
CREATE TRIGGER pedidos_prueba_purga_log_no_update
  BEFORE UPDATE OR DELETE ON public.pedidos_prueba_purga_log
  FOR EACH ROW EXECUTE FUNCTION public.pedidos_prueba_purga_log_inmutable();

-- ── 2. Trigger de borrado con excepción estrecha ─────────────────────────────
CREATE OR REPLACE FUNCTION public.pedidos_block_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  -- Barrera 1: el caso normal. Un pedido real nunca se borra.
  IF NOT OLD.es_prueba THEN
    RAISE EXCEPTION
      'pedidos: DELETE no permitido (Art.66 LGT — retención fiscal mínima 5 años)';
  END IF;

  -- Barrera 2: marcado como prueba pero con cobro emitido. Si existe documento
  -- fiscal, la naturaleza "de prueba" del pedido es irrelevante: se conserva.
  IF OLD.sesion_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tpv_cobros c WHERE c.sesion_id = OLD.sesion_id
  ) THEN
    RAISE EXCEPTION
      'pedidos: DELETE bloqueado — el pedido % tiene cobros asociados (documento fiscal emitido)',
      OLD.id;
  END IF;

  -- Barrera 3: dejar constancia de lo que se borra.
  INSERT INTO public.pedidos_prueba_purga_log
    (pedido_id, empresa_id, numero_pedido, total, pedido_creado)
  VALUES
    (OLD.id, OLD.empresa_id, OLD.numero_pedido, OLD.total, OLD.created_at);

  RETURN OLD;
END;
$$;

-- ── 3. Función de purga en lote ──────────────────────────────────────────────
-- Para el teardown de los tests y para limpieza manual. Devuelve cuántas filas
-- borró. El DELETE sigue pasando por el trigger de arriba, así que las barreras
-- se aplican también aquí — esta función es una comodidad, no un atajo.
CREATE OR REPLACE FUNCTION public.purge_pedidos_prueba(p_empresa_id uuid DEFAULT NULL)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  v_borrados integer;
BEGIN
  DELETE FROM public.pedidos
  WHERE es_prueba
    AND (p_empresa_id IS NULL OR empresa_id = p_empresa_id);
  GET DIAGNOSTICS v_borrados = ROW_COUNT;
  RETURN v_borrados;
END;
$$;

-- Solo el backend. Sin estos REVOKE la función quedaría expuesta en
-- /rest/v1/rpc/purge_pedidos_prueba para cualquier cliente anónimo.
REVOKE EXECUTE ON FUNCTION public.purge_pedidos_prueba(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_pedidos_prueba(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.purge_pedidos_prueba(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_pedidos_prueba(uuid) TO service_role;
